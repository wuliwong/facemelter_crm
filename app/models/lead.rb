class Lead < ApplicationRecord
  belongs_to :organization
  has_many :signals, class_name: "SignalEvent", dependent: :nullify

  STATUS_VALUES = %w[new needs_review contacted interested onboarding active closed].freeze

  validates :name, presence: true
  validates :status, inclusion: { in: STATUS_VALUES }, allow_blank: true
end
