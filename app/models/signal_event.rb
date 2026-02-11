class SignalEvent < ApplicationRecord
  self.table_name = "signals"

  belongs_to :organization
  belongs_to :lead, optional: true

  validates :source, presence: true
end
