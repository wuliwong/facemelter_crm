const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const query = process.argv[2] || ""
const limit = Number.parseInt(process.argv[3] || "8", 10)
const requestedEngine = (process.argv[4] || process.env.WEB_SEARCH_ENGINE || "google").toLowerCase()
const searchEngine = ["google", "duckduckgo"].includes(requestedEngine) ? requestedEngine : "google"
const debug = process.env.WEB_SCRAPE_DEBUG === "1"

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const buildSearchUrl = (q, engine) => {
  if (engine === "google") {
    return `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10&pws=0&safe=off`
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=web`
}

const extractDuckDuckGoResults = (maxItems) => {
  const decodeDuckDuckGoUrl = (value) => {
    const raw = (value || "").toString()
    if (!raw) return ""

    try {
      const url = new URL(raw, window.location.origin)
      if (url.hostname.includes("duckduckgo.com")) {
        const encoded = url.searchParams.get("uddg")
        if (encoded) return decodeURIComponent(encoded)
        return ""
      }
      return url.href
    } catch {
      // Ignore and return original value
    }

    return raw
  }

  const links = Array.from(
    document.querySelectorAll("a[data-testid='result-title-a'], h2 a, a.result__a")
  )

  const items = []
  const seen = new Set()

  for (const link of links) {
    const resolvedUrl = decodeDuckDuckGoUrl(link.href || link.getAttribute("href"))
    if (!resolvedUrl || seen.has(resolvedUrl)) continue

    const title = (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim()
    if (!title) continue

    const container =
      link.closest("article, .result, [data-layout='organic']") || link.parentElement
    const snippetEl =
      container &&
      container.querySelector(
        "[data-result='snippet'], .result__snippet, .kY2IgmnCmOGjharHErah, .OgdwYG6KE2qthn9XQWFC"
      )
    const snippet = snippetEl
      ? (snippetEl.innerText || snippetEl.textContent || "").replace(/\s+/g, " ").trim()
      : ""

    seen.add(resolvedUrl)
    items.push({
      title,
      url: resolvedUrl,
      snippet
    })

    if (items.length >= maxItems) break
  }

  return items
}

const extractGoogleResults = (maxItems) => {
  const decodeGoogleUrl = (value) => {
    const raw = (value || "").toString()
    if (!raw) return ""

    try {
      const url = new URL(raw, window.location.origin)
      if (url.hostname.includes("google.")) {
        if (url.pathname === "/url") {
          const q = url.searchParams.get("q")
          if (q) return q
          return ""
        }

        // Skip internal Google links.
        return ""
      }
      return url.href
    } catch {
      // Ignore and return original value
    }

    return raw
  }

  const headings = Array.from(document.querySelectorAll("#search a h3, #search h3 a"))
  const links = headings
    .map((heading) => heading.closest("a") || heading.parentElement)
    .filter(Boolean)

  const items = []
  const seen = new Set()

  for (const link of links) {
    const resolvedUrl = decodeGoogleUrl(link.href || link.getAttribute("href"))
    if (!resolvedUrl || seen.has(resolvedUrl)) continue
    if (!resolvedUrl.startsWith("http://") && !resolvedUrl.startsWith("https://")) continue

    const titleNode = link.querySelector("h3") || link
    const title = (titleNode.innerText || titleNode.textContent || "").replace(/\s+/g, " ").trim()
    if (!title) continue

    const container =
      link.closest("div.g, [data-sokoban-container], div[data-hveid], div[jscontroller]") ||
      link.parentElement
    const snippetEl = container?.querySelector("div.VwiC3b, div[data-sncf='1'], span.aCOpRe, .MUxGbd")
    const snippet = snippetEl
      ? (snippetEl.innerText || snippetEl.textContent || "").replace(/\s+/g, " ").trim()
      : ""

    seen.add(resolvedUrl)
    items.push({
      title,
      url: resolvedUrl,
      snippet
    })

    if (items.length >= maxItems) break
  }

  return items
}

const tryGoogleConsent = async (page) => {
  if (!page.url().includes("consent.google")) return

  const consentSelectors = [
    "button:has-text('Accept all')",
    "button:has-text('I agree')",
    "button:has-text('Agree')",
    "form [type='submit']"
  ]

  for (const selector of consentSelectors) {
    const button = page.locator(selector).first()
    if ((await button.count()) > 0) {
      await button.click({ timeout: 5000 }).catch(() => null)
      break
    }
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null)
}

const resultSelectorForEngine = (engine) =>
  engine === "google"
    ? "#search a h3, #search h3 a"
    : "a[data-testid='result-title-a'], h2 a, a.result__a"

const run = async () => {
  if (!query.trim()) {
    process.stdout.write(JSON.stringify({ engine: searchEngine, items: [] }))
    return
  }

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"]
  })

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 900 }
  })
  const page = await context.newPage()

  await page.goto(buildSearchUrl(query, searchEngine), {
    waitUntil: "domcontentloaded",
    timeout: 45000
  })

  if (searchEngine === "google") {
    await tryGoogleConsent(page)
  }

  try {
    await page.locator(resultSelectorForEngine(searchEngine)).first().waitFor({ timeout: 15000 })
  } catch {
    if (debug) {
      const outDir = path.resolve("tmp")
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      await page.screenshot({
        path: path.join(outDir, `web_search_debug_${searchEngine}.png`),
        fullPage: true
      })
      fs.writeFileSync(
        path.join(outDir, `web_search_debug_${searchEngine}.html`),
        await page.content()
      )
      process.stderr.write(
        `No ${searchEngine} web results found. Saved debug artifacts to tmp/.\n`
      )
    }
  }

  const maxItems = Number.isFinite(limit) && limit > 0 ? limit : 8
  const items = await page.evaluate(
    searchEngine === "google" ? extractGoogleResults : extractDuckDuckGoResults,
    maxItems
  )

  await context.close()
  await browser.close()

  process.stdout.write(JSON.stringify({ engine: searchEngine, items }))
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
