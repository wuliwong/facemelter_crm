class LeadSocialProfile < ApplicationRecord
  belongs_to :lead

  PROFILE_TYPES = %w[
    x
    linkedin
    youtube
    instagram
    tiktok
    reddit
    website
    other
  ].freeze

  validates :profile_type, inclusion: { in: PROFILE_TYPES }
  validates :url, presence: true, length: { maximum: 500 }
  validates :handle, length: { maximum: 255 }, allow_blank: true
  validates :source, length: { maximum: 100 }, allow_blank: false
end
