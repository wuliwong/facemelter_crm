class LeadTuningExampleBuilder
  class << self
    def build(lead:, rating:)
      new(lead: lead, rating: rating).build
    end
  end

  def initialize(lead:, rating:)
    @lead = lead
    @rating = rating.to_s
  end

  def build
    {
      "format" => "openai_chat_jsonl_v1",
      "messages" => [
        { "role" => "system", "content" => LeadQualifier.system_prompt },
        { "role" => "user", "content" => user_prompt },
        { "role" => "assistant", "content" => assistant_completion.to_json }
      ],
      "metadata" => {
        "lead_id" => lead.id,
        "organization_id" => lead.organization_id,
        "rating" => rating,
        "captured_at" => Time.current.iso8601
      }
    }
  end

  private

  attr_reader :lead, :rating

  def user_prompt
    LeadQualifier.user_prompt(lead, scoring_signals, score_only: false)
  end

  def scoring_signals
    @scoring_signals ||= lead.signals.order(captured_at: :desc).limit(LeadQualifier::SIGNAL_LIMIT)
  end

  def assistant_completion
    {
      category: category_value,
      fit_score: fit_score_value,
      confidence: 0.99,
      reason: reason_value
    }
  end

  def category_value
    category = lead.ai_category.to_s
    return category if Lead::AI_CATEGORY_VALUES.include?(category)

    "unknown"
  end

  def fit_score_value
    base = lead.ai_fit_score.presence || lead.score.presence
    return base.to_i.clamp(0, 100) if base.present?

    rating == "up" ? 85 : 15
  end

  def reason_value
    base_reason = lead.ai_reason.to_s.squish
    return base_reason if base_reason.present?

    rating == "up" ? "Human reviewer approved this lead." : "Human reviewer rejected this lead."
  end
end
