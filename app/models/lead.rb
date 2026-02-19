class Lead < ApplicationRecord
  belongs_to :organization
  has_many :signals, class_name: "SignalEvent", dependent: :nullify
  has_many :communications, class_name: "LeadCommunication", dependent: :destroy
  has_many :social_profiles, class_name: "LeadSocialProfile", dependent: :destroy
  has_one :tuning_feedback, class_name: "LeadTuningFeedback", dependent: :destroy

  STATUS_VALUES = %w[new needs_review contacted engaged interested onboarding active closed archived].freeze
  DEEP_DIVE_STATUS_VALUES = %w[idle queued running complete failed].freeze
  FIRST_CONTACT_STATUS_VALUES = %w[idle queued running complete failed].freeze
  AI_CATEGORY_VALUES = %w[
    ai_filmmaker
    ai_influencer
    ai_studio_or_agency
    traditional_filmmaker
    traditional_studio_or_agency
    educator_or_tutorial
    community_org
    operations_or_advisor
    marketing_or_ad_partner
    investor
    tool_company
    news_or_aggregator
    other
    unknown
  ].freeze

  validates :name, presence: true
  validates :status, inclusion: { in: STATUS_VALUES }, allow_blank: true
  validates :ai_category, inclusion: { in: AI_CATEGORY_VALUES }, allow_blank: true
  validates :deep_dive_status, inclusion: { in: DEEP_DIVE_STATUS_VALUES }, allow_blank: false
  validates :first_contact_status, inclusion: { in: FIRST_CONTACT_STATUS_VALUES }, allow_blank: false
end
