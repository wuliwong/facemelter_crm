class LeadFirstContactSuggestionJob < ApplicationJob
  queue_as :default

  def perform(lead_id)
    lead = Lead.find_by(id: lead_id)
    return unless lead

    lead.update!(first_contact_status: "running", first_contact_error: nil)
    Rails.logger.info("LeadFirstContactSuggestionJob start lead_id=#{lead.id} org_id=#{lead.organization_id}")

    LeadFirstContactSuggestionService.new.run!(lead)
  rescue StandardError => e
    Rails.logger.error("LeadFirstContactSuggestionJob error lead_id=#{lead_id} #{e.class}: #{e.message}")
    lead&.update_columns(
      first_contact_status: "failed",
      first_contact_error: "#{e.class}: #{e.message}".truncate(1000),
      first_contact_last_run_at: Time.current,
      updated_at: Time.current
    )
    raise
  end
end
