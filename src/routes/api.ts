import { Hono } from 'hono'
import { igniteRun, auditSingleUrl, getLeadStats } from '../lib/engine'
import {
  listLeads,
  enqueueLeads,
  listQueue,
  dispatchNext,
  updateQueueStatus,
  getQueueSummary,
  clearQueue,
  addToBlacklist
} from '../lib/db'
import { MARKET_CONFIGS, type Market } from '../lib/markets'

type Bindings = { DB: D1Database }

const api = new Hono<{ Bindings: Bindings }>()

api.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

api.get('/markets', (c) => {
  const markets = Object.entries(MARKET_CONFIGS).map(([key, cfg]) => ({ key, ...cfg }))
  return c.json({ markets })
})

// POST /api/ignite  { market, keyword?, location?, maxResults? }
api.post('/ignite', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const market = (body.market || 'usa') as Market
  if (!MARKET_CONFIGS[market]) {
    return c.json({ success: false, message: `Unknown market '${market}'` }, 400)
  }

  try {
    const result = await igniteRun(c.env.DB, {
      keyword: body.keyword || '',
      location: body.location || '',
      market,
      maxResults: body.maxResults
    })
    return c.json(result)
  } catch (err: any) {
    return c.json({ success: false, message: `Engine error: ${err.message || err}` }, 500)
  }
})

// POST /api/audit-single { url, market? }
api.post('/audit-single', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.url) return c.json({ success: false, message: 'url is required' }, 400)

  try {
    const report = await auditSingleUrl(body.url, (body.market || 'usa') as Market, body.businessName)
    return c.json({ success: true, report })
  } catch (err: any) {
    return c.json({ success: false, message: `Audit error: ${err.message || err}` }, 500)
  }
})

// GET /api/leads?market=&websiteCategory=&search=&limit=
api.get('/leads', async (c) => {
  const { market, websiteCategory, search, limit } = c.req.query()
  const leads = await listLeads(c.env.DB, {
    market: market || undefined,
    websiteCategory: websiteCategory || undefined,
    search: search || undefined,
    limit: limit ? parseInt(limit, 10) : undefined
  })

  const parsed = leads.map((l) => ({
    ...l,
    audit_report: l.audit_report ? JSON.parse(l.audit_report) : null,
    pitch_script: l.pitch_script ? JSON.parse(l.pitch_script) : null
  }))

  return c.json({ leads: parsed })
})

api.get('/stats', async (c) => {
  const stats = await getLeadStats(c.env.DB)
  return c.json({ stats })
})

// POST /api/outreach/enqueue { leadIds: string[], channel? }
api.post('/outreach/enqueue', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const leadIds: string[] = body.leadIds || []
  const added = await enqueueLeads(c.env.DB, leadIds, body.channel || 'whatsapp')
  return c.json({ success: true, added })
})

api.get('/outreach/queue', async (c) => {
  const { status } = c.req.query()
  const queue = await listQueue(c.env.DB, status || undefined)
  const parsed = queue.map((q) => ({ ...q, pitch_script: q.pitch_script ? JSON.parse(q.pitch_script) : null }))
  return c.json({ queue: parsed })
})

api.get('/outreach/summary', async (c) => {
  const summary = await getQueueSummary(c.env.DB)
  return c.json({ summary })
})

api.post('/outreach/dispatch-next', async (c) => {
  const item = await dispatchNext(c.env.DB)
  if (!item) return c.json({ success: false, message: 'Queue is empty.' })
  return c.json({ success: true, item: { ...item, pitch_script: item.pitch_script ? JSON.parse(item.pitch_script) : null } })
})

api.post('/outreach/status', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.id || !body.status) return c.json({ success: false, message: 'id and status are required' }, 400)
  try {
    const updated = await updateQueueStatus(c.env.DB, body.id, body.status, body.notes || '')
    return c.json({ success: updated })
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400)
  }
})

api.post('/outreach/clear', async (c) => {
  await clearQueue(c.env.DB)
  return c.json({ success: true })
})

api.post('/outreach/blacklist', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.target) return c.json({ success: false, message: 'target is required' }, 400)
  const added = await addToBlacklist(c.env.DB, body.target)
  return c.json({ success: true, added })
})

export default api
