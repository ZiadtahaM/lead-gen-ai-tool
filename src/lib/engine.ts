// EngineCoordinator — orchestrates Harvest -> Triage -> Audit -> Enrich -> Persist (D1)
// Every run only ever returns/stores genuinely NEW businesses (deduped against D1),
// and if the local radius is exhausted it automatically expands the search radius
// on the next click for that same market/keyword/location combo.

import { harvestLive, type RawLead } from './harvester'
import { classifyWebsite, buildDedupeKey } from './triage'
import { auditUrl } from './auditor'
import { normalizePhone, generatePitches, MARKET_CONFIGS, type Market } from './markets'
import {
  insertLeadIfNew,
  getOrCreateCursor,
  advanceCursor,
  getLeadStats,
  type NewLeadInput
} from './db'

export interface IgniteRunInput {
  keyword: string
  location: string
  market: Market
  maxResults?: number
}

export interface IgniteRunResult {
  success: boolean
  market: Market
  keyword: string
  location: string
  newLeadsCount: number
  duplicatesSkipped: number
  radiusKmUsed: number
  geocodedAs: string | null
  auditedCount: number
  leads: NewLeadInput[]
  message: string
}

function cursorKeyFor(market: string, keyword: string, location: string): string {
  return `${market}::${keyword.trim().toLowerCase()}::${location.trim().toLowerCase()}`
}

export async function igniteRun(db: D1Database, input: IgniteRunInput): Promise<IgniteRunResult> {
  const market = input.market
  const cfg = MARKET_CONFIGS[market]
  const keyword = (input.keyword || cfg.defaultKeyword).trim()
  const location = (input.location || cfg.defaultLocation).trim()
  const maxResults = Math.min(Math.max(input.maxResults || 12, 1), 40)

  const cKey = cursorKeyFor(market, keyword, location)
  const cursor = await getOrCreateCursor(db, cKey)

  // Expand radius progressively on subsequent runs so we surface NEW area coverage,
  // not the same handful of businesses again.
  const radiusKm = cursor.runCount === 0 ? 5 : Math.min(5 + cursor.runCount * 5, 40)

  const harvest = await harvestLive(keyword, location, radiusKm, maxResults)

  if (!harvest.geocode) {
    return {
      success: false,
      market,
      keyword,
      location,
      newLeadsCount: 0,
      duplicatesSkipped: 0,
      radiusKmUsed: radiusKm,
      geocodedAs: null,
      auditedCount: 0,
      leads: [],
      message: `Could not geocode location "${location}". Try a more specific city name.`
    }
  }

  let newCount = 0
  let dupCount = 0
  let auditedCount = 0
  const insertedLeads: NewLeadInput[] = []

  for (const raw of harvest.leads) {
    if (insertedLeads.length >= maxResults) break

    const phoneNormalized = normalizePhone(raw.phoneRaw, market)
    const dedupeKey = buildDedupeKey(raw.businessName, raw.city, phoneNormalized)
    const { category, cleanedUrl } = classifyWebsite(raw.websiteRaw)

    let auditReport = null
    let weaknessScore = category === 'NO_WEBSITE' ? 100 : 60
    if (category === 'REAL_WEBSITE') {
      auditReport = await auditUrl(cleanedUrl)
      weaknessScore = auditReport.weaknessScore
      auditedCount++
    }

    const pitchScript = generatePitches(raw.businessName, raw.category, raw.city, category, auditReport, market)

    const emailHarvested = auditReport?.extractedEmails?.[0] || ''
    const whatsAppUrl = phoneNormalized
      ? `https://wa.me/${phoneNormalized.replace(/\D/g, '')}?text=${encodeURIComponent(pitchScript.whatsappMessage)}`
      : ''
    const telUrl = phoneNormalized ? `tel:${phoneNormalized}` : ''

    const leadInput: NewLeadInput = {
      id: raw.id,
      osmId: raw.id,
      businessName: raw.businessName,
      category: raw.category,
      city: raw.city,
      country: raw.country,
      address: raw.address,
      phoneRaw: raw.phoneRaw,
      phoneNormalized,
      websiteRaw: raw.websiteRaw,
      websiteCleaned: cleanedUrl,
      websiteCategory: category,
      market,
      rating: raw.rating,
      reviewsCount: raw.reviewsCount,
      googleMapsUrl: raw.googleMapsUrl,
      source: raw.source,
      weaknessScore,
      auditReport,
      pitchScript,
      emailHarvested,
      whatsAppUrl,
      telUrl,
      dedupeKey
    }

    const wasInserted = await insertLeadIfNew(db, leadInput)
    if (wasInserted) {
      newCount++
      insertedLeads.push(leadInput)
    } else {
      dupCount++
    }
  }

  await advanceCursor(db, cKey, radiusKm)

  let message = ''
  if (newCount === 0 && dupCount > 0) {
    message = `Found ${dupCount} businesses but all were already in your database. Radius will auto-expand to ${Math.min(radiusKm + 5, 40)}km next run to find fresh ones.`
  } else if (newCount === 0 && dupCount === 0) {
    message = `No businesses found near "${harvest.geocode.displayName}" for "${keyword}". Try a broader keyword or bigger city.`
  } else {
    message = `Found ${newCount} NEW businesses (${dupCount} already known, skipped). Radius used: ${radiusKm}km.`
  }

  return {
    success: true,
    market,
    keyword,
    location,
    newLeadsCount: newCount,
    duplicatesSkipped: dupCount,
    radiusKmUsed: radiusKm,
    geocodedAs: harvest.geocode.displayName,
    auditedCount,
    leads: insertedLeads,
    message
  }
}

export async function auditSingleUrl(url: string, market: Market, businessName = 'Target Business') {
  const report = await auditUrl(url)
  const triageCat = report.isOnline ? 'REAL_WEBSITE' : 'NO_WEBSITE'
  const pitch = generatePitches(businessName, 'Local Trade', 'Target City', triageCat as any, report, market)
  return { ...report, pitchScript: pitch }
}

export { getLeadStats }
