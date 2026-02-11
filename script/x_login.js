const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const profileDir = path.resolve(process.argv[2] || "tmp/x_chrome_profile")

if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true })

const run = async () => {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  })

  const page = context.pages()[0] || await context.newPage()
  await page.goto("https://x.com/login")

  console.log("Log in to X in the browser window.")
  console.log("When done, just close the browser — session saves automatically.")

  await new Promise((resolve) => {
    context.on("close", resolve)
  })

  console.log("Session saved.")
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
