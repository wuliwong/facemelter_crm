class CreateLeadSocialProfiles < ActiveRecord::Migration[8.0]
  def change
    create_table :lead_social_profiles do |t|
      t.references :lead, null: false, foreign_key: true
      t.string :profile_type, null: false
      t.string :url, null: false
      t.string :handle
      t.string :source, null: false, default: "deep_dive"
      t.text :notes
      t.jsonb :metadata, null: false, default: {}

      t.timestamps
    end

    add_index :lead_social_profiles, [:lead_id, :profile_type, :url], unique: true, name: "index_lead_social_profiles_uniqueness"
  end
end
