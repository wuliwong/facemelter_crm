module Api
  class OrganizationsController < BaseController
    def show
      organization = current_organization
      render json: {
        organization: organization.slice(:id, :name),
        users: organization.users.order(:id).select(:id, :name, :email, :role)
      }
    end

    def update
      require_admin!
      return if performed?

      organization = current_organization
      if organization.update(organization_params)
        render json: { organization: organization.slice(:id, :name) }
      else
        render json: { errors: organization.errors.full_messages }, status: :unprocessable_entity
      end
    end

    private

    def organization_params
      params.require(:organization).permit(:name)
    end
  end
end
