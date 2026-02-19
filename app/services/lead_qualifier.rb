class LeadQualifier
  CATEGORIES = Lead::AI_CATEGORY_VALUES.freeze

  RECENCY_WINDOW = 12.hours
  SIGNAL_LIMIT = 5

  def initialize(client: AiProviderConfig.build_client)
    @client = client
  end

  def qualify!(lead, force: false, score_only: false)
    if !force && lead.ai_last_scored_at && lead.ai_last_scored_at > RECENCY_WINDOW.ago
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} recent_score=#{lead.ai_last_scored_at}")
      return :skipped
    end

    signals = lead.signals.order(captured_at: :desc).limit(SIGNAL_LIMIT)
    if signals.empty?
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} no_signals")
      unless score_only
        lead.update!(ai_reason: "No signals to score. Add signals first.", ai_last_scored_at: Time.current)
      end
      return :no_signals
    end

    result = @client.chat_json(
      system: self.class.system_prompt,
      user: self.class.user_prompt(lead, signals, score_only: score_only),
      schema: response_schema
    )
    unless result.is_a?(Hash)
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} no_result")
      unless score_only
        lead.update!(ai_reason: "AI model did not return a result. Check your configured AI provider.", ai_last_scored_at: Time.current)
      end
      return :no_result
    end

    model_category = normalize_category(result["category"])
    fit_score = normalize_fit_score(result["fit_score"])
    confidence = normalize_confidence(result["confidence"])
    reason = result["reason"].to_s

    category =
      if score_only && lead.ai_category.present?
        normalize_category(lead.ai_category)
      else
        override_category(model_category, reason)
      end
    fit_score = enforce_score_cap(category, fit_score)

    updates = {
      ai_fit_score: fit_score,
      ai_last_scored_at: Time.current
    }

    if score_only
      updates[:score] = fit_score
    else
      updates[:ai_category] = category
      updates[:ai_confidence] = confidence
      updates[:ai_reason] = reason
      updates[:score] = fit_score

      if lead.status.blank? || lead.status == "new"
        updates[:status] = fit_score < 40 ? "needs_review" : "new"
      end
    end

    lead.update!(updates)
    Rails.logger.info(
      "LeadQualifier scored lead_id=#{lead.id} category=#{category} fit_score=#{fit_score} confidence=#{confidence} model=#{@client.model_name}"
    )
    result
  end

  private

  def self.system_prompt
    <<~PROMPT
      You qualify leads for StableGen, a product that helps AI filmmakers generate scripts and shot lists,
      and improve visual consistency in AI video workflows. Use only the evidence provided.
      Return JSON only, matching the schema.

      CRITICAL: The fit_score measures how likely this person/company would BECOME A CUSTOMER of StableGen.
      We are looking for AI filmmakers — people who CREATE AI films, short films, music videos, or
      narrative video content using AI tools. These are our potential customers.

      The following are NOT potential customers and MUST score below 30:
      - Competitors: companies building AI video tools, platforms, or workflows (they sell similar products)
      - Tool vendors: any company whose product overlaps with AI video generation or production tooling
      - News/aggregators: accounts that report on AI but do not create films
      - Corporate brands: companies using AI for marketing, not filmmaking
      - Creators explicitly rejecting AI workflows (for example anti-AI stance, anti-genAI messaging, or "no AI" positioning)

      Scoring rubric (fit_score 0-100):
      - 80-100: Individual or small team actively MAKING AI films or video projects. Evidence of actual
        creative output: short films, music videos, storyboards, ComfyUI pipelines, AI video production.
      - 60-79: Strong adjacent creator (educator/tutorials on AI video workflows) or studio/agency that
        PRODUCES AI video content (not builds tools).
      - 40-59: General creative/AI content creator with some relevance but not clearly making films.
      - 20-39: News, aggregators, community organizers, or unclear accounts.
      - 0-19: Competitors, tool vendors, platforms, or corporate brands. If they BUILD or SELL AI video
        tools rather than USE them to make films, they belong here regardless of how relevant they sound.

      Important:
      - If the evidence shows they criticize or reject AI-assisted filmmaking, they are not ai_filmmaker.
      - In that case choose a non-AI category and keep fit_score <= 30 unless there is strong contradictory evidence.
      - Use the full 0-100 scale. Do not default to 85 for every good lead.
      - For very strong customer evidence, score above 90.
      - High-end guidance:
        * 95-100: Multiple clear signals of active AI film production and frequent output.
        * 90-94: Clear AI filmmaker/studio evidence with concrete projects and tools.
        * 80-89: Good fit but evidence is thinner, older, or less specific.

      Categories:
      - ai_filmmaker: makes AI films or AI video projects (CUSTOMER)
      - ai_influencer: AI content creator or influencer promoting AI tools/workflows (POTENTIAL CUSTOMER)
      - ai_studio_or_agency: studio/agency producing AI video or film (CUSTOMER)
      - traditional_filmmaker: filmmaker/director/producer not clearly AI-native yet, but could adopt (CUSTOMER)
      - traditional_studio_or_agency: traditional studio/agency not yet AI-native (POTENTIAL CUSTOMER)
      - educator_or_tutorial: teaching AI video workflows (POTENTIAL CUSTOMER)
      - operations_or_advisor: operator, executive helper, or advisor contact (NETWORK CONTACT, usually not direct customer)
      - news_or_aggregator: news or reposting, not creating films (NOT CUSTOMER)
      - tool_company: vendor of AI tools/platforms (COMPETITOR — always score 0-19)
      - community_org: community organizer, festival, or collab host (NOT CUSTOMER)
      - marketing_or_ad_partner: marketing/ad/media distribution contact (PARTNER, not a customer)
      - investor: investor/VC/angel lead (CAPITAL CONTACT, not a customer)
      - other / unknown: insufficient or unrelated

      If evidence is thin, keep confidence low and avoid high scores.
    PROMPT
  end

  def self.user_prompt(lead, signals, score_only: false)
    signal_text = signals.map.with_index(1) do |signal, idx|
      <<~SIGNAL.strip
        #{idx}. #{signal.author_name} (#{signal.author_handle}) on #{signal.source}:
        #{signal.content.to_s.strip}
      SIGNAL
    end.join("\n\n")
    overview_text = OrganizationOverviewContext.for(lead.organization)

    <<~PROMPT
      Company Overview:
      #{overview_text}

      Lead:
      - Name: #{lead.name}
      - Handle: #{lead.handle}
      - Platform: #{lead.platform}
      - Source: #{lead.source}
      - Role: #{lead.role}
      - Notes: #{lead.notes}
      - Current category: #{lead.ai_category.presence || "uncategorized"}

      Signals:
      #{signal_text}

      Task:
      First write a short reason analyzing whether this lead CREATES AI films or SELLS AI tools.
      Then pick a category. Then assign fit_score and confidence consistent with that category.
      Use these categories: #{CATEGORIES.join(", ")}.
      #{score_only_category_instruction(lead, score_only)}
    PROMPT
  end

  def self.score_only_category_instruction(lead, score_only)
    return "" unless score_only
    return "" if lead.ai_category.blank?

    <<~INSTRUCTION.strip
      IMPORTANT: This is a score-only refresh. The user already set category to "#{lead.ai_category}".
      Treat that category as source of truth and calibrate fit_score to that category.
    INSTRUCTION
  end

  def response_schema
    {
      type: "object",
      properties: {
        reason: { type: "string" },
        category: { type: "string", enum: CATEGORIES },
        fit_score: { type: "integer", minimum: 0, maximum: 100 },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: %w[reason category fit_score confidence],
      additionalProperties: false
    }
  end

  SCORE_CAPS = {
    "tool_company" => 19,
    "news_or_aggregator" => 35,
    "community_org" => 35,
    "operations_or_advisor" => 39,
    "investor" => 35,
    "marketing_or_ad_partner" => 39,
    "other" => 39,
    "unknown" => 39
  }.freeze

  TOOL_PHRASES = [
    "developing tools",
    "building tools",
    "building a tool",
    "building a platform",
    "building an app",
    "tool company",
    "tool vendor",
    "platform for",
    "api keys",
    "not creating films",
    "not making films",
    "rather than creating",
    "rather than making",
    "competitor",
    "competing",
    "open source alternative",
    "open-source alternative",
    "sells a",
    "offers a platform",
    "offers a tool",
    "saas",
    "sdk"
  ].freeze

  def override_category(category, reason)
    return category if category == "tool_company"

    lower = reason.downcase
    return "tool_company" if TOOL_PHRASES.any? { |phrase| lower.include?(phrase) }

    category
  end

  def enforce_score_cap(category, score)
    cap = SCORE_CAPS[category]
    return score unless cap

    [score, cap].min
  end

  def normalize_category(value)
    normalized = value.to_s.strip
    return normalized if CATEGORIES.include?(normalized)

    "unknown"
  end

  def normalize_fit_score(value)
    score = Integer(value)
    score.clamp(0, 100)
  rescue ArgumentError, TypeError
    value.to_i.clamp(0, 100)
  end

  def normalize_confidence(value)
    confidence = Float(value)
    confidence /= 100.0 if confidence > 1.0
    return 0.0 unless confidence.finite?

    confidence.clamp(0.0, 1.0)
  rescue ArgumentError, TypeError
    0.0
  end
end
