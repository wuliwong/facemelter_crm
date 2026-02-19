# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module Adapters
  class OpenaiResponsesAdapter
    OPENAI_URL = "https://api.openai.com/v1"

    def initialize(base_url: nil)
      credentials = Rails.application.credentials.openai || {}
      @api_key = credentials[:api_key].presence || ENV["OPENAI_API_KEY"]
      @base_url = base_url.presence || credentials[:base_url].presence || ENV["OPENAI_BASE_URL"].presence || OPENAI_URL
      @base_url = @base_url.to_s.sub(%r{/\z}, "")
    end

    # Creates a response using the Responses API
    # @param model [String] Model to use (e.g., "gpt-4o", "gpt-4.1-mini")
    # @param input [String, Array] Input prompt or message array
    # @param previous_response_id [String, nil] ID of previous response for chaining
    # @param temperature [Float, nil] Temperature for response generation
    # @param max_output_tokens [Integer, nil] Maximum tokens in output
    # @param stream [Boolean] Whether to stream the response
    # @param text_format [Hash, nil] Structured output format payload
    # @return [Hash] Response object with id, output, output_text, usage
    def create_response(model:, input:, previous_response_id: nil, temperature: nil, max_output_tokens: nil, stream: false, text_format: nil)
      ensure_api_key!

      body = {
        model: model,
        input: input
      }

      body[:temperature] = temperature unless temperature.nil?
      body[:previous_response_id] = previous_response_id if previous_response_id.present?
      body[:max_output_tokens] = max_output_tokens if max_output_tokens.present?
      body[:text] = { format: text_format } if text_format.present?

      if stream
        stream_response(body)
      else
        raw_response = request_json(:post, "responses", body)
        output_text = extract_output_text(raw_response)

        raw_response.merge(
          "output_text" => output_text,
          "model" => raw_response["model"],
          "usage" => extract_usage_metadata(raw_response)
        )
      end
    rescue StandardError => e
      raise "OpenAI Responses API error: #{e.message}"
    end

    # Retrieves a previously created response
    # @param response_id [String] The response ID
    # @return [Hash] Response object
    def retrieve_response(response_id)
      ensure_api_key!
      request_json(:get, "responses/#{response_id}")
    rescue StandardError => e
      raise "OpenAI Responses API error: #{e.message}"
    end

    private

    def ensure_api_key!
      raise "missing api key (credentials.openai.api_key)" if @api_key.blank?
    end

    def extract_usage_metadata(response)
      usage = response["usage"] || {}
      {
        input_tokens: usage["input_tokens"],
        output_tokens: usage["output_tokens"],
        cached_tokens: usage.dig("input_tokens_details", "cached_tokens"),
        total_tokens: usage["total_tokens"],
        raw_metadata: usage
      }
    end

    def request_json(method, path, body = nil)
      response = request_raw(method, path, body)
      parse_json_body(response.body)
    end

    def request_raw(method, path, body = nil)
      uri = endpoint_uri(path)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 30
      http.read_timeout = 600
      http.write_timeout = 600 if http.respond_to?(:write_timeout=)

      request =
        case method.to_sym
        when :get then Net::HTTP::Get.new(uri)
        when :post then Net::HTTP::Post.new(uri)
        else
          raise ArgumentError, "Unsupported HTTP method: #{method}"
        end

      request["Authorization"] = "Bearer #{@api_key}"
      request["Content-Type"] = "application/json"
      request.body = JSON.dump(body) if body.present?

      response = http.request(request)
      return response if response.is_a?(Net::HTTPSuccess)

      raise "HTTP #{response.code} — #{response.body.to_s.truncate(400)}"
    end

    def parse_json_body(body)
      JSON.parse(body.to_s)
    rescue JSON::ParserError => e
      raise "invalid JSON response: #{e.message}"
    end

    def extract_output_text(raw_response)
      direct = raw_response["output_text"].to_s
      return direct if direct.present?

      nested = raw_response.dig("output", 0, "content", 0, "text").to_s
      return nested if nested.present?

      ""
    end

    def stream_response(body)
      full_output_text = +""
      response_id = nil
      model_name = nil
      usage_data = nil
      current_event = nil
      buffer = +""

      payload = body.merge(stream: true)

      uri = endpoint_uri("responses")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 30
      http.read_timeout = 600
      http.write_timeout = 600 if http.respond_to?(:write_timeout=)

      request = Net::HTTP::Post.new(uri)
      request["Authorization"] = "Bearer #{@api_key}"
      request["Content-Type"] = "application/json"
      request.body = JSON.dump(payload)

      http.request(request) do |response|
        unless response.is_a?(Net::HTTPSuccess)
          raise "HTTP #{response.code} — #{response.body.to_s.truncate(400)}"
        end

        response.read_body do |chunk_data|
          buffer << chunk_data.to_s

          while (newline_index = buffer.index("\n"))
            line = buffer.slice!(0, newline_index + 1).strip
            next if line.empty?

            if line.start_with?("event:")
              current_event = line.sub(/^event:\s*/, "").strip
              next
            end

            next unless line.start_with?("data:")

            json_str = line.sub(/^data:\s*/, "").strip
            next if json_str == "[DONE]"

            begin
              chunk = JSON.parse(json_str)
            rescue JSON::ParserError
              next
            end

            case current_event
            when "response.created"
              response_id ||= chunk.dig("response", "id")
              model_name ||= chunk.dig("response", "model")
            when "response.output_text.delta"
              delta = chunk["delta"].to_s
              full_output_text << delta if delta.present?
            when "response.completed"
              usage_data = chunk.dig("response", "usage")
            end
          end
        end
      end

      if usage_data.blank? && response_id.present?
        begin
          retrieved = retrieve_response(response_id)
          usage_data = retrieved["usage"]
        rescue StandardError => e
          Rails.logger.warn("OpenAI Responses API usage fallback failed: #{e.class} #{e.message}")
        end
      end

      {
        "id" => response_id,
        "output_text" => full_output_text,
        "model" => model_name,
        "status" => "completed",
        "usage" => usage_data ? extract_usage_metadata({ "usage" => usage_data }) : {}
      }
    end

    def endpoint_uri(path)
      sanitized_path = path.to_s.sub(%r{\A/+}, "")
      uri = URI.parse("#{@base_url}/#{sanitized_path}")
      raise URI::InvalidURIError, "missing host" if uri.host.blank?

      uri
    rescue URI::InvalidURIError => e
      raise "invalid endpoint URL for path #{path.inspect}: #{e.message}"
    end
  end
end
