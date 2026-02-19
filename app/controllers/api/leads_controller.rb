module Api
  class LeadsController < BaseController
    def index
      leads = current_organization.leads.includes(:social_profiles, :tuning_feedback).order(created_at: :desc)
      render json: {
        leads: leads.map { |lead| serialize_lead(lead) },
        ai_category_options: Lead::AI_CATEGORY_VALUES
      }
    end

    def show
      lead = current_organization.leads.includes(:social_profiles, :tuning_feedback).find(params[:id])
      render json: { lead: serialize_lead(lead) }
    end

    def create
      lead = current_organization.leads.new(lead_params)
      lead.status = "new" if lead.status.blank?

      if lead.save
        render json: { lead: serialize_lead(lead) }, status: :created
      else
        render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      lead = current_organization.leads.find(params[:id])
      if lead.update(lead_params)
        render json: { lead: serialize_lead(lead) }
      else
        render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      lead = current_organization.leads.find(params[:id])
      lead.destroy
      head :no_content
    end

    def requalify
      lead = current_organization.leads.find(params[:id])
      LeadQualifyJob.perform_later(lead.id, force: true, score_only: true)
      render json: { status: "queued" }
    end

    def tuning_feedback
      lead = current_organization.leads.includes(:social_profiles, :tuning_feedback).find(params[:id])
      rating = feedback_params[:rating]

      feedback = current_organization.lead_tuning_feedbacks.find_or_initialize_by(lead: lead)
      feedback.user = current_user
      feedback.rating = rating
      feedback.training_example = LeadTuningExampleBuilder.build(lead: lead, rating: rating)
      feedback.save!

      render json: {
        lead: serialize_lead(lead.reload),
        feedback: serialize_tuning_feedback(feedback)
      }
    rescue ActiveRecord::RecordInvalid => e
      render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
    end

    def tuning_dataset
      feedbacks = current_organization.lead_tuning_feedbacks
        .includes(:lead)
        .where(rating: LeadTuningFeedback::RATINGS)
        .order(updated_at: :desc)

      lines = feedbacks.filter_map do |feedback|
        example = feedback.training_example
        next if !example.is_a?(Hash) || example.empty?

        example.to_json
      end

      send_data(
        lines.join("\n"),
        filename: tuning_dataset_filename,
        type: "application/x-ndjson; charset=utf-8",
        disposition: "attachment"
      )
    end

    def deep_dive
      lead = current_organization.leads.find(params[:id])
      next_data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data.deep_dup : {}
      next_data.delete("search_warnings")
      next_data.delete("search_sources")
      next_data.delete("search_results")

      lead.update!(
        deep_dive_status: "queued",
        deep_dive_error: nil,
        first_contact_status: "idle",
        first_contact_error: nil,
        deep_dive_data: next_data
      )
      LeadDeepDiveJob.perform_later(lead.id)
      render json: { status: "queued" }
    end

    def suggest_first_contact
      lead = current_organization.leads.find(params[:id])
      unless lead.deep_dive_status == "complete"
        return render json: { errors: ["Run Deep Dive first."] }, status: :unprocessable_entity
      end

      lead.update!(first_contact_status: "queued", first_contact_error: nil)
      LeadFirstContactSuggestionJob.perform_later(lead.id)
      render json: { status: "queued" }
    end

    def dossier
      lead = current_organization.leads.includes(:social_profiles, :communications).find(params[:id])
      pdf_data = LeadDossierPdf.new(lead).render

      send_data(
        pdf_data,
        filename: dossier_filename(lead),
        type: "application/pdf",
        disposition: "attachment"
      )
    end

    private

    def lead_params
      params.require(:lead).permit(
        :name,
        :platform,
        :handle,
        :email,
        :status,
        :score,
        :source,
        :role,
        :country,
        :notes,
        :ai_category,
        :website
      )
    end

    def feedback_params
      params.require(:feedback).permit(:rating)
    end

    def lead_fields
      %i[
        id name platform handle email website status score source role country notes
        ai_category ai_fit_score ai_confidence ai_reason ai_last_scored_at
        deep_dive_status deep_dive_last_run_at deep_dive_error deep_dive_data
        first_contact_status first_contact_last_run_at first_contact_error
        created_at updated_at
      ]
    end

    def serialize_lead(lead)
      payload = lead.as_json(
        only: lead_fields,
        include: {
          social_profiles: {
            only: %i[id profile_type url handle source notes metadata created_at updated_at]
          }
        }
      )

      feedback = lead.tuning_feedback
      payload.merge!(
        "tuning_feedback_rating" => feedback&.rating,
        "tuning_feedback_updated_at" => feedback&.updated_at,
        "tuning_in_dataset" => feedback.present? && LeadTuningFeedback::RATINGS.include?(feedback.rating)
      )

      payload
    end

    def serialize_tuning_feedback(feedback)
      {
        id: feedback.id,
        rating: feedback.rating,
        in_dataset: LeadTuningFeedback::RATINGS.include?(feedback.rating),
        updated_at: feedback.updated_at
      }
    end

    def dossier_filename(lead)
      base_name = lead.name.to_s.parameterize.presence || "lead-#{lead.id}"
      "lead-dossier-#{base_name}-#{Time.current.strftime('%Y%m%d')}.pdf"
    end

    def tuning_dataset_filename
      "lead-tuning-dataset-#{Time.current.strftime('%Y%m%d')}.jsonl"
    end
  end
end
