require "set"
require "uri"
require "net/http"

class LeadDeepDiveService
  MAX_SEARCH_RESULTS = 30
  SEARCH_RESULTS_PER_QUERY = 10
  MAX_URLS_PER_TYPE = 2
  MAX_DOSSIERS = 14
  MAX_HIGHLIGHTS = 6
  MAX_QUERY_COUNT = 10
  MAX_SEARCH_WARNINGS = 4
  PROFILE_EXPANSION_WAVES = 3
  IDENTITY_MIN_CONFIDENCE = 0.82
  IDENTITY_REASON_MAX_LEN = 280
  WEBSITE_CLUE_MATCHES_REQUIRED = 2
  MAX_IDENTITY_CLUE_TOKENS = 28

  GENERIC_PROFILE_HANDLES = Set.new(%w[
    watch
    feed
    feeds
    home
    explore
    reels
    shorts
    videos
    channel
    channels
    user
    users
    about
    search
    results
  ]).freeze

  WEBSITE_HOST_BLOCKLIST = Set.new(%w[
    facebook.com
    m.facebook.com
    fb.com
    soundersfc.com
  ]).freeze

  LINK_AGGREGATOR_HOSTS = Set.new(%w[
    linktr.ee
    linktree.com
    beacons.ai
    beacons.page
    bio.site
    carrd.co
    allmylinks.com
    solo.to
  ]).freeze

  SHORTENER_HOSTS = Set.new(%w[
    t.co
    bit.ly
    tinyurl.com
    ow.ly
    buff.ly
    lnkd.in
  ]).freeze

  IDENTITY_TOKEN_STOPWORDS = Set.new(%w[
    about
    after
    all
    also
    and
    are
    as
    at
    away
    back
    because
    been
    before
    being
    but
    can
    did
    do
    does
    doing
    done
    each
    even
    every
    contact
    few
    get
    got
    had
    has
    having
    her
    here
    hers
    him
    his
    how
    i
    if
    in
    into
    is
    it
    its
    itself
    just
    made
    many
    may
    me
    might
    mine
    my
    myself
    for
    from
    of
    on
    only
    or
    other
    ours
    ourselves
    more
    most
    new
    no
    not
    now
    off
    one
    once
    our
    out
    over
    profile
    same
    she
    should
    site
    so
    some
    such
    that
    the
    their
    theirs
    them
    themselves
    then
    there
    these
    they
    those
    through
    too
    under
    until
    up
    us
    very
    was
    we
    were
    what
    when
    where
    which
    while
    who
    why
    will
    with
    you
    your
    yours
    yourself
    yourselves
    their
    this
  ]).freeze

  def initialize(
    search_scraper: PlaywrightWebSearchScraper.new,
    profile_scraper: PlaywrightProfileScraper.new,
    ai_client: AiProviderConfig.build_client
  )
    @search_scraper = search_scraper
    @profile_scraper = profile_scraper
    @ai_client = ai_client
    @identity_decision_cache = {}
    @identity_metadata_by_pair = {}
    @identity_clue_token_cache = {}
    @search_warnings = []
    @search_sources = []
  end

  def run!(lead)
    @identity_decision_cache = {}
    @identity_metadata_by_pair = {}
    @identity_clue_token_cache = {}
    @search_warnings = []
    @search_sources = []

    queries = build_queries(lead)
    search_results = collect_search_results(queries)
    profile_links = discover_profile_links(lead, search_results)

    sync_social_profiles!(lead, profile_links)
    dossiers = expand_profile_graph!(lead, profile_links)
    discovered_emails = extract_discovered_emails(dossiers)

    ai_summary = summarize(lead, search_results, dossiers, profile_links)
    primary_website = profile_links["website"]&.first
    resolved_website = lead.website.presence || normalize_url(primary_website)
    resolved_email = lead.email.presence || discovered_emails.first&.dig("email")

    existing_data = lead.deep_dive_data.is_a?(Hash) ? lead.deep_dive_data.deep_dup : {}
    existing_data.delete("first_contact_suggestion")

    lead.update!(
      website: resolved_website,
      email: resolved_email,
      deep_dive_status: "complete",
      deep_dive_error: nil,
      deep_dive_last_run_at: Time.current,
      first_contact_status: "idle",
      first_contact_error: nil,
      deep_dive_data: existing_data.merge(
        {
          "provider" => AiProviderConfig.provider,
          "model" => @ai_client.respond_to?(:model_name) ? @ai_client.model_name : nil,
          "queries" => queries,
          "profiles" => profile_links,
          "profile_dossiers" => dossiers,
          "summary" => ai_summary[:summary],
          "outreach_angle" => ai_summary[:outreach_angle],
          "next_step" => ai_summary[:next_step],
          "confidence" => ai_summary[:confidence],
          "highlights" => ai_summary[:highlights],
          "emails_found" => discovered_emails,
          "search_warnings" => @search_warnings.first(MAX_SEARCH_WARNINGS),
          "search_sources" => @search_sources.uniq,
          "search_results" => search_results.map { |result| serialize_search_result(result) }
        }
      )
    )
  end

  private

  def profile_types
    LeadSocialProfile::PROFILE_TYPES
  end

  def build_queries(lead)
    planned = build_queries_from_llm(lead)
    return planned if planned.present?

    fallback_queries(lead)
  end

  def build_queries_from_llm(lead)
    return nil unless @ai_client.respond_to?(:chat_json)

    response = @ai_client.chat_json(
      system: query_planner_system_prompt,
      user: query_planner_user_prompt(lead),
      schema: query_planner_schema
    )
    return nil unless response.is_a?(Hash)

    queries = normalize_queries(Array(response["queries"]))
    queries.presence
  rescue StandardError => e
    Rails.logger.warn("LeadDeepDiveService query planning fallback: #{e.class} #{e.message}")
    nil
  end

  def fallback_queries(lead)
    quoted_name = lead.name.to_s.strip
    cleaned_handle = lead.handle.to_s.delete_prefix("@").presence
    base = [
      quoted_name.presence && %("#{quoted_name}"),
      cleaned_handle,
      lead.role.to_s.presence,
      lead.country.to_s.presence
    ].compact.join(" ")

    platform_hint = lead.platform.to_s.strip
    platform_profile = platform_hint.present? ? "#{quoted_name} #{platform_hint} profile" : nil
    role_hint = lead.role.to_s.present? ? "#{quoted_name} #{lead.role}" : nil

    normalize_queries(
      [
        base,
        "#{quoted_name} official website",
        "#{quoted_name} profile",
        platform_profile,
        (cleaned_handle.present? ? "#{quoted_name} #{cleaned_handle} site:linkedin.com" : nil),
        (cleaned_handle.present? ? "#{quoted_name} #{cleaned_handle} site:x.com" : nil),
        (cleaned_handle.present? ? "#{quoted_name} #{cleaned_handle} site:instagram.com" : nil),
        (cleaned_handle.present? ? "#{quoted_name} #{cleaned_handle} site:youtube.com" : nil),
        (cleaned_handle.present? ? "#{quoted_name} #{cleaned_handle} linktree OR beacons OR carrd OR bio.site" : nil),
        "#{quoted_name} portfolio",
        "#{quoted_name} contact",
        "#{quoted_name} interviews",
        role_hint
      ]
    )
  end

  def normalize_queries(raw_queries)
    Array(raw_queries)
      .map { |query| query.to_s.squish }
      .reject(&:blank?)
      .uniq
      .first(MAX_QUERY_COUNT)
  end

  def query_planner_system_prompt
    <<~PROMPT
      You are the Deep Dive identity expansion planner.
      Objective: find additional profiles, websites, public contact info, and media/portfolio links for the same person.
      Rules:
      - Phase approach:
        1) Start from known identity signals (exact name, username, role, location, employer, known website).
        2) Generate platform-specific discovery queries for LinkedIn, X, Instagram, YouTube, personal site.
        3) Include link-aggregator discovery intent (linktree, beacons, carrd, bio.site) when relevant.
      - If a LinkedIn profile is available, prioritize links from the profile's "Contact info" section before broad web expansion.
      - Do NOT hardcode niche labels (for example "ai filmmaker") unless supported by evidence.
      - Prefer precision over recall. Avoid broad keyword stuffing.
      - Generate query variants using: full name, full name + role, full name + company, full name + location, unique username.
      - Return JSON only matching schema.
    PROMPT
  end

  def query_planner_user_prompt(lead)
    signal_hints = lead.signals.order(captured_at: :desc).limit(8).map do |signal|
      [
        signal.source,
        signal.author_name,
        signal.author_handle,
        signal.title,
        signal.content.to_s.truncate(180)
      ].compact.join(" | ")
    end

    communication_hints = lead.communications.order(occurred_at: :desc).limit(6).map do |communication|
      [
        communication.channel,
        communication.summary,
        communication.notes.to_s.truncate(160)
      ].compact.join(" | ")
    end

    profile_hints = lead.social_profiles.limit(12).map do |profile|
      [profile.profile_type, profile.handle, profile.url].compact.join(" | ")
    end

    <<~PROMPT
      Lead:
      - Name: #{lead.name}
      - Platform: #{lead.platform}
      - Handle: #{lead.handle}
      - Role: #{lead.role}
      - Country: #{lead.country}
      - Notes: #{lead.notes.to_s.truncate(500)}
      - Category: #{lead.ai_category}

      Recent signals:
      #{signal_hints.presence&.join("\n") || "none"}

      Existing profile hints:
      #{profile_hints.presence&.join("\n") || "none"}

      Communication hints:
      #{communication_hints.presence&.join("\n") || "none"}

      Task:
      Produce 6-10 high-signal search queries to find this exact person's other profiles and official website.
    PROMPT
  end

  def query_planner_schema
    {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_QUERY_COUNT
        }
      },
      required: %w[queries],
      additionalProperties: false
    }
  end

  def collect_search_results(queries)
    seen_urls = Set.new
    results = []

    queries.each do |query|
      query_results = @search_scraper.search(query, limit: SEARCH_RESULTS_PER_QUERY)
      capture_search_diagnostics(query: query)

      query_results.each do |result|
        normalized_url = normalize_url(result.url)
        next if normalized_url.blank? || seen_urls.include?(normalized_url)

        seen_urls.add(normalized_url)
        results << result
        break if results.size >= MAX_SEARCH_RESULTS
      end
      break if results.size >= MAX_SEARCH_RESULTS
    end

    results
  end

  def capture_search_diagnostics(query:)
    if @search_scraper.respond_to?(:last_warning)
      warning = @search_scraper.last_warning.to_s.squish
      if warning.present?
        message = "#{warning} (query: #{query})"
        @search_warnings << message unless @search_warnings.include?(message)
      end
    end

    if @search_scraper.respond_to?(:last_source)
      source = @search_scraper.last_source.to_s.squish
      @search_sources << source if source.present?
    end
  end

  def discover_profile_links(lead, search_results)
    links = profile_types.index_with { [] }
    append_profile_url(links, normalized_handle_url(lead), lead: lead, source: :lead_handle_seed)
    website_seed = normalized_seed_website(lead.website)
    append_profile_url(
      links,
      website_seed,
      lead: lead,
      source: website_seed_source(lead),
      type_hint: "website"
    )

    lead.social_profiles.where.not(source: "deep_dive").limit(50).pluck(:url).each do |url|
      append_profile_url(links, url, lead: lead, source: :existing_profile_seed)
    end

    lead.signals.order(captured_at: :desc).limit(30).select(:url, :author_name, :author_handle).each do |signal|
      append_profile_url(
        links,
        signal.url,
        lead: lead,
        source: :signal_seed,
        context_text: [signal.author_name, signal.author_handle].join(" ")
      )
    end

    lead.communications.order(occurred_at: :desc).limit(30).select(:link, :summary, :notes).each do |communication|
      append_profile_url(
        links,
        communication.link,
        lead: lead,
        source: :communication_seed,
        context_text: [communication.summary, communication.notes].join(" ")
      )
    end

    search_results.each do |result|
      append_profile_url(
        links,
        result.url,
        lead: lead,
        source: :search_result,
        context_text: [result.title, result.snippet].join(" ")
      )
    end

    links.transform_values { |urls| urls.uniq.first(MAX_URLS_PER_TYPE) }
  end

  def expand_profile_graph!(lead, profile_links)
    dossiers = []
    seen_urls = Set.new

    PROFILE_EXPANSION_WAVES.times do
      wave = scrape_profiles(profile_links, seen_urls: seen_urls)
      break if wave.empty?

      dossiers.concat(wave)
      added_links = process_discovered_links!(lead, profile_links, wave)

      break if dossiers.size >= MAX_DOSSIERS
      break unless added_links
    end

    dossiers.first(MAX_DOSSIERS)
  end

  def process_discovered_links!(lead, profile_links, dossiers)
    added_links = false

    dossiers.each do |dossier|
      context = [dossier[:title], dossier[:description], dossier[:profile_text]].join(" ")
      source = link_aggregator_url?(dossier[:url]) ? :link_hub_discovery : :profile_discovery

      Array(dossier[:links]).each do |url|
        next unless relevant_discovered_link?(dossier[:url], url)

        added = append_profile_url(
          profile_links,
          url,
          lead: lead,
          source: source,
          base_url: dossier[:url],
          context_text: context
        )
        added_links ||= added
      end
    end

    sync_social_profiles!(lead, profile_links) if added_links
    added_links
  end

  def website_seed_source(lead)
    return :lead_website_seed if lead.website.to_s.strip.present?

    :existing_profile_seed
  end

  def scrape_profiles(profile_links, seen_urls:)
    dossiers = []
    profile_links.each do |profile_type, urls|
      Array(urls).each do |url|
        normalized = normalize_url(url)
        next if normalized.blank? || seen_urls.include?(normalized)

        seen_urls.add(normalized)
        snapshot = @profile_scraper.fetch(
          normalized,
          channel_type: profile_type,
          include_about: profile_type == "website"
        )
        next unless snapshot

        dossiers << serialize_snapshot(snapshot)
        break if dossiers.size >= MAX_DOSSIERS
      end
      break if dossiers.size >= MAX_DOSSIERS
    end
    dossiers
  end

  def sync_social_profiles!(lead, profile_links)
    current_pairs = Set.new
    profile_links.each do |profile_type, urls|
      Array(urls).each do |url|
        current_pairs.add([profile_type, url])
      end
    end

    lead.social_profiles.where(source: "deep_dive").find_each do |existing_profile|
      pair = [existing_profile.profile_type, existing_profile.url]
      existing_profile.destroy unless current_pairs.include?(pair)
    end

    profile_links.each do |profile_type, urls|
      Array(urls).each do |url|
        normalized = normalize_url(url)
        next if normalized.blank?

        social_profile = lead.social_profiles.find_or_initialize_by(profile_type: profile_type, url: normalized)
        social_profile.handle = extract_handle_from_url(normalized, profile_type) if social_profile.handle.blank?
        social_profile.source = "deep_dive"
        metadata = (social_profile.metadata.presence || {}).merge(
          "last_seen_at" => Time.current.iso8601
        )
        decision = @identity_metadata_by_pair[[profile_type, normalized]]
        metadata["identity_validation"] = decision if decision.present?
        social_profile.metadata = metadata
        social_profile.save!
      end
    end
  end

  def summarize(lead, search_results, dossiers, profile_links)
    evidence_lines = []

    dossiers.first(10).each_with_index do |dossier, index|
      line = +"#{index + 1}. [#{dossier[:profile_type]}] #{dossier[:url]}"
      line << " | #{dossier[:title]}" if dossier[:title].present?
      line << " | #{dossier[:description]}" if dossier[:description].present?
      if dossier[:recent_posts].present?
        line << " | Recent posts: #{dossier[:recent_posts].first(2).join(' || ')}"
      end
      if dossier[:about_text].present?
        line << " | About: #{dossier[:about_text].truncate(260)}"
      end
      evidence_lines << line
    end

    if evidence_lines.empty?
      search_results.first(10).each_with_index do |result, index|
        evidence_lines << "#{index + 1}. #{result.title} | #{result.url} | #{result.snippet}"
      end
    end

    fallback = fallback_summary(profile_links)
    return fallback if evidence_lines.empty?

    response = @ai_client.chat_json(
      system: summary_system_prompt,
      user: summary_user_prompt(lead, evidence_lines),
      schema: summary_schema
    )
    return fallback unless response.is_a?(Hash)

    {
      summary: response["summary"].to_s.presence || fallback[:summary],
      outreach_angle: response["outreach_angle"].to_s.presence || fallback[:outreach_angle],
      next_step: response["next_step"].to_s.presence || fallback[:next_step],
      confidence: normalize_confidence(response["confidence"]),
      highlights: normalize_highlights(response["highlights"], fallback[:highlights])
    }
  rescue StandardError => e
    Rails.logger.warn("LeadDeepDiveService summarize fallback: #{e.class} #{e.message}")
    fallback_summary(profile_links)
  end

  def summary_system_prompt
    <<~PROMPT
      You analyze lead research evidence for StableGen outreach.
      Rules:
      - Use only provided evidence.
      - Do not invent facts.
      - Prioritize concrete findings from profiles, websites, and recent posts.
      - Keep output practical and concise.
      - Output JSON only matching the schema.
    PROMPT
  end

  def summary_user_prompt(lead, evidence_lines)
    <<~PROMPT
      Organization context:
      #{OrganizationOverviewContext.for(lead.organization)}

      Lead:
      - Name: #{lead.name}
      - Platform: #{lead.platform}
      - Handle: #{lead.handle}
      - Website: #{lead.website}
      - Role: #{lead.role}
      - Notes: #{lead.notes}
      - AI Category: #{lead.ai_category}

      Evidence:
      #{evidence_lines.join("\n")}

      Task:
      1) Write a factual summary of who this lead appears to be.
      2) Suggest an outreach angle aligned to StableGen.
      3) Suggest the smallest next step to contact them.
      4) Return 3-6 concrete highlights from the evidence.
      5) Confidence is 0 to 1.
    PROMPT
  end

  def summary_schema
    {
      type: "object",
      properties: {
        summary: { type: "string" },
        outreach_angle: { type: "string" },
        next_step: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        highlights: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_HIGHLIGHTS
        }
      },
      required: %w[summary outreach_angle next_step confidence highlights],
      additionalProperties: false
    }
  end

  def fallback_summary(profile_links)
    non_empty = profile_links.select { |_key, urls| urls.present? }.keys
    {
      summary: non_empty.any? ? "Found profile signals across: #{non_empty.join(', ')}." : "No reliable profiles found.",
      outreach_angle: "Reference one concrete piece of their recent public work.",
      next_step: "Send one short message with a single CTA.",
      confidence: 0.35,
      highlights: non_empty.first(MAX_HIGHLIGHTS).map { |key| "Found #{key} profile." }
    }
  end

  def append_profile_url(links, raw_url, lead:, source:, type_hint: nil, base_url: nil, context_text: nil)
    normalized = normalize_url(raw_url)
    return false if normalized.blank?
    normalized = expand_short_url(normalized)

    profile_type = type_hint.presence || profile_type_for_url(normalized)
    return false unless profile_type && links.key?(profile_type)
    return false if profile_type == "other"
    canonical = canonical_profile_url(normalized, profile_type)
    return false if canonical.blank?
    return false if links[profile_type].include?(canonical)

    source_key = source.to_sym
    identity_decision =
      if source_key == :lead_website_seed && profile_type == "website"
        {
          accepted: true,
          decision: "accept",
          confidence: 1.0,
          reason: "User-provided website seed.",
          strategy: "user_seed"
        }
      else
        decision = identity_validation_decision(
          lead,
          canonical,
          profile_type,
          source: source,
          base_url: base_url,
          context_text: context_text
        )
        return false unless decision[:accepted]

        decision
      end

    if links[profile_type].size >= MAX_URLS_PER_TYPE
      if profile_type == "website" && source_key == :lead_website_seed
        links[profile_type][0] = canonical
        remember_identity_metadata(profile_type, canonical, identity_decision)
        return true
      end

      if profile_type == "website" && link_aggregator_url?(canonical)
        replace_index = links[profile_type].find_index { |existing| !link_aggregator_url?(existing) }
        return false unless replace_index

        links[profile_type][replace_index] = canonical
        remember_identity_metadata(profile_type, canonical, identity_decision)
        return true
      end

      return false
    end

    links[profile_type] << canonical
    remember_identity_metadata(profile_type, canonical, identity_decision)
    true
  end

  def normalized_handle_url(lead)
    handle = lead.handle.to_s.strip
    return nil if handle.blank?
    return handle if handle.match?(%r{\Ahttps?://}i)

    cleaned = handle.delete_prefix("@")
    platform = lead.platform.to_s.downcase

    return "https://x.com/#{cleaned}" if platform.include?("x") || platform.include?("twitter")
    return "https://www.linkedin.com/in/#{cleaned}" if platform.include?("linkedin")
    return cleaned.start_with?("@") ? "https://www.youtube.com/#{cleaned}" : "https://www.youtube.com/@#{cleaned}" if platform.include?("youtube")
    return "https://www.instagram.com/#{cleaned}" if platform.include?("instagram")
    return "https://www.tiktok.com/@#{cleaned}" if platform.include?("tiktok")
    return "https://www.reddit.com/user/#{cleaned}" if platform.include?("reddit")

    cleaned.include?(".") ? "https://#{cleaned}" : nil
  end

  def normalized_seed_website(raw_website)
    value = raw_website.to_s.strip
    return nil if value.blank?
    return value if value.match?(%r{\Ahttps?://}i)
    return "https://#{value}" if value.match?(/\A[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?\z/i)

    value
  end

  def profile_type_for_url(url)
    host = URI.parse(url).host.to_s.downcase
    return nil if host.blank?
    return nil if host.include?("duckduckgo.com")

    return "x" if host == "x.com" || host == "twitter.com" || host.end_with?(".x.com")
    return "linkedin" if host.include?("linkedin.com")
    return "youtube" if host.include?("youtube.com") || host == "youtu.be"
    return "instagram" if host.include?("instagram.com")
    return "tiktok" if host.include?("tiktok.com")
    return "reddit" if host.include?("reddit.com")
    return "other" if host.include?("facebook.com") || host == "fb.com"

    return "website"

    "other"
  rescue URI::InvalidURIError
    "other"
  end

  def canonical_profile_url(url, profile_type)
    uri = URI.parse(url)
    segments = uri.path.to_s.split("/").reject(&:blank?)

    case profile_type
    when "x"
      handle = segments.first
      return nil if handle.blank?

      "https://x.com/#{handle.delete_prefix("@")}"
    when "linkedin"
      marker = segments.find_index { |segment| %w[in company school showcase].include?(segment.downcase) }
      return nil unless marker && segments[marker + 1].present?

      "https://www.linkedin.com/#{segments[marker]}/#{segments[marker + 1]}"
    when "youtube"
      first = segments.first
      return nil if first.blank?
      return nil if GENERIC_PROFILE_HANDLES.include?(first.delete_prefix("@").downcase)

      if first.start_with?("@")
        "https://www.youtube.com/#{first}"
      elsif %w[channel c user].include?(first.downcase) && segments[1].present?
        return nil if GENERIC_PROFILE_HANDLES.include?(segments[1].to_s.downcase)

        "https://www.youtube.com/#{first}/#{segments[1]}"
      else
        return nil if GENERIC_PROFILE_HANDLES.include?(first.delete_prefix("@").downcase)

        "https://www.youtube.com/@#{first.delete_prefix("@")}"
      end
    when "instagram"
      handle = segments.first
      return nil if handle.blank?

      "https://www.instagram.com/#{handle.delete_prefix("@")}"
    when "tiktok"
      handle = segments.first
      return nil if handle.blank?

      handle = "@#{handle.delete_prefix('@')}" unless handle.start_with?("@")
      "https://www.tiktok.com/#{handle}"
    when "reddit"
      if %w[user u].include?(segments.first&.downcase) && segments[1].present?
        "https://www.reddit.com/user/#{segments[1]}"
      elsif segments.first.present?
        "https://www.reddit.com/user/#{segments.first}"
      end
    when "website"
      host = uri.host.to_s.downcase.delete_prefix("www.")
      return nil if WEBSITE_HOST_BLOCKLIST.include?(host)

      if link_aggregator_url?(url)
        handle = segments.first.to_s.delete_prefix("@")
        return nil if handle.blank?

        return "#{uri.scheme}://#{uri.host}/#{handle}"
      end

      "#{uri.scheme}://#{uri.host}/"
    else
      url
    end
  rescue URI::InvalidURIError
    nil
  end

  def relevant_discovered_link?(base_url, candidate_url)
    profile_type = profile_type_for_url(candidate_url)
    return false if profile_type.blank?
    return false if profile_type == "other"
    return true if link_aggregator_url?(candidate_url)
    return true if %w[x linkedin youtube instagram tiktok reddit].include?(profile_type)
    return false unless profile_type == "website"
    return true if link_aggregator_url?(base_url)

    same_host?(base_url, candidate_url)
  end

  def same_host?(first_url, second_url)
    URI.parse(first_url).host.to_s.downcase == URI.parse(second_url).host.to_s.downcase
  rescue URI::InvalidURIError
    false
  end

  def link_aggregator_url?(url)
    host = URI.parse(url.to_s).host.to_s.downcase.delete_prefix("www.")
    return false if host.blank?

    LINK_AGGREGATOR_HOSTS.any? do |aggregator_host|
      host == aggregator_host || host.end_with?(".#{aggregator_host}")
    end
  rescue URI::InvalidURIError
    false
  end

  def extract_handle_from_url(url, profile_type)
    uri = URI.parse(url)
    segments = uri.path.to_s.split("/").reject(&:blank?)
    return nil if segments.empty?

    case profile_type
    when "x", "instagram"
      segments.first
    when "tiktok"
      segments.first.to_s.delete_prefix("@")
    when "reddit"
      if %w[user u].include?(segments.first&.downcase) && segments[1].present?
        segments[1]
      else
        segments.first
      end
    when "linkedin"
      marker = segments.find_index { |segment| %w[in company school showcase].include?(segment.downcase) }
      marker && segments[marker + 1].present? ? segments[marker + 1] : segments.first
    when "youtube"
      first = segments.first
      return first.delete_prefix("@") if first.start_with?("@")
      if %w[channel c user].include?(first.downcase) && segments[1].present?
        segments[1]
      else
        first
      end
    else
      nil
    end
  rescue URI::InvalidURIError
    nil
  end

  def identity_validation_decision(lead, canonical_url, profile_type, source:, base_url:, context_text:)
    cache_key = identity_cache_key(
      lead,
      canonical_url,
      profile_type,
      source: source,
      context_text: context_text
    )
    cached = @identity_decision_cache[cache_key]
    return cached if cached.present?

    handle = extract_handle_from_url(canonical_url, profile_type)
    if profile_type != "website" && generic_profile_handle?(handle)
      return cache_identity_decision(
        cache_key,
        accepted: false,
        decision: "reject",
        confidence: 1.0,
        reason: "Generic non-person handle/path.",
        strategy: "hard_rule"
      )
    end

    llm = llm_identity_decision(
      lead,
      canonical_url,
      profile_type,
      source: source,
      base_url: base_url,
      context_text: context_text,
      handle: handle
    )

    if llm.present?
      llm_accepted = llm[:decision] == "accept" && llm[:confidence] >= IDENTITY_MIN_CONFIDENCE
      accepted = llm_accepted
      decision = llm[:decision]
      confidence = llm[:confidence]
      reason = llm[:reason]
      strategy = "llm"

      if profile_type == "website"
        anchored = website_identity_anchor?(
          lead,
          canonical_url,
          source: source,
          base_url: base_url,
          context_text: context_text
        )
        exact_host_match = website_host_matches_full_name?(lead, canonical_url)
        exact_path_match = website_path_matches_identity?(lead, canonical_url)
        accepted = anchored && (llm_accepted || exact_host_match || exact_path_match)

        if accepted && !llm_accepted && (exact_host_match || exact_path_match)
          decision = "accept"
          confidence = [llm[:confidence], exact_host_match ? 0.92 : 0.87].max
          reason = if exact_host_match
            "Accepted by exact full-name host match despite conservative LLM rejection."
          else
            "Accepted by exact identity path match despite conservative LLM rejection."
          end
          strategy = "hybrid_rule"
        end
      end

      return cache_identity_decision(
        cache_key,
        accepted: accepted,
        decision: decision,
        confidence: confidence,
        reason: reason,
        strategy: strategy
      )
    end

    fallback_match = deterministic_identity_match?(
      lead,
      canonical_url,
      profile_type,
      source: source,
      base_url: base_url,
      context_text: context_text,
      handle: handle
    )
    exact_handle_seed = source.to_sym == :search_result && platform_handle_exact_match?(lead, profile_type, handle)
    allow_fallback_accept = %i[lead_handle_seed lead_website_seed].include?(source.to_sym) || exact_handle_seed

    cache_identity_decision(
      cache_key,
      accepted: fallback_match && allow_fallback_accept,
      decision: fallback_match && allow_fallback_accept ? "accept" : "reject",
      confidence: fallback_match && allow_fallback_accept ? 0.5 : 0.0,
      reason: "LLM unavailable; strict fallback #{fallback_match && allow_fallback_accept ? 'accepted trusted seed' : 'rejected candidate'}.",
      strategy: "fallback"
    )
  end

  def deterministic_identity_match?(lead, canonical_url, profile_type, source:, base_url:, context_text:, handle:)
    if profile_type == "website"
      return website_identity_anchor?(
        lead,
        canonical_url,
        source: source,
        base_url: base_url,
        context_text: context_text
      )
    end

    if strict_platform_handle_required?(lead, profile_type)
      return platform_handle_exact_match?(lead, profile_type, handle)
    end

    return true if platform_handle_exact_match?(lead, profile_type, handle)

    social_name_match?(lead, handle, context_text: context_text, strict_context: source == :search_result)
  end

  def llm_identity_decision(lead, canonical_url, profile_type, source:, base_url:, context_text:, handle:)
    return nil unless @ai_client.respond_to?(:chat_json)

    response = @ai_client.chat_json(
      system: identity_system_prompt,
      user: identity_user_prompt(
        lead,
        canonical_url,
        profile_type,
        source: source,
        base_url: base_url,
        context_text: context_text,
        handle: handle
      ),
      schema: identity_schema
    )
    return nil unless response.is_a?(Hash)

    decision = response["decision"].to_s.downcase
    return nil unless %w[accept reject unsure].include?(decision)

    {
      decision: decision,
      confidence: normalize_confidence(response["confidence"]),
      reason: response["reason"].to_s.squish.truncate(IDENTITY_REASON_MAX_LEN)
    }
  rescue StandardError => e
    Rails.logger.warn("LeadDeepDiveService identity LLM fallback: #{e.class} #{e.message}")
    nil
  end

  def identity_system_prompt
    <<~PROMPT
      You are an identity verifier for lead enrichment. Determine whether a candidate URL belongs to the exact same person as the lead.
      Reject aggressively when uncertain.
      Rules:
      - Name lookalikes are NOT matches. "Shana Nielsen" is NOT "Shana Nelson".
      - Missing letters, swapped letters, pluralization, and near-spellings are NOT matches.
      - Generic channels/pages (watch, feed, home, explore) are NOT person profiles.
      - If platform and known handle are provided for the same platform, require exact handle match after normalization.
      - If no exact platform handle, require at least 2 validation signals (cross-links, same location, same company, same bio phrasing, same portfolio/work, or strong handle/name match).
      - Link aggregators (Linktree/Beacons/etc.) are high-signal hubs only when identity matches the known lead handle/name.
      - Prefer false negatives over false positives.
      Return JSON only.
    PROMPT
  end

  def identity_user_prompt(lead, canonical_url, profile_type, source:, base_url:, context_text:, handle:)
    first_name, last_name = lead_name_identity(lead)
    normalized_lead_handle = normalized_identity_token(lead.handle.to_s.delete_prefix("@"))
    normalized_candidate_handle = normalized_identity_token(handle)

    <<~PROMPT
      Lead:
      - name: #{lead.name}
      - first_name_normalized: #{first_name}
      - last_name_normalized: #{last_name}
      - platform: #{lead.platform}
      - known_handle: #{lead.handle}
      - known_handle_normalized: #{normalized_lead_handle}
      - role: #{lead.role}
      - country: #{lead.country}

      Candidate:
      - url: #{canonical_url}
      - profile_type: #{profile_type}
      - extracted_handle: #{handle}
      - extracted_handle_normalized: #{normalized_candidate_handle}
      - source: #{source}
      - base_url: #{base_url}
      - context_text: #{context_text.to_s.truncate(500)}

      Decide:
      - accept only if this URL is very likely the exact same person.
      - reject if identity is ambiguous, partial, or near-match only.
    PROMPT
  end

  def identity_schema
    {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: %w[accept reject unsure]
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" }
      },
      required: %w[decision confidence reason],
      additionalProperties: false
    }
  end

  def identity_cache_key(lead, canonical_url, profile_type, source:, context_text:)
    [
      lead.id,
      canonical_url,
      profile_type,
      source.to_s,
      normalized_identity_token(context_text.to_s).to_s.first(220)
    ]
  end

  def cache_identity_decision(cache_key, accepted:, decision:, confidence:, reason:, strategy:)
    result = {
      accepted: accepted,
      decision: decision,
      confidence: confidence,
      reason: reason,
      strategy: strategy
    }
    @identity_decision_cache[cache_key] = result
    result
  end

  def remember_identity_metadata(profile_type, canonical_url, identity_decision)
    @identity_metadata_by_pair[[profile_type, canonical_url]] = {
      "decision" => identity_decision[:decision],
      "confidence" => identity_decision[:confidence],
      "reason" => identity_decision[:reason],
      "strategy" => identity_decision[:strategy]
    }
  end

  def generic_profile_handle?(handle)
    normalized = normalized_identity_token(handle)
    normalized.blank? || GENERIC_PROFILE_HANDLES.include?(normalized)
  end

  def website_identity_anchor?(lead, canonical_url, source:, base_url:, context_text:)
    return true if source.to_sym == :lead_website_seed
    return true if source.to_sym == :profile_discovery && base_url.present? && same_host?(base_url, canonical_url)

    if source.to_sym == :link_hub_discovery
      context = website_context_identity(lead, context_text)
      return true if context[:handle_match]
      return true if context[:name_match] && context[:clue_match_count] >= 1
    end

    context = website_context_identity(lead, context_text)
    host_has_name = website_host_matches_full_name?(lead, canonical_url)
    path_has_identity = website_path_matches_identity?(lead, canonical_url)

    if host_has_name
      return true unless context[:clues_present]

      return true if context[:handle_match]
      return true if context[:clue_match_count] >= 1
      return false
    end

    return false unless path_has_identity
    return true if context[:handle_match]
    return true if context[:name_match] && context[:clue_match_count] >= WEBSITE_CLUE_MATCHES_REQUIRED

    false
  rescue URI::InvalidURIError
    false
  end

  def website_host_matches_full_name?(lead, canonical_url)
    host = URI.parse(canonical_url).host.to_s.downcase.delete_prefix("www.")
    return false if host.blank?

    first_name, last_name = lead_name_identity(lead)
    first_name.present? && last_name.present? && host.include?(first_name) && host.include?(last_name)
  rescue URI::InvalidURIError
    false
  end

  def website_context_identity(lead, text)
    normalized_context = normalized_identity_token(text)
    context_tokens = extract_identity_tokens(text)
    context_token_set = context_tokens.to_set
    first_name, last_name = lead_name_identity(lead)
    known_handle = normalized_known_handle(lead)
    clue_tokens = lead_identity_clue_tokens(lead)
    role_clues = role_tokens(lead.role) + role_tokens(lead.ai_category.to_s.tr("_", " "))

    {
      name_match: first_name.present? && last_name.present? && context_token_set.include?(first_name) && context_token_set.include?(last_name),
      handle_match: known_handle.present? && normalized_context.include?(known_handle),
      role_match: role_clues.any? { |token| context_token_set.include?(token) },
      clue_match_count: clue_tokens.count { |token| context_token_set.include?(token) },
      clues_present: clue_tokens.present?
    }
  end

  def website_path_matches_identity?(lead, canonical_url)
    uri = URI.parse(canonical_url)
    segments = uri.path.to_s.split("/").reject(&:blank?)
    return false if segments.empty?

    normalized_segments = segments.map { |segment| normalized_identity_token(segment) }.reject(&:blank?)
    combined = normalized_segments.join("")
    return false if combined.blank?

    known_handle = normalized_known_handle(lead)
    return true if known_handle.present? && combined.include?(known_handle)

    first_name, last_name = lead_name_identity(lead)
    return false if first_name.blank? || last_name.blank?

    combined.include?(first_name) && combined.include?(last_name)
  rescue URI::InvalidURIError
    false
  end

  def social_name_match?(lead, handle, context_text:, strict_context:)
    first_name, last_name = lead_name_identity(lead)
    return false if first_name.blank? || last_name.blank?

    normalized_handle = normalized_identity_token(handle)
    return false if normalized_handle.blank?
    return false unless normalized_handle.include?(first_name) && normalized_handle.include?(last_name)
    return true unless strict_context

    context_mentions_full_name?(lead, context_text)
  end

  def context_mentions_full_name?(lead, text)
    normalized_context = normalized_identity_token(text)
    return false if normalized_context.blank?

    first_name, last_name = lead_name_identity(lead)
    normalized_context.include?(first_name) && normalized_context.include?(last_name)
  end

  def platform_handle_exact_match?(lead, profile_type, candidate_handle)
    expected_type = platform_profile_type(lead.platform)
    return false unless expected_type == profile_type

    lead_handle = normalized_known_handle(lead)
    return false if lead_handle.blank?

    normalized_identity_token(candidate_handle) == lead_handle
  end

  def strict_platform_handle_required?(lead, profile_type)
    expected_type = platform_profile_type(lead.platform)
    return false unless expected_type == profile_type

    normalized_known_handle(lead).present?
  end

  def platform_profile_type(platform)
    value = platform.to_s.downcase
    return "x" if value.include?("x") || value.include?("twitter")
    return "linkedin" if value.include?("linkedin")
    return "youtube" if value.include?("youtube")
    return "instagram" if value.include?("instagram")
    return "tiktok" if value.include?("tiktok")
    return "reddit" if value.include?("reddit")

    nil
  end

  def lead_name_identity(lead)
    tokens = lead.name.to_s.scan(/[[:alpha:]]+/).map { |token| normalized_identity_token(token) }.reject(&:blank?)
    [tokens.first, tokens.last]
  end

  def lead_identity_clue_tokens(lead)
    cache_key = lead.id || "new-#{lead.object_id}"
    return @identity_clue_token_cache[cache_key] if @identity_clue_token_cache.key?(cache_key)

    first_name, last_name = lead_name_identity(lead)
    sources = []
    sources << lead.role
    sources << lead.notes
    sources << lead.ai_category.to_s.tr("_", " ")

    if lead.persisted?
      known_handle = normalized_known_handle(lead)
      lead.signals.order(captured_at: :desc).limit(40).each do |signal|
        signal_handle = normalized_identity_token(signal.author_handle.to_s.delete_prefix("@"))
        signal_name = normalized_identity_token(signal.author_name.to_s)
        trusted = false
        trusted ||= known_handle.present? && signal_handle == known_handle
        trusted ||= first_name.present? && last_name.present? && signal_name.include?(first_name) && signal_name.include?(last_name)
        trusted ||= known_handle.present? && signal.url.to_s.downcase.include?(known_handle)
        next unless trusted

        sources << signal.title.to_s
        sources << signal.content.to_s
      end

      lead.communications.order(occurred_at: :desc).limit(10).each do |communication|
        sources << communication.summary.to_s
        sources << communication.notes.to_s
      end
    end

    tokens = extract_identity_tokens(sources.join(" "))
    tokens -= [first_name, last_name].compact
    @identity_clue_token_cache[cache_key] = tokens.first(MAX_IDENTITY_CLUE_TOKENS)
  end

  def normalized_known_handle(lead)
    normalized_identity_token(lead.handle.to_s.delete_prefix("@"))
  end

  def role_tokens(role)
    role.to_s.scan(/[[:alpha:]]+/)
      .map { |token| normalized_identity_token(token) }
      .select { |token| token.length >= 4 }
      .uniq
  end

  def normalized_identity_token(value)
    ActiveSupport::Inflector.transliterate(value.to_s).downcase.gsub(/[^a-z0-9]/, "")
  end

  def extract_identity_tokens(text)
    text.to_s.scan(/[[:alpha:]][[:alnum:]]+/)
      .map { |token| normalized_identity_token(token) }
      .select { |token| token.length >= 3 || token == "ai" }
      .reject { |token| IDENTITY_TOKEN_STOPWORDS.include?(token) }
      .uniq
  end

  def expand_short_url(url, redirect_limit: 3)
    uri = URI.parse(url)
    host = uri.host.to_s.downcase.delete_prefix("www.")
    return url unless SHORTENER_HOSTS.include?(host)

    current = uri
    redirect_limit.times do
      response = Net::HTTP.start(
        current.host,
        current.port,
        use_ssl: current.scheme == "https",
        open_timeout: 4,
        read_timeout: 6,
        write_timeout: 6
      ) do |http|
        request = Net::HTTP::Head.new(current)
        http.request(request)
      end

      break unless response.is_a?(Net::HTTPRedirection)

      location = response["location"].to_s
      break if location.blank?

      current = URI.join(current.to_s, location)
      break unless %w[http https].include?(current.scheme)
    end

    normalize_url(current.to_s) || url
  rescue StandardError
    url
  end

  def normalize_url(raw_url)
    value = raw_url.to_s.strip
    return nil if value.blank?
    return nil unless value.match?(%r{\Ahttps?://}i)

    uri = URI.parse(value)
    return nil if uri.host.blank?
    return nil if uri.host.include?("duckduckgo.com")

    uri.fragment = nil
    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def normalize_confidence(value)
    confidence = Float(value)
    confidence /= 100.0 if confidence > 1.0
    return 0.0 unless confidence.finite?

    confidence.clamp(0.0, 1.0)
  rescue ArgumentError, TypeError
    0.0
  end

  def normalize_highlights(value, fallback)
    highlights = Array(value).map { |item| item.to_s.strip }.reject(&:blank?).first(MAX_HIGHLIGHTS)
    highlights.any? ? highlights : fallback
  end

  def extract_discovered_emails(dossiers)
    seen = Set.new
    findings = []

    Array(dossiers).each do |dossier|
      source_url = dossier[:url].to_s.presence
      Array(dossier[:emails]).each do |candidate|
        email = candidate.to_s.strip.downcase
        next if email.blank?
        next unless email.match?(/\A[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\z/i)
        next if seen.include?(email)

        seen.add(email)
        findings << {
          "email" => email,
          "source" => source_url
        }
      end
    end

    findings.first(20)
  end

  def serialize_snapshot(snapshot)
    {
      profile_type: snapshot.channel_type,
      url: snapshot.final_url.presence || snapshot.url,
      title: snapshot.title.to_s,
      description: snapshot.description.to_s,
      profile_text: snapshot.profile_text.to_s.truncate(1200),
      about_url: snapshot.about_url.to_s,
      about_text: snapshot.about_text.to_s.truncate(1200),
      recent_posts: Array(snapshot.recent_posts).first(20),
      emails: Array(snapshot.emails).first(20),
      links: Array(snapshot.links).first(30)
    }
  end

  def serialize_search_result(result)
    {
      title: result.title.to_s,
      url: result.url.to_s,
      snippet: result.snippet.to_s,
      query: result.query.to_s
    }
  end
end
