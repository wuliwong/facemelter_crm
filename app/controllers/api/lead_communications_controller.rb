module Api
  class LeadCommunicationsController < BaseController
    def index
      lead = find_lead
      render json: {
        communications: lead.communications.latest_first.as_json(only: communication_fields),
        channel_options: LeadCommunication::CHANNEL_VALUES,
        outcome_options: LeadCommunication::OUTCOME_VALUES
      }
    end

    def create
      lead = find_lead
      communication = lead.communications.new(communication_params)

      if communication.save
        render json: { communication: communication.as_json(only: communication_fields) }, status: :created
      else
        render json: { errors: communication.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      communication = find_communication

      if communication.update(communication_params)
        render json: { communication: communication.as_json(only: communication_fields) }
      else
        render json: { errors: communication.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      communication = find_communication
      communication.destroy
      head :no_content
    end

    private

    def find_lead
      current_organization.leads.find(params[:lead_id])
    end

    def find_communication
      find_lead.communications.find(params[:id])
    end

    def communication_params
      params.require(:communication).permit(
        :channel,
        :outcome,
        :occurred_at,
        :responded_at,
        :link,
        :summary,
        :notes
      )
    end

    def communication_fields
      %i[
        id channel outcome occurred_at responded_at link summary notes
        created_at updated_at
      ]
    end
  end
end
