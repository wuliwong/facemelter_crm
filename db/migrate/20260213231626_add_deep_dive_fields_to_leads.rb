class AddDeepDiveFieldsToLeads < ActiveRecord::Migration[8.0]
  def change
    add_column :leads, :deep_dive_status, :string, null: false, default: "idle"
    add_column :leads, :deep_dive_last_run_at, :datetime
    add_column :leads, :deep_dive_error, :text
    add_column :leads, :deep_dive_data, :jsonb, null: false, default: {}
  end
end
