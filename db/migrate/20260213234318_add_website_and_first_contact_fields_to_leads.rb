class AddWebsiteAndFirstContactFieldsToLeads < ActiveRecord::Migration[8.0]
  def change
    add_column :leads, :website, :string
    add_column :leads, :first_contact_status, :string, null: false, default: "idle"
    add_column :leads, :first_contact_last_run_at, :datetime
    add_column :leads, :first_contact_error, :text
  end
end
