// Forensic Website Weakness Auditor — Cloudflare-Workers-native (fetch based, no headless browser needed)
// Ported from core/auditor.py logic 1:1.

export interface AuditReport {
  targetUrl: string
  finalUrl: string
  isOnline: boolean
  httpStatusCode: number
  responseTimeMs: number
  hasSsl: boolean
  sslValid: boolean
  isMobileResponsive: boolean
  seoScore: number
  seoIssues: string[]
  conversionIssues: string[]
  extractedEmails: string[]
  extractedSocials: Record<string, string>
  weaknessScore: number
  diagnosisBulletPoints: string[]
  pitchHookText: string
}

const IGNORE_EMAIL_DOMAINS = new Set([
  'wixpress.com', 'sentry.io', 'example.com', 'domain.com',
  'wordpress.org', 'w.org', 'schema.org', 'polyfill.io', 'google.com'
])

function emptyReport(url: string, reason: string): AuditReport {
  return {
    targetUrl: url,
    finalUrl: url,
    isOnline: false,
    httpStatusCode: 0,
    responseTimeMs: 0,
    hasSsl: false,
    sslValid: false,
    isMobileResponsive: false,
    seoScore: 0,
    seoIssues: [reason],
    conversionIssues: ['No website present'],
    extractedEmails: [],
    extractedSocials: {},
    weaknessScore: 100,
    diagnosisBulletPoints: [reason],
    pitchHookText: 'You currently do not have an official website on Google Maps, so you are losing daily customer searches to local competitors.'
  }
}

export async function auditUrl(targetUrl: string, timeoutMs = 8000): Promise<AuditReport> {
  if (!targetUrl || !targetUrl.trim()) {
    return emptyReport(targetUrl, 'No URL provided')
  }

  let url = targetUrl.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  const report: AuditReport = {
    targetUrl: url,
    finalUrl: url,
    isOnline: false,
    httpStatusCode: 0,
    responseTimeMs: 0,
    hasSsl: url.startsWith('https://'),
    sslValid: false,
    isMobileResponsive: false,
    seoScore: 100,
    seoIssues: [],
    conversionIssues: [],
    extractedEmails: [],
    extractedSocials: {},
    weaknessScore: 0,
    diagnosisBulletPoints: [],
    pitchHookText: ''
  }

  const start = Date.now()
  let html = ''

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let resp: Response
    try {
      resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en;q=0.9,fr;q=0.8'
        },
        redirect: 'follow',
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }

    const elapsed = Date.now() - start
    report.responseTimeMs = elapsed
    report.httpStatusCode = resp.status
    report.finalUrl = resp.url || url
    report.isOnline = resp.status >= 200 && resp.status < 400
    report.sslValid = report.finalUrl.startsWith('https://')
    report.hasSsl = report.sslValid

    if (!report.isOnline) {
      report.diagnosisBulletPoints.push(`HTTP Error ${resp.status} (Website returns server error or 404 page)`)
      report.weaknessScore = 90
      report.pitchHookText = `Your website is currently down with an HTTP ${resp.status} error when visitors try to access it.`
      return report
    }

    const full = await resp.text()
    html = full.slice(0, 500_000) // cap 500KB like original
  } catch (err: any) {
    report.isOnline = false
    const msg = String(err?.message || err).slice(0, 60)
    report.diagnosisBulletPoints.push(`Website offline / DNS / TLS failure: ${msg}`)
    report.weaknessScore = 100
    report.pitchHookText = 'Your domain appears to be completely offline or unreachable for customers.'
    return report
  }

  // 2. Performance analysis
  if (report.responseTimeMs > 4000) {
    report.weaknessScore += 25
    report.diagnosisBulletPoints.push(`Extremely slow loading time: ${(report.responseTimeMs / 1000).toFixed(1)}s (Industry benchmark is <1.5s)`)
  } else if (report.responseTimeMs > 2500) {
    report.weaknessScore += 15
    report.diagnosisBulletPoints.push(`Sluggish response latency: ${(report.responseTimeMs / 1000).toFixed(1)}s`)
  }

  // 3. Mobile viewport check
  const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)
  report.isMobileResponsive = hasViewport
  if (!hasViewport) {
    report.weaknessScore += 30
    report.diagnosisBulletPoints.push('Missing Mobile Viewport tag: Site does NOT adapt to smartphone screens (users must pinch and zoom)')
  }

  // 4. SEO foundations
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const titleText = titleMatch ? titleMatch[1].trim() : ''
  if (!titleText) {
    report.seoIssues.push('Missing <title> tag (Invisible to Google crawlers)')
    report.seoScore -= 30
    report.weaknessScore += 15
  } else if (titleText.length < 15) {
    report.seoIssues.push(`Title tag is too short ('${titleText}') - misses local keywords`)
    report.seoScore -= 15
    report.weaknessScore += 10
  }

  let metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  if (!metaDesc) metaDesc = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
  const descText = metaDesc ? metaDesc[1].trim() : ''
  if (!descText) {
    report.seoIssues.push('Missing meta description (Google shows random broken text snippets in search results)')
    report.seoScore -= 25
    report.weaknessScore += 15
  }

  const h1Matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || []
  if (h1Matches.length === 0) {
    report.seoIssues.push('Missing primary <h1> heading tag')
    report.seoScore -= 15
    report.weaknessScore += 10
  }

  const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(html)
  if (!hasOgImage) {
    report.seoIssues.push('Missing OpenGraph social thumbnail (Links shared on WhatsApp appear with blank icon)')
  }

  // 5. Conversion triggers
  const hasWa = /href=["'](?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(html)
  if (!hasWa) {
    report.conversionIssues.push('No direct 1-Click WhatsApp booking button')
    report.weaknessScore += 20
    report.diagnosisBulletPoints.push('No direct WhatsApp link: Local clients prefer chatting on WhatsApp rather than filling forms')
  }

  const hasTel = /href=["']tel:/i.test(html)
  if (!hasTel) {
    report.conversionIssues.push('No Click-to-Call (tel:) link on phone numbers for mobile visitors')
    report.weaknessScore += 15
  }

  const hasForm = /<form[^>]*>/i.test(html)
  if (!hasForm) {
    report.conversionIssues.push('No online quote request or contact form')
    report.weaknessScore += 15
  }

  // 6. Contact harvesting
  const emailMatches = html.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g) || []
  const cleanEmails = new Set<string>()
  for (const em of emailMatches) {
    const emClean = em.toLowerCase().trim()
    const domain = emClean.split('@').pop() || ''
    const ignored = [...IGNORE_EMAIL_DOMAINS].some(ign => domain.includes(ign))
    const badExt = /\.(png|jpg|webp|js|css)$/.test(emClean)
    if (!ignored && !badExt) cleanEmails.add(emClean)
  }
  report.extractedEmails = [...cleanEmails].sort().slice(0, 5)

  const instaMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.-]+)["']/i)
  if (instaMatch) report.extractedSocials.instagram = instaMatch[1]
  const fbMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.-]+)["']/i)
  if (fbMatch) report.extractedSocials.facebook = fbMatch[1]

  report.weaknessScore = Math.min(100, Math.max(15, report.weaknessScore))

  if (!hasViewport) {
    report.pitchHookText = 'Your website is not mobile-friendly, making it difficult for smartphone users to read your services or call you.'
  } else if (report.responseTimeMs > 3500) {
    report.pitchHookText = `Your website takes over ${(report.responseTimeMs / 1000).toFixed(1)}s to load, losing over 40% of potential customers before it finishes opening.`
  } else if (!hasWa) {
    report.pitchHookText = 'Your website lacks a direct 1-click WhatsApp button, which causes local customers to leave and call a competitor instead.'
  } else {
    report.pitchHookText = 'Your website is missing essential local SEO meta tags, causing it to rank below competitors in your city.'
  }

  return report
}
