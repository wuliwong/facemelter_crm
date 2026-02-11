require "json"
require "net/http"
require "uri"

class OllamaClient
  DEFAULT_BASE_URL = "http://localhost:11434"

  def initialize(base_url: nil, model: nil, read_timeout: nil, open_timeout: nil)
    creds = Rails.application.credentials.ollama || {}
    @base_url = base_url.presence || creds[:base_url] || ENV["OLLAMA_BASE_URL"] || DEFAULT_BASE_URL
    @model = model.presence || creds[:model] || ENV["OLLAMA_MODEL"]
    @read_timeout = (read_timeout.presence || creds[:read_timeout] || ENV["OLLAMA_READ_TIMEOUT"] || 120).to_i
    @open_timeout = (open_timeout.presence || creds[:open_timeout] || ENV["OLLAMA_OPEN_TIMEOUT"] || 10).to_i
  end

  def model_name
    resolved_model
  end

  def chat_json(system:, user:, schema:)
    model_name = resolved_model
    return nil if model_name.blank?

    payload = {
      model: model_name,
      messages: [
        { role: "system", content: system.to_s },
        { role: "user", content: user.to_s }
      ],
      stream: false,
      format: schema,
      keep_alive: -1
    }

    response = post_json("/api/chat", payload)
    return nil unless response.is_a?(Hash)

    content = response.dig("message", "content").to_s
    return nil if content.strip.empty?

    JSON.parse(content)
  rescue JSON::ParserError => e
    Rails.logger.warn("OllamaClient parse error: #{e.message}")
    nil
  end

  private

  def resolved_model
    return @model if @model.to_s.strip.present?

    models = available_models
    @model = models.first
  end

  def available_models
    response = get_json("/api/tags")
    return [] unless response.is_a?(Hash)

    models = response["models"]
    return [] unless models.is_a?(Array)

    models.filter_map { |model| model["name"] || model[:name] }
  rescue StandardError => e
    Rails.logger.warn("OllamaClient tags error: #{e.class} #{e.message}")
    []
  end

  def get_json(path)
    uri = build_uri(path)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = @open_timeout
    http.read_timeout = @read_timeout
    response = http.get(uri)
    return nil unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue JSON::ParserError => e
    Rails.logger.warn("OllamaClient parse error: #{e.message}")
    nil
  rescue Net::ReadTimeout, Net::OpenTimeout, Errno::ECONNREFUSED, Errno::ECONNRESET, SocketError => e
    Rails.logger.warn("OllamaClient connection error on GET #{path}: #{e.class} #{e.message}")
    nil
  end

  def post_json(path, payload)
    uri = build_uri(path)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = @open_timeout
    http.read_timeout = @read_timeout

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request.body = JSON.dump(payload)

    response = http.request(request)
    return nil unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  rescue JSON::ParserError => e
    Rails.logger.warn("OllamaClient parse error: #{e.message}")
    nil
  rescue Net::ReadTimeout, Net::OpenTimeout, Errno::ECONNREFUSED, Errno::ECONNRESET, SocketError => e
    Rails.logger.warn("OllamaClient connection error on POST #{path}: #{e.class} #{e.message}")
    nil
  end

  def build_uri(path)
    base = @base_url.to_s
    base = base.delete_suffix("/")
    URI.parse("#{base}#{path}")
  end
end
