module Api
  class BaseController < ApplicationController
    before_action :authenticate_user!

    private

    def current_organization
      current_user.organization
    end

    def require_admin!
      return if current_user.admin?

      render json: { error: "forbidden" }, status: :forbidden
    end
  end
end
