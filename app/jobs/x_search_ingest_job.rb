require "set"

class XSearchIngestJob < ApplicationJob
  queue_as :default

  DEFAULT_LIMIT = 25
  MAX_LIMIT = 50

  def perform(organization_id, query, limit: DEFAULT_LIMIT)
    organization = Organization.find(organization_id)
    limit = DEFAULT_LIMIT if limit.to_i <= 0
    limit = [limit.to_i, MAX_LIMIT].min

    scraper = ::XPlaywrightScraper.new
    posts = scraper.search(query, limit: limit)
    queued_leads = Set.new

    posts.each do |post|
      lead = find_or_create_lead(organization, post)
      signal = organization.signals.find_or_initialize_by(source: "x", source_id: post.id)
      signal.assign_attributes(
        lead: lead,
        url: post.url,
        title: post.content.to_s.truncate(120),
        content: post.content,
        author_name: post.author_name,
        author_handle: post.author_handle,
        captured_at: post.published_at,
        metadata: { query: query }
      )
      signal.save!

      next if queued_leads.include?(lead.id)

      LeadQualifyJob.perform_later(lead.id)
      queued_leads.add(lead.id)
    end
  end

  private

  def find_or_create_lead(organization, post)
    handle_variants = handle_variants_for(post.author_handle)
    lead = organization.leads.find_by(handle: handle_variants)
    return update_lead_platform(lead) if lead

    organization.leads.create!(
      name: post.author_name.presence || post.author_handle,
      handle: "@#{post.author_handle}",
      platform: "X",
      status: "new",
      source: "x_search"
    )
  end

  def update_lead_platform(lead)
    if lead.platform.blank?
      lead.update(platform: "X")
    end
    lead
  end

  def handle_variants_for(handle)
    normalized = handle.to_s.delete_prefix("@")
    ["@#{normalized}", normalized]
  end
end
