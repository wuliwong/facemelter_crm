require "test_helper"

class LeadTuningFeedbackTest < ActiveSupport::TestCase
  test "includes rated feedback in dataset for both thumbs up and thumbs down" do
    lead = Lead.create!(
      organization: organizations(:one),
      name: "Fresh Lead",
      status: "new",
      deep_dive_status: "idle",
      first_contact_status: "idle"
    )

    feedback = LeadTuningFeedback.new(
      organization: organizations(:one),
      lead: lead,
      user: users(:one),
      rating: "up"
    )

    assert feedback.valid?
    assert_equal true, feedback.in_dataset

    feedback.rating = "down"
    assert feedback.valid?
    assert_equal true, feedback.in_dataset
  end

  test "rejects mismatched lead organization" do
    feedback = LeadTuningFeedback.new(
      organization: organizations(:one),
      lead: leads(:two),
      user: users(:one),
      rating: "up"
    )

    assert_not feedback.valid?
    assert_includes feedback.errors[:lead], "must belong to the same organization"
  end
end
