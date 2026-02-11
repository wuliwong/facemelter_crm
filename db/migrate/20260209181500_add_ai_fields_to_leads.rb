class AddAiFieldsToLeads < ActiveRecord::Migration[8.0]
  def change
    add_column :leads, :ai_category, :string
    add_column :leads, :ai_fit_score, :integer
    add_column :leads, :ai_confidence, :decimal, precision: 4, scale: 3
    add_column :leads, :ai_reason, :text
    add_column :leads, :ai_last_scored_at, :datetime
  end
end
