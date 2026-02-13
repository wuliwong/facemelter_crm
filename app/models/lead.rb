class Lead < ApplicationRecord
  belongs_to :organization
  has_many :signals, class_name: "SignalEvent", dependent: :nullify
  has_many :communications, class_name: "LeadCommunication", dependent: :destroy

  STATUS_VALUES = %w[new needs_review contacted engaged interested onboarding active closed archived].freeze
  AI_CATEGORY_VALUES = %w[
    ai_filmmaker
    traditional_filmmaker
    studio_or_agency
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
end
