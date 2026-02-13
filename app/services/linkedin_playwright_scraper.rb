require "json"
require "open3"
require "time"

class LinkedinPlaywrightScraper
  Post = Struct.new(
    :id,
    :url,
    :content,
    :published_at,
    :author_name,
    :author_handle,
    keyword_init: true
  )

  def initialize(script_path: Rails.root.join("script/linkedin_scrape.js"))
    @script_path = script_path
  end

  def search(query, limit: 20)
    return [] if query.to_s.strip.empty?

    env = {}
    env["LI_PROFILE_DIR"] = ENV.fetch("LI_PROFILE_DIR", Rails.root.join("tmp/li_chrome_profile").to_s)
    env["LI_SCRAPE_DEBUG"] = ENV["LI_SCRAPE_DEBUG"] if ENV["LI_SCRAPE_DEBUG"].present?

    stdout, stderr, status = Open3.capture3(
      env,
      "node",
      @script_path.to_s,
      query.to_s,
      limit.to_s
    )

    unless status.success?
      Rails.logger.warn("LinkedinPlaywrightScraper error: #{stderr.strip}")
      return []
    end

    payload = JSON.parse(stdout)
    items = payload["items"]
    return [] unless items.is_a?(Array)

    items.filter_map { |item| build_post(item) }
  rescue JSON::ParserError => e
    Rails.logger.warn("LinkedinPlaywrightScraper parse error: #{e.message}")
    []
  rescue StandardError => e
    Rails.logger.warn("LinkedinPlaywrightScraper error: #{e.class} #{e.message}")
    []
  end

  private

  def build_post(item)
    id = item["id"] || item[:id]
    url = item["url"] || item[:url]
    return nil if id.blank? || url.blank?

    published_at = parse_time(item["published_at"] || item[:published_at])

    Post.new(
      id: id.to_s,
      url: url.to_s,
      content: (item["content"] || item[:content]).to_s,
      published_at: published_at,
      author_name: (item["author_name"] || item[:author_name]).to_s,
      author_handle: (item["author_handle"] || item[:author_handle]).to_s
    )
  end

  def parse_time(value)
    return nil if value.blank?

    Time.parse(value.to_s)
  rescue ArgumentError
    nil
  end
end
