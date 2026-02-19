module Api
  class LeadSocialProfilesController < BaseController
    def destroy
      lead = find_lead
      profile = lead.social_profiles.find(params[:id])

      profile_url = profile.url
      profile_type = profile.profile_type
      profile.destroy!
      remove_profile_url_from_deep_dive!(lead, profile_type, profile_url)

      head :no_content
    end

    def destroy_all
      lead = find_lead
      lead.social_profiles.destroy_all
      clear_deep_dive_profiles!(lead)

      head :no_content
    end

    private

    def find_lead
      current_organization.leads.find(params[:lead_id] || params[:id])
    end

    def remove_profile_url_from_deep_dive!(lead, profile_type, profile_url)
      data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data.deep_dup : {}
      profiles = data["profiles"]
      return unless profiles.is_a?(Hash)

      urls = Array(profiles[profile_type.to_s]).reject { |url| url.to_s == profile_url.to_s }
      if urls.empty?
        profiles.delete(profile_type.to_s)
      else
        profiles[profile_type.to_s] = urls
      end

      lead.update!(deep_dive_data: data)
    end

    def clear_deep_dive_profiles!(lead)
      data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data.deep_dup : {}
      return unless data["profiles"].is_a?(Hash)

      data.delete("profiles")
      lead.update!(deep_dive_data: data)
    end
  end
end
