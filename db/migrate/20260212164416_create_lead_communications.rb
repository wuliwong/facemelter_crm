class CreateLeadCommunications < ActiveRecord::Migration[8.0]
  def change
    create_table :lead_communications do |t|
      t.references :lead, null: false, foreign_key: true
      t.string :channel, null: false
      t.string :outcome, null: false, default: "sent"
      t.datetime :occurred_at, null: false
      t.datetime :responded_at
      t.string :link
      t.string :summary
      t.text :notes

      t.timestamps
    end

    add_index :lead_communications, [ :lead_id, :occurred_at ]
  end
end
