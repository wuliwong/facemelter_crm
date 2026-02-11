require "cgi"
require "open-uri"
require "rexml/document"
require "time"

class XPublicScraper
  Post = Struct.new(
    :id,
    :url,
    :content,
    :published_at,
    :author_name,
    :author_handle,
    keyword_init: true
  )

  USER_AGENT = "FacemelterCRM/1.0 (+https://facemeltercrm.test)".freeze

  def initialize(base_url: ENV.fetch("NITTER_BASE_URL", "https://nitter.net"))
    @base_url = base_url.to_s.chomp("/")
  end

  def search(query, limit: 20)
    return [] if query.to_s.strip.empty?

    feed_url = "#{@base_url}/search/rss?f=tweets&q=#{CGI.escape(query)}"
    xml = URI.open(feed_url, "User-Agent" => USER_AGENT, "Accept" => "application/rss+xml").read
    document = REXML::Document.new(xml)
    items = []

    document.elements.each("rss/channel/item") do |item|
      post = build_post(item)
      items << post if post
      break if items.length >= limit
    end

    items
  rescue StandardError => e
    Rails.logger.warn("XPublicScraper error: #{e.class} #{e.message}")
    []
  end

  private

  def build_post(item)
    link = text_for(item, "link")
    handle, status_id = parse_link(link)
    return nil if handle.nil? || status_id.nil?

    raw_text = text_for(item, "description")
    content = ActionView::Base.full_sanitizer.sanitize(raw_text).strip
    title = text_for(item, "title")
    author_name = title.split("(@").first.to_s.strip.presence
    published_at = parse_time(text_for(item, "pubDate"))

    Post.new(
      id: status_id,
      url: link,
      content: content.presence || title,
      published_at: published_at,
      author_name: author_name,
      author_handle: handle
    )
  end

  def text_for(item, key)
    item.elements[key]&.text.to_s
  end

  def parse_time(value)
    return nil if value.blank?

    Time.parse(value)
  rescue ArgumentError
    nil
  end

  def parse_link(link)
    uri = URI.parse(link)
    match = uri.path.match(%r{^/([^/]+)/status/(\d+)})
    return [nil, nil] unless match

    [match[1], match[2]]
  rescue URI::InvalidURIError
    [nil, nil]
  end
end
