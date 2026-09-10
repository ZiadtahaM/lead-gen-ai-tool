#!/usr/bin/env node
// Real Google Maps Live Scraper — runs ONLY inside GitHub Actions (Node + Playwright + real Chromium).
// Ported 1:1 from the original core/harvester.py `harvest_google_maps` logic.
// Cloudflare Workers cannot run a browser — this is the piece that fills that gap for free,
// using GitHub Actions' free compute minutes instead of a paid VPS.
//
// Usage: node scrape.mjs --keyword "صيانة مكيفات" --location "Riyadh, Saudi Arabia" --market ksa --max-results 12 --job-id abc123
//
// On completion, POSTs the raw harvested leads to CALLBACK_URL (Cloudflare Pages /api/leads/import)
// authenticated with IMPORT_TOKEN (both provided as env vars / GitHub secrets).

import { chromium } from 'playwright'

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'
      out[key] = val
    }
  }
  return out
}

function extractPhoneFromText(text) {
  // Egypt
  let m = text.match(/(?:(?:\+?20|0020)[\s.-]?)?0?1[0125][\s.-]?\d{3,4}[\s.-]?\d{4}/)
  if (m) return m[0].trim()
  // KSA
  m = text.match(/(?:(?:\+?966|00966)[\s.-]?)?0?5\d[\s.-]?\d{3}[\s.-]?\d{4}/)
  if (m) return m[0].trim()
  // Morocco
  m = text.match(/(?:(?:\+?212|00212)[\s.-]?)?0?[5-7](?:[\s.-]?\d{2}){4}/)
  if (m) return m[0].trim()
  // US/Canada
  m = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
  if (m) return m[0].trim()
  // General international
  m = text.match(/\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)
  if (m) {
    const candidate = m[0].trim()
    if (candidate.replace(/\D/g, '').length >= 9) return candidate
  }
  return ''
}

function detectCountry(locFull) {
  const loc = locFull.toLowerCase()
  if (['cairo', 'alexandria', 'giza', 'egypt', 'mansoura', 'مصر', 'القاهرة', 'الإسكندرية', 'الجيزة'].some(c => loc.includes(c))) return 'Egypt'
  if (['riyadh', 'jeddah', 'khobar', 'dammam', 'mecca', 'medina', 'saudi', 'ksa', 'الرياض', 'جدة', 'السعودية'].some(c => loc.includes(c))) return 'Saudi Arabia'
  if (['casablanca', 'rabat', 'marrakech', 'tanger', 'fes', 'agadir', 'maroc', 'morocco', 'المغرب', 'كازا'].some(c => loc.includes(c))) return 'Morocco'
  if (['miami', 'orlando', 'tampa', 'florida', 'usa', 'us', 'texas', 'california', 'new york'].some(c => loc.includes(c))) return 'USA'
  return 'International'
}

async function harvestGoogleMaps(keyword, location, maxResults) {
  const query = `${keyword} ${location}`.trim()
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
  console.log(`[Scraper] Searching Google Maps for: "${query}"`)

  const results = []
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US'
  })
  const page = await context.newPage()

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(2500)

    // Consent handling (EN/FR/AR)
    const consentSelectors = [
      "button:has-text('Accept all')",
      "button:has-text('Tout accepter')",
      "button:has-text('قبول الكل')",
      "button:has-text('الموافقة على الكل')",
      "form[action*='consent'] button"
    ]
    for (const sel of consentSelectors) {
      try {
        const btn = await page.$(sel)
        if (btn) {
          await btn.click()
          await page.waitForTimeout(1000)
          break
        }
      } catch {}
    }

    await page.waitForSelector("div.Nv2PK, a.hfpxzc, div[role='feed']", { timeout: 15000 }).catch(() => {})

    // Scroll feed to load more results
    const feedElem = await page.$("div[role='feed']")
    for (let i = 0; i < 4; i++) {
      const cardCount = await page.$$eval('div.Nv2PK, a.hfpxzc', els => els.length).catch(() => 0)
      if (cardCount >= maxResults) break
      if (feedElem) {
        await feedElem.evaluate(el => el.scrollBy(0, 1200)).catch(() => {})
      } else {
        await page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {})
      }
      await page.waitForTimeout(1200)
    }

    let cards = await page.$$('div.Nv2PK')
    if (!cards.length) cards = await page.$$('a.hfpxzc')

    console.log(`[Scraper] Found ${cards.length} business listings on map feed.`)
    const targetCount = Math.min(cards.length, maxResults)

    for (let idx = 0; idx < targetCount; idx++) {
      try {
        cards = await page.$$('div.Nv2PK')
        if (idx >= cards.length) break
        const card = cards[idx]

        const linkElem = await card.$('a.hfpxzc')
        let bizName = linkElem ? await linkElem.getAttribute('aria-label') : ''
        let mapsUrl = linkElem ? await linkElem.getAttribute('href') : ''

        if (!bizName) {
          const nameElem = await card.$('.qBF1Pd, .fontHeadlineSmall')
          bizName = nameElem ? (await nameElem.innerText()).trim() : `Business #${idx + 1}`
        }

        let rating = 0
        let reviewsCount = 0
        // Primary: the rating+review count both live in one aria-label on the star-icon span,
        // e.g. aria-label="4.8 stars 237 Reviews" — far more stable than nested class names
        // which Google renders differently across locales/card layouts.
        const ratingImgElem = await card.$("span[role='img'][aria-label]")
        const ariaLabel = ratingImgElem ? (await ratingImgElem.getAttribute('aria-label')) || '' : ''
        const ariaMatch = ariaLabel.match(/([\d.,]+)\s*stars?\s*([\d,]+)\s*Reviews?/i)
        if (ariaMatch) {
          rating = parseFloat(ariaMatch[1].replace(',', '.'))
          reviewsCount = parseInt(ariaMatch[2].replace(/\D/g, ''), 10)
        } else {
          // Fallback: older class-based selectors (kept for resilience if Google changes markup again)
          const ratingElem = await card.$("span.MW4etd, div.F7nice span[aria-hidden='true']")
          if (ratingElem) {
            try { rating = parseFloat((await ratingElem.innerText()).replace(',', '.').trim()) } catch {}
          }
          const revElem = await card.$('span.UY7F9, div.F7nice span:nth-child(2)')
          if (revElem) {
            try {
              const digits = (await revElem.innerText()).replace(/[^\d]/g, '')
              if (digits) reviewsCount = parseInt(digits, 10)
            } catch {}
          }
        }

        let website = ''
        const webBtn = await card.$(
          "a[data-value*='Site Web'], a[data-value*='Website'], a[aria-label*='Site Web'], a[aria-label*='Website'], a[data-value*='الموقع'], a[aria-label*='الموقع'], a.lcr4fd"
        )
        if (webBtn) website = (await webBtn.getAttribute('href')) || ''

        const cardText = await card.innerText()
        let phone = extractPhoneFromText(cardText)

        if (!phone && linkElem) {
          try {
            await linkElem.click()
            await page.waitForTimeout(700)

            const phoneBtn = await page.$(
              "button[data-item-id*='phone:tel:'], button[aria-label*='téléphone'], button[aria-label*='Phone'], button[aria-label*='الهاتف']"
            )
            if (phoneBtn) {
              const dataId = (await phoneBtn.getAttribute('data-item-id')) || ''
              if (dataId.includes('phone:tel:')) {
                phone = dataId.replace('phone:tel:', '').trim()
              } else {
                phone = extractPhoneFromText(await phoneBtn.innerText())
              }
            }

            if (!phone) {
              const panel = await page.$('div.m6QErb')
              if (panel) phone = extractPhoneFromText(await panel.innerText())
            }

            if (!website) {
              const detailWeb = await page.$("a[data-item-id='authority'], a[aria-label*='Site Web'], a[aria-label*='Website'], a[aria-label*='الموقع']")
              if (detailWeb) website = (await detailWeb.getAttribute('href')) || (await detailWeb.innerText()).trim()
            }
          } catch {}
        }

        let address = location
        const lines = cardText.split('\n').map(l => l.trim()).filter(Boolean)
        for (const l of lines) {
          if (['rue', 'bd', 'ave', 'quartier', 'bloc', 'street', 'st', 'road', 'طريق', 'شارع', 'حي'].some(w => l.toLowerCase().includes(w))) {
            address = l
            break
          }
        }

        let placeId = `gmap_${idx}_${Math.abs(hashCode(bizName))}`
        if (mapsUrl && mapsUrl.includes('/place/')) {
          const parts = mapsUrl.split('/place/')[1].split('/')[0]
          placeId = decodeURIComponent(parts)
        }

        const locFull = `${keyword} ${location}`.toLowerCase()
        const country = detectCountry(locFull)

        results.push({
          id: placeId,
          businessName: bizName,
          category: keyword,
          city: location,
          country,
          address,
          phoneRaw: phone,
          websiteRaw: website,
          rating: rating || 0,
          reviewsCount: reviewsCount || 0,
          googleMapsUrl: mapsUrl || '',
          scrapedAt: new Date().toISOString(),
          source: 'live_google_maps_github_actions'
        })
        console.log(`  [+] #${idx + 1}: ${bizName} | Phone: '${phone}' | Web: '${website.slice(0, 30)}...'`)
      } catch (err) {
        console.log(`  [-] Card extraction #${idx + 1} skipped: ${err.message}`)
      }
    }
  } catch (err) {
    console.log(`[Scraper] Maps scraping error: ${err.message}`)
  } finally {
    await browser.close()
  }

  return results
}

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

async function main() {
  const args = parseArgs()
  const keyword = args.keyword || 'Plumber'
  const location = args.location || 'Miami, FL, USA'
  const market = args.market || 'usa'
  const maxResults = parseInt(args['max-results'] || '12', 10)
  const jobId = args['job-id'] || `job_${Date.now()}`

  const callbackUrl = process.env.CALLBACK_URL
  const importToken = process.env.IMPORT_TOKEN

  if (!callbackUrl || !importToken) {
    console.error('[Scraper] CALLBACK_URL and IMPORT_TOKEN env vars are required.')
    process.exit(1)
  }

  let leads = []
  let errorMessage = null

  try {
    leads = await harvestGoogleMaps(keyword, location, maxResults)
  } catch (err) {
    errorMessage = String(err.message || err)
    console.error(`[Scraper] Fatal error: ${errorMessage}`)
  }

  console.log(`[Scraper] Harvested ${leads.length} raw leads. Posting results to callback...`)

  const payload = {
    jobId,
    market,
    keyword,
    location,
    leads,
    error: errorMessage
  }

  const resp = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${importToken}`
    },
    body: JSON.stringify(payload)
  })

  const text = await resp.text()
  console.log(`[Scraper] Callback response: ${resp.status} ${text.slice(0, 500)}`)

  if (!resp.ok) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[Scraper] Unhandled error:', err)
  process.exit(1)
})
