module Api
  class LeadsController < BaseController
    def index
      leads = current_organization.leads.order(created_at: :desc)
      render json: { leads: leads.as_json(only: lead_fields) }
    end

    def show
      lead = current_organization.leads.find(params[:id])
      render json: { lead: lead.as_json(only: lead_fields) }
    end

    def create
      lead = current_organization.leads.new(lead_params)
      lead.status = "new" if lead.status.blank?

      if lead.save
        render json: { lead: lead.as_json(only: lead_fields) }, status: :created
      else
        render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      lead = current_organization.leads.find(params[:id])
      if lead.update(lead_params)
        render json: { lead: lead.as_json(only: lead_fields) }
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
      LeadQualifyJob.perform_later(lead.id, force: true)
      render json: { status: "queued" }
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
        :notes
      )
    end

    def lead_fields
      %i[
        id name platform handle email status score source role country notes
        ai_category ai_fit_score ai_confidence ai_reason ai_last_scored_at
        created_at updated_at
      ]
    end
  end
end
