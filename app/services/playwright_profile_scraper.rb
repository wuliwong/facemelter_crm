require "json"
require "open3"
require "uri"

class PlaywrightProfileScraper
  Snapshot = Struct.new(
    :url,
    :final_url,
    :channel_type,
    :title,
    :description,
    :profile_text,
    :about_url,
    :about_text,
    :recent_posts,
    :emails,
    :links,
    keyword_init: true
  )

  def initialize(script_path: Rails.root.join("script/profile_deep_dive.js"))
    @script_path = script_path
  end

  def fetch(url, channel_type:, include_about: false)
    normalized = normalize_url(url)
    return nil if normalized.blank?

    env = {}
    env["PROFILE_SCRAPE_DEBUG"] = ENV["PROFILE_SCRAPE_DEBUG"] if ENV["PROFILE_SCRAPE_DEBUG"].present?

    stdout, stderr, status = Open3.capture3(
      env,
      "node",
      @script_path.to_s,
      normalized,
      channel_type.to_s,
      include_about ? "1" : "0"
    )

    unless status.success?
      Rails.logger.warn("PlaywrightProfileScraper error: #{stderr.to_s.strip}")
      return nil
    end

    payload = JSON.parse(stdout)
    build_snapshot(payload, channel_type)
  rescue JSON::ParserError => e
    Rails.logger.warn("PlaywrightProfileScraper parse error: #{e.message}")
    nil
  rescue StandardError => e
    Rails.logger.warn("PlaywrightProfileScraper error: #{e.class} #{e.message}")
    nil
  end

  private

  def build_snapshot(payload, channel_type)
    Snapshot.new(
      url: normalize_url(payload["url"]),
      final_url: normalize_url(payload["final_url"]),
      channel_type: channel_type.to_s,
      title: payload["title"].to_s.strip,
      description: payload["description"].to_s.strip,
      profile_text: payload["profile_text"].to_s.strip,
      about_url: normalize_url(payload["about_url"]),
      about_text: payload["about_text"].to_s.strip,
      recent_posts: normalize_string_array(payload["recent_posts"], max_items: 20, max_length: 800),
      emails: normalize_string_array(payload["emails"], max_items: 20, max_length: 160),
      links: normalize_url_array(payload["links"], max_items: 30)
    )
  end

  def normalize_string_array(value, max_items:, max_length:)
    Array(value).map { |item| item.to_s.squish.first(max_length) }.reject(&:blank?).uniq.first(max_items)
  end

  def normalize_url_array(value, max_items:)
    Array(value).map { |item| normalize_url(item) }.compact.uniq.first(max_items)
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
end
