module Api
  class ConnectionsController < BaseController
    def index
      render json: { connections: BrowserAuthLauncher.status }
    end

    def launch
      provider = params[:provider].to_s.downcase
      result = BrowserAuthLauncher.launch(provider)

      if result[:error]
        render json: { error: result[:error] }, status: :unprocessable_entity
      else
        render json: result
      end
    end

    def disconnect
      provider = params[:provider].to_s.downcase
      result = BrowserAuthLauncher.disconnect(provider)

      if result[:error]
        render json: { error: result[:error] }, status: :unprocessable_entity
      else
        render json: result
      end
    end
  end
end
