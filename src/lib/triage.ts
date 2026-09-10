// 3-Way Lead Triage & Classification Engine — ported from core/triage.py

export type WebsiteCategory = 'NO_WEBSITE' | 'SOCIAL_MEDIA_ONLY' | 'REAL_WEBSITE'

const SOCIAL_DOMAINS = [
  /facebook\.com/i, /fb\.com/i, /fb\.me/i, /instagram\.com/i, /tiktok\.com/i,
  /linkedin\.com/i, /twitter\.com/i, /x\.com/i, /linktr\.ee/i, /threads\.net/i,
  /youtube\.com/i, /pinterest\.com/i, /business\.site/i
]

export function classifyWebsite(websiteRaw: string): { category: WebsiteCategory; cleanedUrl: string } {
  if (!websiteRaw || !websiteRaw.trim()) return { category: 'NO_WEBSITE', cleanedUrl: '' }

  let url = websiteRaw.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  for (const pattern of SOCIAL_DOMAINS) {
    if (pattern.test(url)) return { category: 'SOCIAL_MEDIA_ONLY', cleanedUrl: url }
  }

  return { category: 'REAL_WEBSITE', cleanedUrl: url }
}

export function buildDedupeKey(businessName: string, city: string, phoneNormalized: string): string {
  const name = (businessName || '').trim().toLowerCase()
  const ct = (city || '').trim().toLowerCase()
  const phone = (phoneNormalized || '').trim()
  // Prefer phone as the strongest identity signal; fallback to name+city
  return phone ? `phone:${phone}` : `namecity:${name}::${ct}`
}
