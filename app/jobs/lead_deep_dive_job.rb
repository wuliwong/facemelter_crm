class LeadDeepDiveJob < ApplicationJob
  queue_as :default

  def perform(lead_id)
    lead = Lead.find_by(id: lead_id)
    return unless lead

    lead.update!(deep_dive_status: "running", deep_dive_error: nil)
    Rails.logger.info("LeadDeepDiveJob start lead_id=#{lead.id} org_id=#{lead.organization_id}")

    LeadDeepDiveService.new.run!(lead)
  rescue StandardError => e
    Rails.logger.error("LeadDeepDiveJob error lead_id=#{lead_id} #{e.class}: #{e.message}")
    lead&.update_columns(
      deep_dive_status: "failed",
      deep_dive_error: "#{e.class}: #{e.message}".truncate(1000),
      deep_dive_last_run_at: Time.current,
      updated_at: Time.current
    )
    raise
  end
end
