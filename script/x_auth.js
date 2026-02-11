const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const storagePath = process.env.X_STORAGE_PATH || "tmp/x_storage.json"

const run = async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" })
  process.stdout.write("Log in to X in the opened browser, then press Enter here to save cookies.\n")

  await new Promise((resolve) => process.stdin.once("data", resolve))

  const outPath = path.resolve(storagePath)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  await context.storageState({ path: outPath })

  await browser.close()
  process.stdout.write(`Saved storage state to ${outPath}\n`)
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
