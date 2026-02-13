const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const query = process.argv[2] || ""
const limit = Number.parseInt(process.argv[3] || "25", 10)

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
const profileDir =
  process.env.LI_PROFILE_DIR || path.resolve("tmp/li_chrome_profile")
const debug = process.env.LI_SCRAPE_DEBUG === "1"

// Clean up stale lock file from previous sessions
try {
  fs.unlinkSync(path.join(profileDir, "SingletonLock"))
} catch {
  // Lock file may not exist — that's fine
}

const buildSearchUrl = (q) =>
  `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}&sortBy=%22date_posted%22`

const extractPosts = async (page, max) => {
  return page.evaluate((maxItems) => {
    const cleanText = (value) =>
      (value || "")
        .replace(/\s+/g, " ")
        .trim()

    const parseHandleFromHref = (hrefValue) => {
      const href = (hrefValue || "").toString()
      if (!href) return ""

      const match = href.match(/linkedin\.com\/(in|company|school|showcase)\/([^/?#]+)/i)
      if (!match) return ""

      try {
        return decodeURIComponent(match[2]).trim()
      } catch {
        return match[2].trim()
      }
    }

    const results = []
    const containers = document.querySelectorAll(
      'div.feed-shared-update-v2, div[data-urn^="urn:li:activity"]'
    )

    for (const container of containers) {
      try {
        const urn =
          container.getAttribute("data-urn") ||
          container.getAttribute("data-id") ||
          ""
        const activityMatch = urn.match(/urn:li:activity:(\d+)/)
        const postId = activityMatch ? activityMatch[1] : null

        // Try to get the post URL from any link containing the activity ID
        let postUrl = ""
        if (postId) {
          const postLink = container.querySelector(
            `a[href*="${postId}"], a[href*="/feed/update/"]`
          )
          postUrl = postLink
            ? postLink.href
            : `https://www.linkedin.com/feed/update/urn:li:activity:${postId}/`
        }

        // Extract author info from the actor component
        const actorLink = container.querySelector(
          "a.update-components-actor__meta-link, .update-components-actor__meta a, .feed-shared-actor__meta a, span.feed-shared-actor__name a, a[data-control-name='actor']"
        )
        let authorName = ""
        let authorHandle = ""

        if (actorLink) {
          const nameSpan = actorLink.querySelector(
            "span.feed-shared-actor__name span, span.update-components-actor__name span, span[aria-hidden='true']"
          )

          if (nameSpan) {
            authorName = cleanText(nameSpan.innerText || nameSpan.textContent)
          } else {
            const actorLines = (actorLink.innerText || actorLink.textContent || "")
              .split("\n")
              .map((line) => cleanText(line))
              .filter(Boolean)
            authorName = actorLines[0] || ""
          }

          authorHandle = parseHandleFromHref(actorLink.href || "")
        }

        if (!authorHandle) {
          const profileLinks = container.querySelectorAll(
            "a[href*='linkedin.com/in/'], a[href*='linkedin.com/company/'], a[href*='linkedin.com/school/'], a[href*='linkedin.com/showcase/']"
          )
          for (const link of profileLinks) {
            const handle = parseHandleFromHref(link.href)
            if (handle) {
              authorHandle = handle
              break
            }
          }
        }

        // Fallback: try the top-level actor name
        if (!authorName) {
          const fallbackName = container.querySelector(
            ".update-components-actor__title span[aria-hidden='true'], span.feed-shared-actor__name span[aria-hidden='true'], span[dir='ltr'] span[aria-hidden='true']"
          )
          if (fallbackName) authorName = cleanText(fallbackName.innerText || fallbackName.textContent)
        }

        // Extract post content
        const contentEl = container.querySelector(
          ".feed-shared-update-v2__description, .update-components-text, .feed-shared-text, span.break-words"
        )
        const content = contentEl ? contentEl.innerText.trim() : ""

        // Extract timestamp
        const timeEl = container.querySelector(
          "time, span.feed-shared-actor__sub-description span, .update-components-actor__sub-description span"
        )
        let publishedAt = null
        if (timeEl) {
          const datetime = timeEl.getAttribute("datetime")
          if (datetime) {
            publishedAt = datetime
          }
        }

        // We need at minimum an ID and some author info to be useful
        const id = postId || `li-${Date.now()}-${results.length}`
        if (!authorName && !authorHandle) continue

        results.push({
          id,
          url: postUrl || "",
          content,
          author_name: authorName,
          author_handle: authorHandle,
          published_at: publishedAt
        })

        if (results.length >= maxItems) break
      } catch {
        // Skip problematic posts
      }
    }
    return results
  }, max)
}

const scrollToLoadMore = async (page, targetCount) => {
  let previousHeight = 0
  let scrollAttempts = 0
  const maxScrollAttempts = 10

  while (scrollAttempts < maxScrollAttempts) {
    const postCount = await page.evaluate(
      () =>
        document.querySelectorAll(
          'div.feed-shared-update-v2, div[data-urn^="urn:li:activity"]'
        ).length
    )
    if (postCount >= targetCount) break

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(2000)

    const newHeight = await page.evaluate(() => document.body.scrollHeight)
    if (newHeight === previousHeight) break
    previousHeight = newHeight
    scrollAttempts++
  }
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
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  })
  const page = await context.newPage()

  await page.goto(buildSearchUrl(query), {
    waitUntil: "domcontentloaded",
    timeout: 45000
  })

  // Wait for search results to appear
  try {
    await page
      .locator(
        'div.feed-shared-update-v2, div[data-urn^="urn:li:activity"]'
      )
      .first()
      .waitFor({ timeout: 20000 })
  } catch {
    if (debug) {
      const outDir = path.resolve("tmp")
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      await page.screenshot({
        path: path.join(outDir, "li_scrape_debug.png"),
        fullPage: true
      })
      fs.writeFileSync(
        path.join(outDir, "li_scrape_debug.html"),
        await page.content()
      )
      process.stderr.write(
        "No LinkedIn posts found — debug screenshot saved to tmp/li_scrape_debug.png\n"
      )
    }
  }

  // Scroll to load more results if needed
  const targetCount = Number.isFinite(limit) ? limit : 25
  await scrollToLoadMore(page, targetCount)

  const items = await extractPosts(page, targetCount)

  await context.close()
  process.stdout.write(JSON.stringify({ items }))
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
