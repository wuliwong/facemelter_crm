require "test_helper"

class LeadTuningExampleBuilderTest < ActiveSupport::TestCase
  test "builds chat-format example with metadata" do
    lead = leads(:one)
    lead.update!(ai_category: "ai_filmmaker", ai_fit_score: 88, ai_reason: "Good fit")

    payload = LeadTuningExampleBuilder.build(lead: lead, rating: "up")

    assert_equal "openai_chat_jsonl_v1", payload["format"]
    assert_equal 3, payload["messages"].size
    assert_equal "system", payload["messages"][0]["role"]
    assert_equal LeadQualifier.system_prompt, payload["messages"][0]["content"]
    assert_equal "user", payload["messages"][1]["role"]
    assert_equal "assistant", payload["messages"][2]["role"]

    assistant = JSON.parse(payload["messages"][2]["content"])
    assert_equal "ai_filmmaker", assistant["category"]
    assert_equal 88, assistant["fit_score"]
    assert_equal "up", payload.dig("metadata", "rating")
  end
end
