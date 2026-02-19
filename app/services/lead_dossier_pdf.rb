require "prawn"

class LeadDossierPdf
  MAX_LINES_PER_LIST = 30

  def initialize(lead)
    @lead = lead
    @deep_dive_data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data : {}
  end

  def render
    Prawn::Document.new(page_size: "LETTER", margin: 40) do |pdf|
      render_header(pdf)
      render_lead_snapshot(pdf)
      render_ai_snapshot(pdf)
      render_deep_dive_snapshot(pdf)
      render_social_profiles(pdf)
      render_contact_log(pdf)
      render_generated_footer(pdf)
    end.render
  end

  private

  attr_reader :lead, :deep_dive_data

  def render_header(pdf)
    pdf.text "Lead Dossier", size: 22, style: :bold
    pdf.move_down 4
    pdf.text lead.name.to_s, size: 16, style: :bold
    pdf.text "Organization: #{lead.organization&.name.to_s.presence || 'Unknown'}", size: 10
    pdf.move_down 12
  end

  def render_lead_snapshot(pdf)
    section_title(pdf, "Lead Snapshot")
    field(pdf, "Name", lead.name)
    field(pdf, "Platform", lead.platform)
    field(pdf, "Handle", lead.handle)
    field(pdf, "Email", lead.email)
    field(pdf, "Website", lead.website)
    field(pdf, "Role", lead.role)
    field(pdf, "Country", lead.country)
    field(pdf, "Status", lead.status)
    field(pdf, "Score", lead.score)
    field(pdf, "Source", lead.source)
    field(pdf, "Notes", lead.notes)
  end

  def render_ai_snapshot(pdf)
    section_title(pdf, "AI Qualification")
    field(pdf, "Category", lead.ai_category)
    field(pdf, "Fit Score", lead.ai_fit_score)
    field(pdf, "Confidence", format_confidence(lead.ai_confidence))
    field(pdf, "Last Scored", format_time(lead.ai_last_scored_at))
    field(pdf, "Rationale", lead.ai_reason)
  end

  def render_deep_dive_snapshot(pdf)
    section_title(pdf, "Deep Dive")
    field(pdf, "Status", lead.deep_dive_status)
    field(pdf, "Last Run", format_time(lead.deep_dive_last_run_at))
    field(pdf, "Provider", deep_dive_data["provider"])
    field(pdf, "Model", deep_dive_data["model"])
    field(pdf, "Summary", deep_dive_data["summary"])
    field(pdf, "Outreach Angle", deep_dive_data["outreach_angle"])
    field(pdf, "Next Step", deep_dive_data["next_step"])
    field(pdf, "Deep Dive Error", lead.deep_dive_error)
    render_list(pdf, "Highlights", Array(deep_dive_data["highlights"]))
    render_list(pdf, "Queries", Array(deep_dive_data["queries"]))
    render_profile_groups(pdf, deep_dive_data["profiles"])
    render_emails_found(pdf, deep_dive_data["emails_found"])
    render_first_contact(pdf, deep_dive_data["first_contact_suggestion"])
  end

  def render_social_profiles(pdf)
    section_title(pdf, "Saved Social Profiles")
    profiles = lead.social_profiles.order(:profile_type, :created_at).to_a
    if profiles.empty?
      field(pdf, "Profiles", "None")
      return
    end

    profiles.first(MAX_LINES_PER_LIST).each do |profile|
      line = "#{profile.profile_type}: #{profile.url}"
      line = "#{line} (#{profile.handle})" if profile.handle.present?
      line = "#{line} [#{profile.source}]" if profile.source.present?
      pdf.text "- #{line}", size: 10
    end
  end

  def render_contact_log(pdf)
    section_title(pdf, "Contact Log")
    communications = lead.communications.latest_first.limit(MAX_LINES_PER_LIST)
    if communications.empty?
      field(pdf, "Entries", "None")
      return
    end

    communications.each do |communication|
      header = [
        communication.channel,
        communication.outcome,
        format_time(communication.occurred_at)
      ].compact.join(" | ")
      pdf.text header, size: 10, style: :bold
      pdf.text "Summary: #{communication.summary}" if communication.summary.present?
      pdf.text "Link: #{communication.link}" if communication.link.present?
      pdf.text "Notes: #{communication.notes}" if communication.notes.present?
      pdf.move_down 6
    end
  end

  def render_generated_footer(pdf)
    pdf.move_down 10
    pdf.stroke_horizontal_rule
    pdf.move_down 8
    pdf.text "Generated #{format_time(Time.current)}", size: 9
  end

  def render_profile_groups(pdf, profiles_hash)
    return unless profiles_hash.is_a?(Hash)

    section_title(pdf, "Discovered Profile Links", compact: true)
    any_rows = false
    profiles_hash.each do |profile_type, urls|
      urls_array = Array(urls).compact
      next if urls_array.empty?

      any_rows = true
      pdf.text "#{profile_type}:", size: 10, style: :bold
      urls_array.first(MAX_LINES_PER_LIST).each { |url| pdf.text "- #{url}", size: 10 }
    end
    field(pdf, "Profiles", "None") unless any_rows
  end

  def render_emails_found(pdf, entries)
    emails = Array(entries)
    return if emails.empty?

    section_title(pdf, "Emails Found", compact: true)
    emails.first(MAX_LINES_PER_LIST).each do |entry|
      if entry.is_a?(Hash)
        email = entry["email"].to_s
        source = entry["source"].to_s
        line = email
        line = "#{line} (source: #{source})" if source.present?
        pdf.text "- #{line}", size: 10
      else
        pdf.text "- #{entry}", size: 10
      end
    end
  end

  def render_first_contact(pdf, suggestion)
    return unless suggestion.is_a?(Hash)

    section_title(pdf, "Suggested First Contact", compact: true)
    field(pdf, "Method", suggestion["method"])
    field(pdf, "Channel", suggestion["channel"])
    field(pdf, "Subject / Opener", suggestion["subject_line"])
    field(pdf, "Message", suggestion["message"])
    field(pdf, "Rationale", suggestion["rationale"])
    field(pdf, "Generated", format_time(suggestion["generated_at"]))
  end

  def section_title(pdf, title, compact: false)
    pdf.move_down(compact ? 8 : 14)
    pdf.text title, size: 12, style: :bold
    pdf.move_down 4
  end

  def field(pdf, label, value)
    return if value.to_s.strip.blank?

    pdf.text "#{label}: #{value.to_s}", size: 10
  end

  def render_list(pdf, label, values)
    rows = Array(values).map(&:to_s).map(&:strip).reject(&:blank?)
    return if rows.empty?

    pdf.text "#{label}:", size: 10, style: :bold
    rows.first(MAX_LINES_PER_LIST).each do |row|
      pdf.text "- #{row}", size: 10
    end
  end

  def format_confidence(value)
    return nil if value.nil?

    percentage = (value.to_f * 100).round
    "#{percentage}%"
  end

  def format_time(value)
    return nil if value.blank?

    value.in_time_zone.strftime("%Y-%m-%d %H:%M %Z")
  rescue StandardError
    value.to_s
  end
end
