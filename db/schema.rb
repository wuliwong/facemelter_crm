# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_02_18_190500) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "lead_communications", force: :cascade do |t|
    t.bigint "lead_id", null: false
    t.string "channel", null: false
    t.string "outcome", default: "sent", null: false
    t.datetime "occurred_at", null: false
    t.datetime "responded_at"
    t.string "link"
    t.string "summary"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["lead_id", "occurred_at"], name: "index_lead_communications_on_lead_id_and_occurred_at"
    t.index ["lead_id"], name: "index_lead_communications_on_lead_id"
  end

  create_table "lead_social_profiles", force: :cascade do |t|
    t.bigint "lead_id", null: false
    t.string "profile_type", null: false
    t.string "url", null: false
    t.string "handle"
    t.string "source", default: "deep_dive", null: false
    t.text "notes"
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["lead_id", "profile_type", "url"], name: "index_lead_social_profiles_uniqueness", unique: true
    t.index ["lead_id"], name: "index_lead_social_profiles_on_lead_id"
  end

  create_table "lead_tuning_feedbacks", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "lead_id", null: false
    t.bigint "user_id", null: false
    t.string "rating", null: false
    t.boolean "in_dataset", default: false, null: false
    t.jsonb "training_example", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["lead_id"], name: "index_lead_tuning_feedbacks_on_lead_id"
    t.index ["organization_id", "in_dataset"], name: "index_lead_tuning_feedbacks_on_organization_id_and_in_dataset"
    t.index ["organization_id", "lead_id"], name: "index_lead_tuning_feedbacks_on_organization_id_and_lead_id", unique: true
    t.index ["organization_id"], name: "index_lead_tuning_feedbacks_on_organization_id"
    t.index ["user_id"], name: "index_lead_tuning_feedbacks_on_user_id"
  end

  create_table "leads", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.string "name"
    t.string "platform"
    t.string "handle"
    t.string "email"
    t.string "status"
    t.integer "score"
    t.string "source"
    t.string "role"
    t.string "country"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "ai_category"
    t.integer "ai_fit_score"
    t.decimal "ai_confidence", precision: 4, scale: 3
    t.text "ai_reason"
    t.datetime "ai_last_scored_at"
    t.string "deep_dive_status", default: "idle", null: false
    t.datetime "deep_dive_last_run_at"
    t.text "deep_dive_error"
    t.jsonb "deep_dive_data", default: {}, null: false
    t.string "website"
    t.string "first_contact_status", default: "idle", null: false
    t.datetime "first_contact_last_run_at"
    t.text "first_contact_error"
    t.index ["organization_id"], name: "index_leads_on_organization_id"
  end

  create_table "organizations", force: :cascade do |t|
    t.string "name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "overview"
  end

  create_table "signals", force: :cascade do |t|
    t.bigint "organization_id", null: false
    t.bigint "lead_id"
    t.string "source", null: false
    t.string "source_id"
    t.string "author_name"
    t.string "author_handle"
    t.string "title"
    t.text "content"
    t.text "url"
    t.datetime "captured_at"
    t.jsonb "metadata", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["lead_id"], name: "index_signals_on_lead_id"
    t.index ["organization_id", "source", "source_id"], name: "index_signals_on_org_source_and_source_id", unique: true
    t.index ["organization_id"], name: "index_signals_on_organization_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "organization_id", null: false
    t.string "role", default: "admin", null: false
    t.string "name"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["organization_id"], name: "index_users_on_organization_id"
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "lead_communications", "leads"
  add_foreign_key "lead_social_profiles", "leads"
  add_foreign_key "lead_tuning_feedbacks", "leads"
  add_foreign_key "lead_tuning_feedbacks", "organizations"
  add_foreign_key "lead_tuning_feedbacks", "users"
  add_foreign_key "leads", "organizations"
  add_foreign_key "signals", "leads"
  add_foreign_key "signals", "organizations"
  add_foreign_key "users", "organizations"
end
