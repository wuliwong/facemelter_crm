class AiProviderConfig
  DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"

  class << self
    def build_client
      OpenaiClient.new
    end

    def provider
      "openai"
    end

    def model
      openai_credentials[:model].presence || ENV["OPENAI_MODEL"].presence || DEFAULT_OPENAI_MODEL
    end

    def label
      resolved_model = model.to_s
      return "" if resolved_model.blank?

      "#{provider}:#{resolved_model}"
    end

    def openai_configured?
      openai_credentials[:api_key].presence || ENV["OPENAI_API_KEY"].presence
    end

    private

    def openai_credentials
      Rails.application.credentials.openai || {}
    end
  end
end
