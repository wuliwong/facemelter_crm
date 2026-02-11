class Organization < ApplicationRecord
  has_many :users, dependent: :destroy
  has_many :leads, dependent: :destroy
  has_many :signals, class_name: "SignalEvent", dependent: :destroy

  validates :name, presence: true
end
