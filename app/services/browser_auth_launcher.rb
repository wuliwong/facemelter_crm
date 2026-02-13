require "open3"

class BrowserAuthLauncher
  PROVIDERS = %w[x linkedin].freeze
  SCRIPT_PATH = Rails.root.join("script/browser_auth.js").to_s

  PROFILE_DIRS = {
    "x" => -> { ENV.fetch("X_PROFILE_DIR", Rails.root.join("tmp/x_chrome_profile").to_s) },
    "linkedin" => -> { ENV.fetch("LI_PROFILE_DIR", Rails.root.join("tmp/li_chrome_profile").to_s) }
  }.freeze

  def self.launch(provider)
    provider = provider.to_s.downcase
    unless PROVIDERS.include?(provider)
      return { error: "unknown_provider", provider: provider }
    end

    pid = spawn("node", SCRIPT_PATH, provider, out: File::NULL, err: File::NULL)
    Process.detach(pid)

    { status: "launched", provider: provider, pid: pid }
  end

  def self.status
    PROVIDERS.each_with_object({}) do |provider, result|
      dir = PROFILE_DIRS[provider].call
      result[provider] = if Dir.exist?(dir) && Dir.children(dir).any?
        "connected"
      else
        "disconnected"
      end
    end
  end

  def self.disconnect(provider)
    provider = provider.to_s.downcase
    unless PROVIDERS.include?(provider)
      return { error: "unknown_provider", provider: provider }
    end

    dir = PROFILE_DIRS[provider].call
    if Dir.exist?(dir)
      FileUtils.rm_rf(dir)
    end

    { status: "disconnected", provider: provider }
  end
end
