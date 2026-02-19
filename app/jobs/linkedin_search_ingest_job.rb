require "set"
require "uri"

class LinkedinSearchIngestJob < ApplicationJob
  queue_as :default

  DEFAULT_LIMIT = 25
  MAX_LIMIT = 50

  def perform(organization_id, query, limit: DEFAULT_LIMIT)
    organization = Organization.find(organization_id)
    limit = DEFAULT_LIMIT if limit.to_i <= 0
    limit = [limit.to_i, MAX_LIMIT].min

    scraper = ::LinkedinPlaywrightScraper.new
    posts = scraper.search(query, limit: limit)
    queued_leads = Set.new

    posts.each do |post|
      normalized_handle = resolve_handle(post)
      lead = find_or_create_lead(organization, post, normalized_handle)
      signal = organization.signals.find_or_initialize_by(source: "linkedin", source_id: post.id)
      signal.assign_attributes(
        lead: lead,
        url: post.url,
        title: post.content.to_s.truncate(120),
        content: post.content,
        author_name: post.author_name,
        author_handle: normalized_handle,
        captured_at: post.published_at,
        metadata: { query: query }
      )
      signal.save!

      next if queued_leads.include?(lead.id)

      # Force re-qualification so new rubric/category updates are applied immediately.
      LeadQualifyJob.perform_later(lead.id, force: true)
      queued_leads.add(lead.id)
    end
  end

  private

  def find_or_create_lead(organization, post, normalized_handle)
    lead = organization.leads.find_by(handle: normalized_handle)
    if lead
      return update_lead_platform(lead, normalized_handle)
    end

    if post.author_name.present?
      lead = organization.leads.find_by(platform: "LinkedIn", name: post.author_name)
    end
    if lead
      return update_lead_platform(lead, normalized_handle)
    end

    create_lead(organization, post, normalized_handle)
  end

  def create_lead(organization, post, normalized_handle)
    organization.leads.create!(
      name: post.author_name.presence || post.author_handle.presence || normalized_handle,
      handle: normalized_handle,
      platform: "LinkedIn",
      status: "new",
      source: "linkedin_search"
    )
  end

  def update_lead_platform(lead, normalized_handle)
    updates = {}
    updates[:platform] = "LinkedIn" if lead.platform.blank?
    updates[:handle] = normalized_handle if lead.handle.blank?
    if updates.any?
      lead.update(updates)
    end
    lead
  end

  def resolve_handle(post)
    from_author = normalize_handle(post.author_handle)
    from_url = extract_handle_from_url(post.url)
    from_name = normalize_handle(post.author_name.to_s.parameterize)
    from_author || from_url || from_name || "linkedin_user_#{post.id}"
  end

  def normalize_handle(value)
    raw = value.to_s.strip
    return nil if raw.blank?

    if raw.match?(/\Ahttps?:\/\//i)
      return extract_handle_from_url(raw)
    end

    cleaned = raw.delete_prefix("@").split("/").first.to_s.gsub(/\s+/, "")
    cleaned.presence
  end

  def extract_handle_from_url(url)
    uri = URI.parse(url.to_s)
    segments = uri.path.to_s.split("/").reject(&:blank?)
    return nil if segments.empty?

    marker_index = segments.find_index { |part| %w[in company school showcase].include?(part.downcase) }
    return nil unless marker_index
    return nil unless segments[marker_index + 1].present?

    normalize_handle(segments[marker_index + 1])
  rescue URI::InvalidURIError
    nil
  end
end
