class LeadQualifier
  CATEGORIES = %w[
    ai_filmmaker
    studio_or_agency
    news_or_aggregator
    tool_company
    educator_or_tutorial
    community_org
    other
    unknown
  ].freeze

  RECENCY_WINDOW = 12.hours

  def initialize(client: OllamaClient.new)
    @client = client
  end

  def qualify!(lead, force: false)
    if !force && lead.ai_last_scored_at && lead.ai_last_scored_at > RECENCY_WINDOW.ago
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} recent_score=#{lead.ai_last_scored_at}")
      return :skipped
    end

    signals = lead.signals.order(captured_at: :desc).limit(5)
    if signals.empty?
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} no_signals")
      lead.update!(ai_reason: "No signals to score. Add signals first.", ai_last_scored_at: Time.current)
      return :no_signals
    end

    result = @client.chat_json(
      system: system_prompt,
      user: user_prompt(lead, signals),
      schema: response_schema
    )
    unless result.is_a?(Hash)
      Rails.logger.info("LeadQualifier skip: lead_id=#{lead.id} no_result")
      lead.update!(ai_reason: "AI model did not return a result. Check that Ollama is running.", ai_last_scored_at: Time.current)
      return :no_result
    end

    category = normalize_category(result["category"])
    fit_score = result["fit_score"].to_i
    confidence = result["confidence"].to_f
    confidence /= 100.0 if confidence > 1.0
    confidence = confidence.clamp(0.0, 1.0)
    reason = result["reason"].to_s

    category = override_category(category, reason)
    fit_score = enforce_score_cap(category, fit_score)

    updates = {
      ai_category: category,
      ai_fit_score: fit_score,
      ai_confidence: confidence,
      ai_reason: reason,
      ai_last_scored_at: Time.current
    }

    updates[:score] = fit_score if lead.score.blank?

    if lead.status.blank? || lead.status == "new"
      updates[:status] = fit_score < 40 ? "needs_review" : "new"
    end

    lead.update!(updates)
    Rails.logger.info(
      "LeadQualifier scored lead_id=#{lead.id} category=#{category} fit_score=#{fit_score} confidence=#{confidence} model=#{@client.model_name}"
    )
    result
  end

  private

  def system_prompt
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

      Scoring rubric (fit_score 0-100):
      - 80-100: Individual or small team actively MAKING AI films or video projects. Evidence of actual
        creative output: short films, music videos, storyboards, ComfyUI pipelines, AI video production.
      - 60-79: Strong adjacent creator (educator/tutorials on AI video workflows) or studio/agency that
        PRODUCES AI video content (not builds tools).
      - 40-59: General creative/AI content creator with some relevance but not clearly making films.
      - 20-39: News, aggregators, community organizers, or unclear accounts.
      - 0-19: Competitors, tool vendors, platforms, or corporate brands. If they BUILD or SELL AI video
        tools rather than USE them to make films, they belong here regardless of how relevant they sound.

      Categories:
      - ai_filmmaker: makes AI films or AI video projects (CUSTOMER)
      - studio_or_agency: studio/agency producing AI video or film (CUSTOMER)
      - educator_or_tutorial: teaching AI video workflows (POTENTIAL CUSTOMER)
      - news_or_aggregator: news or reposting, not creating films (NOT CUSTOMER)
      - tool_company: vendor of AI tools/platforms (COMPETITOR — always score 0-19)
      - community_org: community organizer, festival, or collab host (NOT CUSTOMER)
      - other / unknown: insufficient or unrelated

      If evidence is thin, keep confidence low and avoid high scores.
    PROMPT
  end

  def user_prompt(lead, signals)
    signal_text = signals.map.with_index(1) do |signal, idx|
      <<~SIGNAL.strip
        #{idx}. #{signal.author_name} (#{signal.author_handle}) on #{signal.source}:
        #{signal.content.to_s.strip}
      SIGNAL
    end.join("\n\n")

    <<~PROMPT
      Lead:
      - Name: #{lead.name}
      - Handle: #{lead.handle}
      - Platform: #{lead.platform}
      - Source: #{lead.source}
      - Role: #{lead.role}
      - Notes: #{lead.notes}

      Signals:
      #{signal_text}

      Task:
      First write a short reason analyzing whether this lead CREATES AI films or SELLS AI tools.
      Then pick a category. Then assign fit_score and confidence consistent with that category.
      Use these categories: #{CATEGORIES.join(", ")}.
    PROMPT
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
end
