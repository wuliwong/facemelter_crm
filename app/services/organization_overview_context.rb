class OrganizationOverviewContext
  DEFAULT_PATH = Rails.root.join("docs/stablegen_company_overview.md")
  MAX_CHARS = 12_000

  class << self
    def for(organization)
      org_text = organization&.overview.to_s.strip
      return trim(org_text) if org_text.present?

      trim(default_overview_text)
    end

    private

    def default_overview_text
      return "" unless File.exist?(DEFAULT_PATH)

      @default_overview_text ||= File.read(DEFAULT_PATH)
    rescue StandardError => e
      Rails.logger.warn("OrganizationOverviewContext read error: #{e.class} #{e.message}")
      ""
    end

    def trim(text)
      text.to_s.strip.first(MAX_CHARS)
    end
  end
end
