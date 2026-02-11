organization = Organization.find_or_create_by!(name: "Caldera Studio")

test_email = "faye.burns@facemeltercrm.test"
test_password = "facemelter123"

test_user = User.find_or_initialize_by(email: test_email)
test_user.name = "Faye Burns"
test_user.organization = organization
test_user.role = "admin"
if test_user.new_record? || test_user.encrypted_password.blank?
  test_user.password = test_password
  test_user.password_confirmation = test_password
end
test_user.save!

leads_data = [
  {
    name: "Avery Lin",
    platform: "YouTube",
    handle: "@avlinfilms",
    email: "avery@signalfire.ai",
    status: "needs_review",
    score: 6,
    source: "youtube_search",
    role: "AI Filmmaker",
    country: "US",
    notes: "AI short 'Signal Fire' posted 3 weeks ago. Uses Runway + Pika."
  },
  {
    name: "Mila Santos",
    platform: "YouTube",
    handle: "@mila_santos_ai",
    email: "mila@santos.studio",
    status: "contacted",
    score: 8,
    source: "youtube_search",
    role: "Director",
    country: "US",
    notes: "Behind-the-scenes breakdown of AI storyboard workflow."
  },
  {
    name: "Devon Park",
    platform: "X",
    handle: "@devonparkai",
    email: "devon@parkfilms.com",
    status: "new",
    score: 5,
    source: "x_search",
    role: "Creator",
    country: "US",
    notes: "Posted AI trailer experiments; no clear project timeline."
  },
  {
    name: "Noah Price",
    platform: "X",
    handle: "@noahpricefilm",
    email: "noah@priceworks.io",
    status: "interested",
    score: 7,
    source: "x_search",
    role: "Producer",
    country: "US",
    notes: "Asked about script-to-shot workflow for a short series."
  },
  {
    name: "Aria Chen",
    platform: "YouTube",
    handle: "@ariachenstudio",
    email: "aria@chenstudio.tv",
    status: "onboarding",
    score: 9,
    source: "youtube_search",
    role: "Studio Lead",
    country: "US",
    notes: "Actively producing AI mini-series; wants faster shot lists."
  },
  {
    name: "Caleb Rivera",
    platform: "X",
    handle: "@caleb_rivera",
    email: "caleb@rivera.art",
    status: "closed",
    score: 3,
    source: "x_search",
    role: "Hobbyist",
    country: "US",
    notes: "Not a fit right now (personal experiments only)."
  },
  {
    name: "Sofia Nguyen",
    platform: "YouTube",
    handle: "@sofiangn",
    email: "sofia@ngnfilms.com",
    status: "needs_review",
    score: 6,
    source: "youtube_search",
    role: "AI Filmmaker",
    country: "US",
    notes: "Shared AI short + storyboard breakdown last month."
  },
  {
    name: "Jules Moreau",
    platform: "X",
    handle: "@jmoreaufilm",
    email: "jules@moreaustudio.com",
    status: "active",
    score: 8,
    source: "x_search",
    role: "Agency Creative Lead",
    country: "US",
    notes: "Agency testing AI pre-production for clients."
  },
  {
    name: "Iris Patel",
    platform: "YouTube",
    handle: "@irispatelcreates",
    email: "iris@patelcreates.com",
    status: "contacted",
    score: 6,
    source: "youtube_search",
    role: "Content Creator",
    country: "US",
    notes: "Posted AI short with 80k views; interested in faster script drafts."
  },
  {
    name: "Evan Holt",
    platform: "X",
    handle: "@evanholt_ai",
    email: "evan@holtmedia.io",
    status: "new",
    score: 4,
    source: "x_search",
    role: "Creator",
    country: "US",
    notes: "Experimenting with Sora prompts, no production yet."
  },
  {
    name: "Talia Brooks",
    platform: "YouTube",
    handle: "@taliabrooks_ai",
    email: "talia@brooksfilm.co",
    status: "interested",
    score: 7,
    source: "youtube_search",
    role: "Filmmaker",
    country: "US",
    notes: "Wants consistent character assets across scenes."
  },
  {
    name: "Rohan Malik",
    platform: "X",
    handle: "@rohanmalikfilm",
    email: "rohan@malikworks.com",
    status: "new",
    score: 5,
    source: "x_search",
    role: "Producer",
    country: "US",
    notes: "Looking for script + shot list automation."
  }
]

leads_data.each do |attrs|
  lead = organization.leads.find_or_initialize_by(handle: attrs[:handle])
  lead.assign_attributes(attrs)
  lead.save!
end

puts "Seeded #{organization.name} with #{organization.leads.count} leads."
puts "Login: #{test_email} / #{test_password}"
