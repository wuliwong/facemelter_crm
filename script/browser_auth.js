const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const provider = (process.argv[2] || "").toLowerCase()

const PROVIDERS = {
  x: {
    url: "https://x.com/i/flow/login",
    profileDir:
      process.env.X_PROFILE_DIR || path.resolve("tmp/x_chrome_profile")
  },
  linkedin: {
    url: "https://www.linkedin.com/login",
    profileDir:
      process.env.LI_PROFILE_DIR || path.resolve("tmp/li_chrome_profile")
  }
}

const config = PROVIDERS[provider]
if (!config) {
  process.stderr.write(
    `Unknown provider "${provider}". Use: x, linkedin\n`
  )
  process.exit(1)
}

// Clean up stale lock file from previous sessions
const lockFile = path.join(config.profileDir, "SingletonLock")
try {
  fs.unlinkSync(lockFile)
} catch {
  // Lock file may not exist — that's fine
}

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const run = async () => {
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    channel: "chrome",
    userAgent,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  })

  const page = await context.newPage()
  await page.goto(config.url, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  })

  // Wait for the user to close the browser
  await new Promise((resolve) => {
    context.on("close", resolve)
    // Safety timeout: 5 minutes
    setTimeout(() => {
      context
        .close()
        .catch(() => {})
        .then(resolve)
    }, 300000)
  })

  process.stdout.write(JSON.stringify({ status: "ok", provider }))
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
