require "json"

class OpenaiClient
  DEFAULT_MODEL = "gpt-4.1-mini"

  def initialize(adapter: Adapters::OpenaiResponsesAdapter.new, model: nil)
    credentials = Rails.application.credentials.openai || {}
    @adapter = adapter
    @model = model.presence || credentials[:model].presence || ENV["OPENAI_MODEL"].presence || DEFAULT_MODEL
  end

  def model_name
    @model
  end

  def chat_json(system:, user:, schema:)
    return nil if @model.blank?

    response = @adapter.create_response(
      model: @model,
      input: <<~INPUT,
        System instructions:
        #{system}

        User request:
        #{user}
      INPUT
      text_format: {
        type: "json_schema",
        name: "response_payload",
        schema: schema,
        strict: true
      }
    )

    output = response["output_text"].to_s
    return nil if output.blank?

    JSON.parse(output)
  rescue JSON::ParserError => e
    Rails.logger.warn("OpenaiClient parse error: #{e.message}")
    nil
  rescue StandardError => e
    Rails.logger.warn("OpenaiClient error: #{e.class} #{e.message}")
    nil
  end
end
