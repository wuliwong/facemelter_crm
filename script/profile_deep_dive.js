const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const inputUrl = process.argv[2] || ""
const channelType = process.argv[3] || "website"
const includeAbout = process.argv[4] === "1"
const debug = process.env.PROFILE_SCRAPE_DEBUG === "1"

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const normalizeText = (value, maxLength = 4000) =>
  (value || "").toString().replace(/\s+/g, " ").trim().slice(0, maxLength)

const normalizeUrl = (value) => {
  const raw = (value || "").toString().trim()
  if (!raw) return ""

  try {
    const url = new URL(raw)
    if (!/^https?:$/i.test(url.protocol)) return ""
    url.hash = ""
    return url.toString()
  } catch {
    return ""
  }
}

const sameHost = (left, right) => {
  try {
    return new URL(left).host === new URL(right).host
  } catch {
    return false
  }
}

const extractPageData = async (page) => {
  return page.evaluate(() => {
    const clean = (value, maxLength = 4000) =>
      (value || "").toString().replace(/\s+/g, " ").trim().slice(0, maxLength)
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

    const title = clean(document.title, 300)
    const description = clean(
      document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
      600
    )

    const mainNode = document.querySelector("main") || document.body
    const profileText = clean(mainNode?.innerText || "", 5000)

    const postSelectors = [
      "article",
      "[data-testid='tweetText']",
      "div.feed-shared-update-v2",
      "div[data-urn^='urn:li:activity']",
      "ytd-rich-item-renderer",
      "[role='article']",
      ".post",
      ".entry"
    ]

    const seen = new Set()
    const recentPosts = []
    for (const selector of postSelectors) {
      const nodes = Array.from(document.querySelectorAll(selector))
      for (const node of nodes) {
        const text = clean(node.innerText || node.textContent || "", 800)
        if (!text || text.length < 45) continue
        if (seen.has(text)) continue
        seen.add(text)
        recentPosts.push(text)
        if (recentPosts.length >= 20) break
      }
      if (recentPosts.length >= 20) break
    }

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((link) => {
        const href = link.href || link.getAttribute("href") || ""
        const text = clean(link.textContent || "", 120).toLowerCase()
        return { href, text }
      })
      .filter((item) => item.href && /^https?:\/\//i.test(item.href))

    const textEmails = (mainNode?.innerText || "").match(emailRegex) || []
    const mailtoEmails = Array.from(document.querySelectorAll("a[href^='mailto:']"))
      .map((anchor) => (anchor.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0])
      .filter(Boolean)

    const emails = Array.from(
      new Set([...textEmails, ...mailtoEmails].map((email) => clean(email, 160).toLowerCase()))
    ).slice(0, 20)

    const aboutCandidate =
      links.find((item) => item.text.includes("about"))?.href ||
      links.find((item) => /\/about([/?#]|$)/i.test(item.href))?.href ||
      ""

    return {
      final_url: window.location.href,
      title,
      description,
      profile_text: profileText,
      recent_posts: recentPosts,
      links: links.map((item) => item.href),
      emails,
      about_candidate: aboutCandidate
    }
  })
}

const scrapeLinkedInContactInfo = async (page) => {
  const result = { links: [], emails: [] }
  const triggerSelectors = [
    "a#top-card-text-details-contact-info",
    "a[href*='/overlay/contact-info/']",
    "a[data-control-name='contact_see_more']",
    "a:has-text('Contact info')",
    "button:has-text('Contact info')"
  ]

  let opened = false
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first()
    if ((await trigger.count()) === 0) continue

    try {
      await trigger.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null)
      await trigger.click({ timeout: 3500 })
      opened = true
      break
    } catch {
      // Try the next selector.
    }
  }

  if (!opened) return result

  await page.waitForTimeout(900)

  try {
    const extracted = await page.evaluate(() => {
      const clean = (value, maxLength = 4000) =>
        (value || "").toString().replace(/\s+/g, " ").trim().slice(0, maxLength)
      const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

      const decodeLinkedInRedirect = (value) => {
        const raw = (value || "").toString().trim()
        if (!raw) return ""

        try {
          const url = new URL(raw, window.location.origin)
          if (url.hostname.includes("linkedin.com") && url.pathname.includes("/redir/redirect")) {
            const nested = url.searchParams.get("url")
            if (nested) return decodeURIComponent(nested)
          }

          return url.href
        } catch {
          return raw
        }
      }

      const modalCandidates = Array.from(
        document.querySelectorAll(".pv-contact-info, .artdeco-modal, [role='dialog']")
      )
      const modalRoot =
        modalCandidates.find((node) => {
          const text = (node.innerText || "").toLowerCase()
          return text.includes("contact info") || text.includes("website") || text.includes("email")
        }) || null

      const root = modalRoot || document.body
      const links = Array.from(root.querySelectorAll("a[href]"))
        .map((anchor) => decodeLinkedInRedirect(anchor.getAttribute("href") || anchor.href))
        .filter((href) => /^https?:\/\//i.test(href))

      const mailtoEmails = Array.from(root.querySelectorAll("a[href^='mailto:']"))
        .map((anchor) => (anchor.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0])
        .filter(Boolean)
      const textEmails = (root.innerText || "").match(emailRegex) || []
      const emails = Array.from(
        new Set([...mailtoEmails, ...textEmails].map((email) => clean(email, 160).toLowerCase()))
      ).filter(Boolean)

      return {
        links: Array.from(new Set(links)),
        emails
      }
    })

    result.links = Array.isArray(extracted?.links) ? extracted.links : []
    result.emails = Array.isArray(extracted?.emails) ? extracted.emails : []
  } catch (error) {
    if (debug) {
      process.stderr.write(`LinkedIn contact info scrape failed: ${error?.message || String(error)}\n`)
    }
  }

  const closeSelectors = [
    "button[aria-label='Dismiss']",
    "button[aria-label='Close']",
    ".artdeco-modal__dismiss",
    "button:has-text('Done')"
  ]

  for (const selector of closeSelectors) {
    const closeButton = page.locator(selector).first()
    if ((await closeButton.count()) === 0) continue

    try {
      await closeButton.click({ timeout: 1500 })
      break
    } catch {
      // Try next close selector.
    }
  }

  await page.keyboard.press("Escape").catch(() => null)
  await page.waitForTimeout(250)
  return result
}

const run = async () => {
  const normalizedInput = normalizeUrl(inputUrl)
  if (!normalizedInput) {
    process.stdout.write(JSON.stringify({}))
    return
  }

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"]
  })
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1360, height: 920 }
  })
  const page = await context.newPage()

  let mainData = {
    final_url: normalizedInput,
    title: "",
    description: "",
    profile_text: "",
    recent_posts: [],
    links: [],
    emails: [],
    about_candidate: ""
  }

  try {
    await page.goto(normalizedInput, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    })
    await page.waitForTimeout(1200)

    let contactInfoData = { links: [], emails: [] }
    if (channelType === "linkedin") {
      contactInfoData = await scrapeLinkedInContactInfo(page)
    }

    mainData = await extractPageData(page)
    if (Array.isArray(contactInfoData.links) && contactInfoData.links.length > 0) {
      mainData.links = Array.from(new Set([...(mainData.links || []), ...contactInfoData.links]))
    }
    if (Array.isArray(contactInfoData.emails) && contactInfoData.emails.length > 0) {
      mainData.emails = Array.from(new Set([...(mainData.emails || []), ...contactInfoData.emails]))
    }
  } catch (error) {
    if (debug) {
      const outDir = path.resolve("tmp")
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      await page.screenshot({
        path: path.join(outDir, "profile_scrape_debug.png"),
        fullPage: true
      })
      fs.writeFileSync(path.join(outDir, "profile_scrape_debug.html"), await page.content())
      process.stderr.write(`Profile scrape failed: ${error?.message || String(error)}\n`)
    }
  }

  let aboutUrl = ""
  let aboutText = ""
  const candidate = normalizeUrl(mainData.about_candidate)

  if (includeAbout && candidate && sameHost(candidate, mainData.final_url || normalizedInput)) {
    const aboutPage = await context.newPage()
    try {
      await aboutPage.goto(candidate, { waitUntil: "domcontentloaded", timeout: 30000 })
      await aboutPage.waitForTimeout(900)
      const aboutData = await extractPageData(aboutPage)
      aboutUrl = normalizeUrl(aboutData.final_url || candidate)
      aboutText = normalizeText(aboutData.profile_text, 5000)
    } catch (error) {
      if (debug) {
        process.stderr.write(`About page scrape failed: ${error?.message || String(error)}\n`)
      }
    } finally {
      await aboutPage.close()
    }
  }

  const payload = {
    url: normalizedInput,
    final_url: normalizeUrl(mainData.final_url || normalizedInput),
    channel_type: channelType,
    title: normalizeText(mainData.title, 300),
    description: normalizeText(mainData.description, 600),
    profile_text: normalizeText(mainData.profile_text, 5000),
    recent_posts: Array.isArray(mainData.recent_posts)
      ? mainData.recent_posts.map((item) => normalizeText(item, 800)).filter(Boolean).slice(0, 20)
      : [],
    emails: Array.isArray(mainData.emails)
      ? mainData.emails.map((item) => normalizeText(item, 160).toLowerCase()).filter(Boolean).slice(0, 20)
      : [],
    links: Array.isArray(mainData.links)
      ? mainData.links.map((item) => normalizeUrl(item)).filter(Boolean).slice(0, 40)
      : [],
    about_url: aboutUrl,
    about_text: aboutText
  }

  await context.close()
  await browser.close()
  process.stdout.write(JSON.stringify(payload))
}

run().catch((error) => {
  process.stderr.write(error?.stack || String(error))
  process.exit(1)
})
