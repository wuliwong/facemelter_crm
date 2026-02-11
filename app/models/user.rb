class User < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable

  attr_accessor :organization_name

  belongs_to :organization

  enum :role, { admin: "admin", member: "member" }, default: "admin"

  before_validation :ensure_organization, on: :create

  private

  def ensure_organization
    return if organization.present?

    name = organization_name.to_s.strip
    name = default_organization_name if name.empty?
    self.organization = Organization.new(name: name)
  end

  def default_organization_name
    base = email.to_s.split("@").first.to_s.tr(".", " ").strip
    base = base.split.map(&:capitalize).join(" ")
    base = "Personal" if base.empty?
    "#{base} Organization"
  end
end
