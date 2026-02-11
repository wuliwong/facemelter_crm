class CreateLeads < ActiveRecord::Migration[8.0]
  def change
    create_table :leads do |t|
      t.references :organization, null: false, foreign_key: true
      t.string :name
      t.string :platform
      t.string :handle
      t.string :email
      t.string :status
      t.integer :score
      t.string :source
      t.string :role
      t.string :country
      t.text :notes

      t.timestamps
    end
  end
end
