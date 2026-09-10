// D1 Persistence Layer — replaces the old JSON-file storage from core/lead_database.py & dispatcher.py
// Guarantees: leads are unique (dedupe_key), outreach queue never duplicates a lead,
// and the "Ignite Run" always looks for genuinely NEW leads because inserts use INSERT OR IGNORE
// keyed on a stable identity (phone or name+city).

import type { Market, WebsiteCategory, PitchScript } from './markets'
import type { AuditReport } from './auditor'

export interface LeadRow {
  id: string
  osm_id: string | null
  business_name: string
  category: string | null
  city: string | null
  country: string | null
  address: string | null
  phone_raw: string | null
  phone_normalized: string | null
  website_raw: string | null
  website_cleaned: string | null
  website_category: WebsiteCategory
  market: Market
  rating: number
  reviews_count: number
  google_maps_url: string | null
  source: string | null
  weakness_score: number
  audit_report: string | null
  pitch_script: string | null
  email_harvested: string | null
  whatsapp_url: string | null
  tel_url: string | null
  dedupe_key: string
  created_at: string
  updated_at: string
}

export interface NewLeadInput {
  id: string
  osmId?: string
  businessName: string
  category: string
  city: string
  country: string
  address: string
  phoneRaw: string
  phoneNormalized: string
  websiteRaw: string
  websiteCleaned: string
  websiteCategory: WebsiteCategory
  market: Market
  rating: number
  reviewsCount: number
  googleMapsUrl: string
  source: string
  weaknessScore: number
  auditReport: AuditReport | null
  pitchScript: PitchScript | null
  emailHarvested: string
  whatsAppUrl: string
  telUrl: string
  dedupeKey: string
}

// Returns true if actually inserted (i.e. a genuinely NEW lead), false if it already existed.
export async function insertLeadIfNew(db: D1Database, lead: NewLeadInput): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO leads (
        id, osm_id, business_name, category, city, country, address,
        phone_raw, phone_normalized, website_raw, website_cleaned, website_category,
        market, rating, reviews_count, google_maps_url, source, weakness_score,
        audit_report, pitch_script, email_harvested, whatsapp_url, tel_url, dedupe_key
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(dedupe_key) DO NOTHING`
    )
    .bind(
      lead.id,
      lead.osmId || null,
      lead.businessName,
      lead.category,
      lead.city,
      lead.country,
      lead.address,
      lead.phoneRaw,
      lead.phoneNormalized,
      lead.websiteRaw,
      lead.websiteCleaned,
      lead.websiteCategory,
      lead.market,
      lead.rating,
      lead.reviewsCount,
      lead.googleMapsUrl,
      lead.source,
      lead.weaknessScore,
      lead.auditReport ? JSON.stringify(lead.auditReport) : null,
      lead.pitchScript ? JSON.stringify(lead.pitchScript) : null,
      lead.emailHarvested,
      lead.whatsAppUrl,
      lead.telUrl,
      lead.dedupeKey
    )
    .run()

  return (result.meta?.changes || 0) > 0
}

export async function listLeads(
  db: D1Database,
  opts: { market?: string; websiteCategory?: string; limit?: number; search?: string } = {}
): Promise<LeadRow[]> {
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const binds: any[] = []
  if (opts.market) {
    sql += ' AND market = ?'
    binds.push(opts.market)
  }
  if (opts.websiteCategory) {
    sql += ' AND website_category = ?'
    binds.push(opts.websiteCategory)
  }
  if (opts.search) {
    sql += ' AND (business_name LIKE ? OR phone_normalized LIKE ? OR city LIKE ?)'
    const s = `%${opts.search}%`
    binds.push(s, s, s)
  }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  binds.push(opts.limit || 500)
  const { results } = await db.prepare(sql).bind(...binds).all<LeadRow>()
  return results || []
}

export async function getLeadStats(db: D1Database): Promise<{
  total: number
  noWebsite: number
  socialOnly: number
  realWebsite: number
  whatsappReady: number
  avgWeakness: number
}> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN website_category = 'NO_WEBSITE' THEN 1 ELSE 0 END) as noWebsite,
        SUM(CASE WHEN website_category = 'SOCIAL_MEDIA_ONLY' THEN 1 ELSE 0 END) as socialOnly,
        SUM(CASE WHEN website_category = 'REAL_WEBSITE' THEN 1 ELSE 0 END) as realWebsite,
        SUM(CASE WHEN whatsapp_url != '' AND whatsapp_url IS NOT NULL THEN 1 ELSE 0 END) as whatsappReady,
        AVG(weakness_score) as avgWeakness
      FROM leads`
    )
    .first<any>()

  return {
    total: row?.total || 0,
    noWebsite: row?.noWebsite || 0,
    socialOnly: row?.socialOnly || 0,
    realWebsite: row?.realWebsite || 0,
    whatsappReady: row?.whatsappReady || 0,
    avgWeakness: row?.avgWeakness ? Math.round(row.avgWeakness) : 0
  }
}

// ---- Search cursor: ensures repeated "Ignite Run" clicks expand search radius
// instead of returning the exact same businesses every time. ----
export async function getOrCreateCursor(db: D1Database, cursorKey: string): Promise<{ radiusKm: number; runCount: number }> {
  const existing = await db.prepare('SELECT radius_km, run_count FROM search_cursors WHERE cursor_key = ?').bind(cursorKey).first<any>()
  if (existing) return { radiusKm: existing.radius_km, runCount: existing.run_count }
  await db.prepare('INSERT INTO search_cursors (cursor_key, radius_km, run_count) VALUES (?, 5, 0)').bind(cursorKey).run()
  return { radiusKm: 5, runCount: 0 }
}

export async function advanceCursor(db: D1Database, cursorKey: string, newRadiusKm: number): Promise<void> {
  await db
    .prepare(
      `UPDATE search_cursors SET radius_km = ?, run_count = run_count + 1, last_run_at = datetime('now') WHERE cursor_key = ?`
    )
    .bind(newRadiusKm, cursorKey)
    .run()
}

// ---- Outreach queue ----
export interface QueueRow {
  id: string
  business_name: string
  phone: string
  email: string
  city: string
  market: string
  website_category: string
  weakness_score: number
  channel: string
  status: string
  pitch_script: string
  enqueued_at: string
  dispatched_at: string | null
  notes: string
}

export async function enqueueLeads(db: D1Database, leadIds: string[], channel = 'whatsapp'): Promise<number> {
  if (!leadIds.length) return 0

  const blacklistRows = await db.prepare('SELECT target FROM do_not_contact').all<{ target: string }>()
  const blacklist = new Set((blacklistRows.results || []).map(r => r.target.toLowerCase()))

  let added = 0
  for (const leadId of leadIds) {
    const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<LeadRow>()
    if (!lead) continue

    const phone = (lead.phone_normalized || '').toLowerCase()
    const email = (lead.email_harvested || '').toLowerCase()
    if ((phone && blacklist.has(phone)) || (email && blacklist.has(email))) continue

    const result = await db
      .prepare(
        `INSERT INTO outreach_queue (
          id, business_name, phone, email, city, market, website_category,
          weakness_score, channel, status, pitch_script, notes
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'')
        ON CONFLICT(id) DO NOTHING`
      )
      .bind(
        lead.id,
        lead.business_name,
        lead.phone_normalized || '',
        lead.email_harvested || '',
        lead.city,
        lead.market,
        lead.website_category,
        lead.weakness_score,
        channel,
        'QUEUED',
        lead.pitch_script
      )
      .run()

    if ((result.meta?.changes || 0) > 0) added++
  }

  return added
}

export async function listQueue(db: D1Database, statusFilter?: string): Promise<QueueRow[]> {
  let sql = 'SELECT * FROM outreach_queue'
  const binds: any[] = []
  if (statusFilter) {
    sql += ' WHERE status = ?'
    binds.push(statusFilter)
  }
  sql += ' ORDER BY weakness_score DESC, enqueued_at ASC'
  const { results } = await db.prepare(sql).bind(...binds).all<QueueRow>()
  return results || []
}

export async function dispatchNext(db: D1Database): Promise<QueueRow | null> {
  const item = await db
    .prepare(`SELECT * FROM outreach_queue WHERE status = 'QUEUED' ORDER BY weakness_score DESC, enqueued_at ASC LIMIT 1`)
    .first<QueueRow>()
  if (!item) return null

  await db
    .prepare(`UPDATE outreach_queue SET status = 'DISPATCHED', dispatched_at = datetime('now') WHERE id = ?`)
    .bind(item.id)
    .run()

  return { ...item, status: 'DISPATCHED' }
}

export async function updateQueueStatus(db: D1Database, id: string, newStatus: string, notes = ''): Promise<boolean> {
  const validStatuses = new Set(['QUEUED', 'DISPATCHED', 'REPLIED', 'CONVERTED', 'BOUNCED'])
  if (!validStatuses.has(newStatus)) throw new Error(`Invalid status '${newStatus}'`)

  const result = await db
    .prepare(
      `UPDATE outreach_queue SET status = ?, notes = CASE WHEN ? != '' THEN (notes || ' | ' || ?) ELSE notes END WHERE id = ?`
    )
    .bind(newStatus, notes, notes, id)
    .run()

  return (result.meta?.changes || 0) > 0
}

export async function getQueueSummary(db: D1Database): Promise<{ total: number; breakdown: Record<string, number> }> {
  const { results } = await db.prepare('SELECT status, COUNT(*) as cnt FROM outreach_queue GROUP BY status').all<any>()
  const breakdown: Record<string, number> = { QUEUED: 0, DISPATCHED: 0, REPLIED: 0, CONVERTED: 0, BOUNCED: 0 }
  let total = 0
  for (const r of results || []) {
    breakdown[r.status] = r.cnt
    total += r.cnt
  }
  return { total, breakdown }
}

export async function clearQueue(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM outreach_queue').run()
}

export async function addToBlacklist(db: D1Database, target: string): Promise<boolean> {
  const norm = target.trim().toLowerCase()
  if (!norm) return false
  const result = await db.prepare('INSERT INTO do_not_contact (target) VALUES (?) ON CONFLICT(target) DO NOTHING').bind(norm).run()
  return (result.meta?.changes || 0) > 0
}
