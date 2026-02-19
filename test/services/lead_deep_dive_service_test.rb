require "test_helper"

class LeadDeepDiveServiceTest < ActiveSupport::TestCase
  setup do
    @service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: nil)
    @lead = Lead.new(name: "Shana Nielsen", handle: "shanalnielsen", platform: "LinkedIn")
  end

  test "requires exact handle match for the lead platform when handle is present" do
    links = fresh_links

    @service.send(
      :append_profile_url,
      links,
      "https://www.linkedin.com/in/shana-nielsen-71a65b70",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen director profile"
    )
    @service.send(
      :append_profile_url,
      links,
      "https://www.linkedin.com/in/shanalnielsen",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen director profile"
    )

    assert_equal ["https://www.linkedin.com/in/shanalnielsen"], links["linkedin"]
  end

  test "filters generic and mismatched deep dive links" do
    links = fresh_links

    @service.send(
      :append_profile_url,
      links,
      "https://www.youtube.com/@watch",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen"
    )
    @service.send(
      :append_profile_url,
      links,
      "https://www.instagram.com/shenanigansofshanna",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen"
    )
    @service.send(
      :append_profile_url,
      links,
      "https://www.facebook.com/shana",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen"
    )
    @service.send(
      :append_profile_url,
      links,
      "https://www.soundersfc.com",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen"
    )

    assert_empty links["youtube"]
    assert_empty links["instagram"]
    assert_empty links["website"]
    assert_empty links["other"]
  end

  test "allows website candidates when identity verifier accepts" do
    ai_client = Class.new do
      def chat_json(**)
        {
          "decision" => "accept",
          "confidence" => 0.96,
          "reason" => "Strong identity evidence."
        }
      end
    end.new

    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: ai_client)
    links = fresh_links

    service.send(
      :append_profile_url,
      links,
      "https://shana-nielsen.com/",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen ai filmmaker official website shanalnielsen"
    )

    assert_equal ["https://shana-nielsen.com/"], links["website"]
  end

  test "rejects website candidates that only match name in snippet without stronger anchors" do
    ai_client = Class.new do
      def chat_json(**)
        {
          "decision" => "accept",
          "confidence" => 0.99,
          "reason" => "Name appears in snippet."
        }
      end
    end.new

    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: ai_client)
    links = fresh_links

    service.send(
      :append_profile_url,
      links,
      "http://www.compasconsulting.com/aboutus/shanan.html",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen is passionate about helping others achieve professional success."
    )

    assert_empty links["website"]
  end

  test "accepts website with full-name host even when llm is conservative" do
    ai_client = Class.new do
      def chat_json(**)
        {
          "decision" => "reject",
          "confidence" => 0.9,
          "reason" => "No exact platform handle match."
        }
      end
    end.new

    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: ai_client)
    links = fresh_links

    service.send(
      :append_profile_url,
      links,
      "https://shana-nielsen.com/",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen ai filmmaker official website shanalnielsen"
    )

    assert_equal ["https://shana-nielsen.com/"], links["website"]
  end

  test "rejects full-name website when contextual clues do not match lead evidence" do
    ai_client = Class.new do
      def chat_json(**)
        {
          "decision" => "accept",
          "confidence" => 0.99,
          "reason" => "Name appears to match."
        }
      end
    end.new

    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: ai_client)
    service.define_singleton_method(:lead_identity_clue_tokens) { |_lead| %w[aidirector musicvideo dunedin] }
    links = fresh_links

    service.send(
      :append_profile_url,
      links,
      "https://shana-nielsen.com/",
      lead: @lead,
      source: :search_result,
      context_text: "Professional coaching and consulting services."
    )

    assert_empty links["website"]
  end

  test "rejects non-name website even when context strongly matches clues" do
    ai_client = Class.new do
      def chat_json(**)
        {
          "decision" => "reject",
          "confidence" => 0.85,
          "reason" => "No exact platform handle."
        }
      end
    end.new

    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: ai_client)
    service.define_singleton_method(:lead_identity_clue_tokens) { |_lead| %w[ai director music video filmmaking] }
    links = fresh_links

    service.send(
      :append_profile_url,
      links,
      "https://sequencer.media/studio",
      lead: @lead,
      source: :search_result,
      context_text: "Shana Nielsen AI Director and motion designer creating AI music videos and films."
    )

    assert_empty links["website"]
  end

  test "uses any existing lead website as a trusted seed" do
    lead = leads(:one)
    lead.update!(website: "https://wrong-example.test/")
    lead.social_profiles.create!(
      profile_type: "website",
      url: "https://wrong-example.test/",
      source: "deep_dive"
    )

    source = @service.send(:website_seed_source, lead)

    assert_equal :lead_website_seed, source
  end

  test "normalizes and keeps user-provided website seed for discovery" do
    lead = leads(:one)
    lead.update!(website: "manual-example.test")

    links = @service.send(:discover_profile_links, lead, [])

    assert_equal ["https://manual-example.test/"], links["website"]
  end

  test "run keeps existing lead website even when discovered website differs" do
    service = LeadDeepDiveService.new(search_scraper: nil, profile_scraper: nil, ai_client: nil)
    lead = leads(:one)
    lead.update!(website: "https://manual-example.test/")

    service.define_singleton_method(:build_queries) { |_lead| [] }
    service.define_singleton_method(:collect_search_results) { |_queries| [] }
    service.define_singleton_method(:discover_profile_links) do |_lead, _search_results|
      links = LeadSocialProfile::PROFILE_TYPES.index_with { [] }
      links["website"] = ["https://ai-discovered.example/"]
      links
    end
    service.define_singleton_method(:expand_profile_graph!) { |_lead, _profile_links| [] }
    service.define_singleton_method(:summarize) do |_lead, _search_results, _dossiers, _profile_links|
      {
        summary: "Summary",
        outreach_angle: "Angle",
        next_step: "Next step",
        confidence: 0.5,
        highlights: []
      }
    end

    service.run!(lead)

    assert_equal "https://manual-example.test/", lead.reload.website
  end

  private

  def fresh_links
    LeadSocialProfile::PROFILE_TYPES.index_with { [] }
  end
end
