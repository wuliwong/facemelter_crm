class LeadCommunication < ApplicationRecord
  belongs_to :lead

  CHANNEL_VALUES = %w[
    x_dm
    x_comment
    followed_on_x
    linkedin_dm
    linkedin_comment
    connected_on_linkedin
    email
    youtube_comment
    instagram_dm
    reddit_dm
    phone_call
    other
  ].freeze

  OUTCOME_VALUES = %w[
    sent
    no_response
    replied
    in_conversation
    meeting_scheduled
    not_interested
    converted
  ].freeze

  before_validation :set_defaults

  validates :channel, inclusion: { in: CHANNEL_VALUES }
  validates :outcome, inclusion: { in: OUTCOME_VALUES }
  validates :occurred_at, presence: true
  validates :link, length: { maximum: 500 }, allow_blank: true
  validates :summary, length: { maximum: 500 }, allow_blank: true

  scope :latest_first, -> { order(occurred_at: :desc, id: :desc) }

  private

  def set_defaults
    self.outcome = "sent" if outcome.blank?
    self.occurred_at ||= Time.current
  end
end
