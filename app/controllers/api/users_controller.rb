module Api
  class UsersController < BaseController
    def index
      users = current_organization.users.order(:id).select(:id, :name, :email, :role)
      render json: { users: users, current_user_id: current_user.id }
    end

    def me
      render json: {
        user: current_user.slice(:id, :name, :email, :role),
        organization: current_organization.slice(:id, :name)
      }
    end

    def update_me
      if current_user.update(me_params)
        render json: { user: current_user.slice(:id, :name, :email, :role) }
      else
        render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      require_admin!
      return if performed?

      user = current_organization.users.find(params[:id])
      if user == current_user && user_params[:role].present? && user_params[:role] != user.role
        return render json: { error: "cannot_change_own_role" }, status: :unprocessable_entity
      end

      if user.update(user_params)
        render json: { user: user.slice(:id, :name, :email, :role) }
      else
        render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      require_admin!
      return if performed?

      user = current_organization.users.find(params[:id])
      if user == current_user
        render json: { error: "cannot_remove_self" }, status: :unprocessable_entity
      else
        user.destroy
        head :no_content
      end
    end

    private

    def me_params
      params.require(:user).permit(:name)
    end

    def user_params
      params.require(:user).permit(:name, :role)
    end
  end
end
