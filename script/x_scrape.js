const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const query = process.argv[2] || ""
const limit = Number.parseInt(process.argv[3] || "25", 10)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
const profileDir = process.env.X_PROFILE_DIR || path.resolve("tmp/x_chrome_profile")
const debug = process.env.X_SCRAPE_DEBUG === "1"

// Clean up stale lock file from previous sessions
try {
  fs.unlinkSync(path.join(profileDir, "SingletonLock"))
} catch {
  // Lock file may not exist — that's fine
}

const buildSearchUrl = (q) =>
  `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`

const extractTweets = (articles, max) => {
  const results = []
  for (const article of articles) {
    const link = article.querySelector('a[href*="/status/"]')
    if (!link) continue
    const url = link.href
    const match = url.match(/\/([^/]+)\/status\/(\d+)/)
    if (!match) continue
    const handle = match[1]
    const statusId = match[2]

    const textEl = article.querySelector('div[data-testid="tweetText"]')
    const content = textEl ? textEl.innerText.trim() : ""

    const nameEl = article.querySelector('div[data-testid="User-Name"] span')
    const authorName = nameEl ? nameEl.innerText.trim() : handle

    const timeEl = article.querySelector("time")
    const publishedAt = timeEl ? timeEl.getAttribute("datetime") : null

    results.push({
      id: statusId,
      url,
      content,
      author_name: authorName,
      author_handle: handle,
      published_at: publishedAt
    })

    if (results.length >= max) break
  }
  return results
}

const run = async () => {
  if (!query.trim()) {
    process.stdout.write(JSON.stringify({ items: [] }))
    return
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: "chrome",
    userAgent,
    viewport: { width: 1280, height: 720 },
    args: ["--disable-blink-features=AutomationControlled"]
  })
  const page = await context.newPage()

  await page.goto(buildSearchUrl(query), { waitUntil: "domcontentloaded", timeout: 45000 })

  try {
    await page.locator("article").first().waitFor({ timeout: 15000 })
  } catch {
    if (debug) {
      const outDir = path.resolve("tmp")
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      await page.screenshot({ path: path.join(outDir, "x_scrape_debug.png"), fullPage: true })
      fs.writeFileSync(path.join(outDir, "x_scrape_debug.html"), await page.content())
      process.stderr.write("No articles found — debug screenshot saved to tmp/x_scrape_debug.png\n")
    }
  }

  const items = await page.$$eval("article", extractTweets, Number.isFinite(limit) ? limit : 25)

  await context.close()
  process.stdout.write(JSON.stringify({ items }))
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
