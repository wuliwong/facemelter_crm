class AddOrganizationToUsers < ActiveRecord::Migration[8.0]
  def change
    add_reference :users, :organization, null: false, foreign_key: true
    add_column :users, :role, :string, null: false, default: "admin"
  end
end
