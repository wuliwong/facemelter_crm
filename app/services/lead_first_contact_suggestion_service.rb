class LeadFirstContactSuggestionService
  METHODS = %w[pc pec ppc smykm].freeze
  OUTREACH_CONTEXT = <<~CONTEXT.freeze
    ICP
    Primary ICP:
    AI filmmakers and micro-drama creators shipping short narrative films with tools like Veo, Kling, and Runway. They care about story continuity, shot control, and repeatable character consistency.

    Secondary ICP:
    Small AI studios and indie directors producing serialized AI content for YouTube, TikTok, or branded narrative ads.

    Where they are:
    - YouTube AI filmmaking channels
    - X and Threads in AI film / generative video / micro-cinema
    - Discord communities around Veo, Kling, Runway, and Pika
    - Indie film and experimental film subreddits
    - Curious Refuge style education communities
    - Creator newsletters and AI creative bootcamps

    How to reach:
    - Direct outreach to creators publishing AI narrative shorts
    - Strategic comments on build-in-public workflow threads
    - Short demos showing scene locking, shot lists, and continuity
    - Private beta offers to active creators
    - Partnerships with AI filmmaking educators
    - Free 100-token onboarding for low-friction trial

    Value proposition:
    StableGen is a narrative pre-production and continuity system for AI filmmakers.
    It helps creators plan, lock, and generate structured scenes and character assets so films stay consistent across shots and iterations.
    It is workflow control, not just image generation.

    Top 3 benefits for $20/month:
    1) Continuity control: scene locking, structured prompts, version trees.
    2) Character consistency across scenes: reusable assets across poses and lighting.
    3) Structured story-to-shot pipeline: script -> scene breakdown -> shot list -> first/last frames.

    Pricing justification:
    If it saves 1-2 hours per project and reduces wasted generations, it pays for itself.
    For weekly AI filmmakers, it becomes infrastructure.
  CONTEXT

  def initialize(ai_client: AiProviderConfig.build_client)
    @ai_client = ai_client
  end

  def run!(lead)
    deep_dive_data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data.deep_dup : {}
    summary = deep_dive_data["summary"].to_s
    profile_dossiers = Array(deep_dive_data["profile_dossiers"])
    highlights = Array(deep_dive_data["highlights"])

    response = @ai_client.chat_json(
      system: system_prompt,
      user: user_prompt(lead, summary, profile_dossiers, highlights),
      schema: response_schema
    )

    suggestion = normalize_suggestion(response, lead, summary)
    deep_dive_data["first_contact_suggestion"] = suggestion

    lead.update!(
      first_contact_status: "complete",
      first_contact_error: nil,
      first_contact_last_run_at: Time.current,
      deep_dive_data: deep_dive_data
    )
  end

  private

  def system_prompt
    <<~PROMPT
      You are the StableGen outreach assistant.
      Write a first-contact suggestion based only on the provided lead research.
      Rules:
      - Do not invent facts.
      - Keep copy practical and short.
      - Tone: builder-led, clear, and confident.
      - No em dash.
      - Output JSON only matching the schema.
    PROMPT
  end

  def user_prompt(lead, summary, profile_dossiers, highlights)
    dossier_lines = profile_dossiers.first(8).map.with_index(1) do |dossier, idx|
      recent_posts = Array(dossier["recent_posts"]).first(2).join(" || ")
      [
        "#{idx}. #{dossier["profile_type"]} | #{dossier["url"]}",
        ("Title: #{dossier["title"]}" if dossier["title"].present?),
        ("Description: #{dossier["description"]}" if dossier["description"].present?),
        ("Recent posts: #{recent_posts}" if recent_posts.present?)
      ].compact.join(" | ")
    end

    <<~PROMPT
      Organization context:
      #{OrganizationOverviewContext.for(lead.organization)}

      Supplemental outreach context:
      #{OUTREACH_CONTEXT}

      Lead:
      - Name: #{lead.name}
      - Platform: #{lead.platform}
      - Handle: #{lead.handle}
      - Email: #{lead.email}
      - Website: #{lead.website}
      - Role: #{lead.role}
      - Notes: #{lead.notes}
      - AI Category: #{lead.ai_category}

      Deep dive summary:
      #{summary}

      Highlights:
      #{highlights.join("\n")}

      Evidence snippets:
      #{dossier_lines.join("\n")}

      Task:
      Create ONE best first contact recommendation with:
      - method: one of #{METHODS.join(", ")}
      - channel: best initial channel (x_dm, linkedin_dm, instagram_dm, email, youtube_comment, etc)
      - subject_line: personalized line if channel supports it, else short opener text
      - message: short outreach message
      - rationale: why this method+channel is best for this lead
    PROMPT
  end

  def response_schema
    {
      type: "object",
      properties: {
        method: { type: "string", enum: METHODS },
        channel: { type: "string" },
        subject_line: { type: "string" },
        message: { type: "string" },
        rationale: { type: "string" }
      },
      required: %w[method channel subject_line message rationale],
      additionalProperties: false
    }
  end

  def normalize_suggestion(response, lead, summary)
    fallback = fallback_suggestion(lead, summary)
    return fallback unless response.is_a?(Hash)

    method = response["method"].to_s.downcase
    method = fallback["method"] unless METHODS.include?(method)

    {
      "method" => method,
      "channel" => response["channel"].to_s.presence || fallback["channel"],
      "subject_line" => response["subject_line"].to_s.presence || fallback["subject_line"],
      "message" => response["message"].to_s.presence || fallback["message"],
      "rationale" => response["rationale"].to_s.presence || fallback["rationale"],
      "generated_at" => Time.current.iso8601
    }
  rescue StandardError
    fallback
  end

  def fallback_suggestion(lead, summary)
    {
      "method" => "smykm",
      "channel" => lead.email.present? ? "email" : "x_dm",
      "subject_line" => "Quick note on your AI filmmaking workflow",
      "message" => "Saw your recent work and wanted to share StableGen. It helps turn story ideas into scripts, shot lists, and production-ready prompts fast. If useful, I can send a short walkthrough and set you up with 100 free tokens.",
      "rationale" => summary.presence || "Fallback suggestion due to incomplete AI response.",
      "generated_at" => Time.current.iso8601
    }
  end
end
