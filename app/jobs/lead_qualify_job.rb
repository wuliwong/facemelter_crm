class LeadQualifyJob < ApplicationJob
  queue_as :default

  def perform(lead_id, force: false)
    lead = Lead.find_by(id: lead_id)
    return unless lead

    Rails.logger.info("LeadQualifyJob start lead_id=#{lead.id} org_id=#{lead.organization_id} force=#{force}")
    LeadQualifier.new.qualify!(lead, force: force)
  rescue StandardError => e
    Rails.logger.error(
      "LeadQualifyJob error lead_id=#{lead_id} force=#{force} #{e.class}: #{e.message}"
    )
    raise
  end
end
