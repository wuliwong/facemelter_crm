class LeadQualifyJob < ApplicationJob
  queue_as :default

  def perform(lead_id, force: false, score_only: false)
    lead = Lead.find_by(id: lead_id)
    return unless lead

    Rails.logger.info(
      "LeadQualifyJob start lead_id=#{lead.id} org_id=#{lead.organization_id} force=#{force} score_only=#{score_only}"
    )
    LeadQualifier.new.qualify!(lead, force: force, score_only: score_only)
  rescue StandardError => e
    Rails.logger.error(
      "LeadQualifyJob error lead_id=#{lead_id} force=#{force} score_only=#{score_only} #{e.class}: #{e.message}"
    )
    raise
  end
end
