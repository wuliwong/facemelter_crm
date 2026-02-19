require "json"
require "open3"
require "net/http"
require "uri"

class PlaywrightWebSearchScraper
  Result = Struct.new(:title, :url, :snippet, :query, keyword_init: true)
  SUPPORTED_ENGINES = %w[google duckduckgo].freeze
  SUPPORTED_PROVIDERS = %w[serper playwright].freeze
  SERPER_URL = URI("https://google.serper.dev/search")

  attr_reader :last_warning, :last_source

  def initialize(
    script_path: Rails.root.join("script/web_search_scrape.js"),
    search_engine: ENV.fetch("WEB_SEARCH_ENGINE", "google"),
    provider: ENV.fetch("WEB_SEARCH_PROVIDER", "serper")
  )
    @script_path = script_path
    @search_engine = normalize_engine(search_engine)
    @provider = normalize_provider(provider)
    @last_warning = nil
    @last_source = nil
  end

  def search(query, limit: 8)
    @last_warning = nil
    @last_source = nil
    return [] if query.to_s.strip.blank?

    if use_serper?
      serper_results = run_serper_search(query, limit: limit)
      return serper_results if serper_results.any?
    end

    if @search_engine == "google" && google_api_configured?
      api_results = run_google_custom_search(query, limit: limit)
      if api_results.any?
        @last_source ||= "google_custom_search"
        return api_results
      end
    end

    results = run_search(query, limit: limit, engine: @search_engine)
    @last_source ||= @search_engine if results.any?

    if results.empty? && @search_engine == "google"
      Rails.logger.info("PlaywrightWebSearchScraper fallback to duckduckgo for query=#{query.inspect}")
      results = run_search(query, limit: limit, engine: "duckduckgo")
      @last_source ||= "duckduckgo" if results.any?
    end

    results
  end

  private

  def run_search(query, limit:, engine:)
    resolved_engine = normalize_engine(engine)

    env = {}
    env["WEB_SCRAPE_DEBUG"] = ENV["WEB_SCRAPE_DEBUG"] if ENV["WEB_SCRAPE_DEBUG"].present?
    env["WEB_SEARCH_ENGINE"] = resolved_engine

    stdout, stderr, status = Open3.capture3(
      env,
      "node",
      @script_path.to_s,
      query.to_s,
      limit.to_i.to_s,
      resolved_engine
    )

    unless status.success?
      Rails.logger.warn("PlaywrightWebSearchScraper error (#{resolved_engine}): #{stderr.to_s.strip}")
      return []
    end

    payload = JSON.parse(stdout)
    items = payload["items"]
    return [] unless items.is_a?(Array)

    items.filter_map { |item| build_result(item, query) }
  rescue JSON::ParserError => e
    Rails.logger.warn("PlaywrightWebSearchScraper parse error (#{resolved_engine}): #{e.message}")
    []
  rescue StandardError => e
    Rails.logger.warn("PlaywrightWebSearchScraper error (#{resolved_engine}): #{e.class} #{e.message}")
    []
  end

  def run_serper_search(query, limit:)
    api_key = serper_api_key
    unless api_key.present?
      @last_warning = "Serper search is enabled but no API key is configured (set credentials.serper.api_key or SERPER_API_KEY)."
      Rails.logger.warn(
        "PlaywrightWebSearchScraper Serper warning: missing API key in credentials.serper.api_key and ENV[\"SERPER_API_KEY\"]"
      )
      return []
    end

    request = Net::HTTP::Post.new(SERPER_URL)
    request["X-API-KEY"] = api_key
    request["Content-Type"] = "application/json"
    request.body = JSON.dump(
      {
        q: query.to_s,
        num: [[limit.to_i, 1].max, 10].min
      }
    )

    response = Net::HTTP.start(
      SERPER_URL.host,
      SERPER_URL.port,
      use_ssl: true,
      open_timeout: 10,
      read_timeout: 20,
      write_timeout: 20
    ) { |http| http.request(request) }

    unless response.is_a?(Net::HTTPSuccess)
      body_preview = response.body.to_s.tr("\n", " ").truncate(220)
      @last_warning = "Serper/Google search failed (HTTP #{response.code}). Check API key/credits."
      Rails.logger.warn(
        "PlaywrightWebSearchScraper Serper error: HTTP #{response.code} body=#{body_preview}"
      )
      return []
    end

    payload = JSON.parse(response.body)
    items = payload["organic"]
    unless items.is_a?(Array)
      @last_warning = "Serper returned an unexpected response shape. Check API status."
      Rails.logger.warn("PlaywrightWebSearchScraper Serper warning: missing organic results")
      return []
    end

    results = items.filter_map do |item|
      build_result(
        {
          title: item["title"],
          url: item["link"],
          snippet: item["snippet"]
        },
        query
      )
    end

    @last_source = "serper" if results.any?
    results
  rescue JSON::ParserError => e
    @last_warning = "Serper returned invalid JSON. Check API status."
    Rails.logger.warn("PlaywrightWebSearchScraper Serper parse error: #{e.message}")
    []
  rescue StandardError => e
    @last_warning = "Serper/Google request failed. Check network/API key/credits."
    Rails.logger.warn("PlaywrightWebSearchScraper Serper error: #{e.class} #{e.message}")
    []
  end

  def build_result(item, query)
    raw_url = item["url"] || item[:url]
    url = normalize_url(raw_url)
    return nil if url.blank?

    Result.new(
      title: (item["title"] || item[:title]).to_s.strip,
      url: url,
      snippet: (item["snippet"] || item[:snippet]).to_s.strip,
      query: query.to_s
    )
  end

  def normalize_url(raw_url)
    value = raw_url.to_s.strip
    return nil if value.blank?
    return nil unless value.match?(%r{\Ahttps?://}i)

    uri = URI.parse(value)
    return nil if uri.host.blank?
    return nil if uri.host.include?("duckduckgo.com")

    uri.fragment = nil
    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def normalize_engine(engine)
    value = engine.to_s.downcase
    SUPPORTED_ENGINES.include?(value) ? value : "google"
  end

  def normalize_provider(provider)
    value = provider.to_s.downcase
    SUPPORTED_PROVIDERS.include?(value) ? value : "serper"
  end

  def use_serper?
    @provider == "serper"
  end

  def google_api_configured?
    google_api_key.present? && google_cse_id.present?
  end

  def google_api_key
    ENV["GOOGLE_SEARCH_API_KEY"].presence
  end

  def google_cse_id
    ENV["GOOGLE_SEARCH_CSE_ID"].presence
  end

  def serper_api_key
    credentials_key = Rails.application.credentials.dig(:serper, :api_key)
    credentials_key.presence || ENV["SERPER_API_KEY"].presence
  end

  def run_google_custom_search(query, limit:)
    per_page = [[limit.to_i, 1].max, 10].min
    uri = URI.parse("https://www.googleapis.com/customsearch/v1")
    uri.query = URI.encode_www_form(
      key: google_api_key,
      cx: google_cse_id,
      q: query.to_s,
      num: per_page
    )

    response = Net::HTTP.get_response(uri)
    unless response.is_a?(Net::HTTPSuccess)
      Rails.logger.warn("PlaywrightWebSearchScraper Google API error: HTTP #{response.code}")
      return []
    end

    payload = JSON.parse(response.body)
    items = payload["items"]
    return [] unless items.is_a?(Array)

    items.filter_map do |item|
      build_result(
        {
          title: item["title"],
          url: item["link"],
          snippet: item["snippet"]
        },
        query
      )
    end
  rescue JSON::ParserError => e
    Rails.logger.warn("PlaywrightWebSearchScraper Google API parse error: #{e.message}")
    []
  rescue StandardError => e
    Rails.logger.warn("PlaywrightWebSearchScraper Google API error: #{e.class} #{e.message}")
    []
  end
end
