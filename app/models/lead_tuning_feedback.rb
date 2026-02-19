class LeadTuningFeedback < ApplicationRecord
  RATINGS = %w[up down].freeze

  belongs_to :organization
  belongs_to :lead
  belongs_to :user

  validates :rating, inclusion: { in: RATINGS }
  validates :lead_id, uniqueness: { scope: :organization_id }
  validate :lead_matches_organization

  before_validation :sync_in_dataset

  private

  def sync_in_dataset
    self.in_dataset = RATINGS.include?(rating.to_s)
  end

  def lead_matches_organization
    return if lead.blank? || organization.blank?
    return if lead.organization_id == organization_id

    errors.add(:lead, "must belong to the same organization")
  end
end
