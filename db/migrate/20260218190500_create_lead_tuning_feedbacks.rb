class CreateLeadTuningFeedbacks < ActiveRecord::Migration[8.0]
  def change
    create_table :lead_tuning_feedbacks do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :lead, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :rating, null: false
      t.boolean :in_dataset, null: false, default: false
      t.jsonb :training_example, null: false, default: {}

      t.timestamps
    end

    add_index :lead_tuning_feedbacks, [:organization_id, :lead_id], unique: true
    add_index :lead_tuning_feedbacks, [:organization_id, :in_dataset]
  end
end
