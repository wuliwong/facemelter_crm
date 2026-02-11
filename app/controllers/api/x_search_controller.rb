module Api
  class XSearchController < BaseController
    DEFAULT_LIMIT = 25
    MAX_LIMIT = 50

    def create
      query = params[:query].to_s.strip
      if query.blank?
        return render json: { error: "query_required" }, status: :unprocessable_entity
      end

      limit = params[:limit].to_i
      limit = DEFAULT_LIMIT if limit <= 0
      limit = [limit, MAX_LIMIT].min

      XSearchIngestJob.perform_later(current_organization.id, query, limit: limit)
      render json: { status: "queued", query: query, limit: limit }
    end
  end
end
