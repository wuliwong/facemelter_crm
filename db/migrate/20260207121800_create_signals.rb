class CreateSignals < ActiveRecord::Migration[8.0]
  def change
    create_table :signals do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :lead, foreign_key: true
      t.string :source, null: false
      t.string :source_id
      t.string :author_name
      t.string :author_handle
      t.string :title
      t.text :content
      t.text :url
      t.datetime :captured_at
      t.jsonb :metadata, default: {}

      t.timestamps
    end

    add_index :signals, [:organization_id, :source, :source_id],
              unique: true,
              name: "index_signals_on_org_source_and_source_id"
  end
end
