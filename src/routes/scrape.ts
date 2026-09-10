// Dispatch + Import routes for the GitHub-Actions-powered real Google Maps scraper.
// This is the bridge that lets a Cloudflare Worker (which cannot run a browser)
// trigger a real headless Chromium scrape for free via GitHub Actions.

import { Hono } from 'hono'
import { MARKET_CONFIGS, type Market } from '../lib/markets'
import { importRawLeads } from '../lib/engine'
import { createScrapeJob, getScrapeJob, markJobDone, markJobFailed, markJobRunning, listRecentJobs } from '../lib/scrapeJobs'

type Bindings = {
  DB: D1Database
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string // format: "owner/repo"
  IMPORT_TOKEN?: string // shared secret the scraper must present when posting results back
}

const scrapeRoutes = new Hono<{ Bindings: Bindings }>()

function genId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// POST /api/scrape/dispatch { market, keyword, location, maxResults }
// Triggers a GitHub Actions repository_dispatch event to run the real Playwright scraper.
scrapeRoutes.post('/dispatch', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const market = (body.market || 'usa') as Market
  if (!MARKET_CONFIGS[market]) return c.json({ success: false, message: `Unknown market '${market}'` }, 400)

  const keyword = (body.keyword || MARKET_CONFIGS[market].defaultKeyword).trim()
  const location = (body.location || MARKET_CONFIGS[market].defaultLocation).trim()
  const maxResults = Math.min(Math.max(body.maxResults || 12, 1), 30)

  const githubToken = c.env.GITHUB_TOKEN
  const githubRepo = c.env.GITHUB_REPO

  if (!githubToken || !githubRepo) {
    return c.json(
      {
        success: false,
        message:
          'GitHub scraper is not configured yet. Set GITHUB_TOKEN and GITHUB_REPO secrets (see README) to enable real live Google Maps scraping via GitHub Actions.'
      },
      501
    )
  }

  const jobId = genId()
  await createScrapeJob(c.env.DB, { id: jobId, market, keyword, location, maxResults })

  const dispatchUrl = `https://api.github.com/repos/${githubRepo}/dispatches`
  const resp = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LeadEnginePROMAX',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_type: 'scrape-leads',
      client_payload: { market, keyword, location, max_results: String(maxResults), job_id: jobId }
    })
  })

  if (!resp.ok) {
    const errText = await resp.text()
    await markJobFailed(c.env.DB, jobId, `GitHub dispatch failed: ${resp.status} ${errText.slice(0, 300)}`)
    return c.json({ success: false, message: `Failed to dispatch GitHub Action: ${resp.status}`, detail: errText.slice(0, 300) }, 502)
  }

  await markJobRunning(c.env.DB, jobId)

  return c.json({
    success: true,
    jobId,
    message: `Dispatched real Google Maps scrape job. It runs a live headless Chromium browser via GitHub Actions (takes ~1-3 minutes). Poll /api/scrape/status/${jobId} for progress.`
  })
})

// GET /api/scrape/status/:jobId
scrapeRoutes.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const job = await getScrapeJob(c.env.DB, jobId)
  if (!job) return c.json({ success: false, message: 'Job not found' }, 404)
  return c.json({ success: true, job })
})

scrapeRoutes.get('/recent', async (c) => {
  const jobs = await listRecentJobs(c.env.DB, 15)
  return c.json({ jobs })
})

// POST /api/scrape/import  (called by the GitHub Actions runner, not the browser)
// Body: { jobId, market, keyword, location, leads: RawLead[], error? }
// Auth: Authorization: Bearer <IMPORT_TOKEN>
scrapeRoutes.post('/import', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const expectedToken = c.env.IMPORT_TOKEN

  if (!expectedToken) {
    return c.json({ success: false, message: 'IMPORT_TOKEN is not configured on the server.' }, 501)
  }
  if (authHeader !== `Bearer ${expectedToken}`) {
    return c.json({ success: false, message: 'Unauthorized' }, 401)
  }

  const body = await c.req.json().catch(() => null)
  if (!body || !body.jobId) return c.json({ success: false, message: 'jobId is required' }, 400)

  const market = (body.market || 'usa') as Market
  const leads = Array.isArray(body.leads) ? body.leads : []

  if (body.error) {
    await markJobFailed(c.env.DB, body.jobId, body.error)
    return c.json({ success: true, message: 'Job marked as failed.' })
  }

  try {
    const result = await importRawLeads(c.env.DB, market, leads)
    await markJobDone(c.env.DB, body.jobId, result)
    return c.json({ success: true, ...result })
  } catch (err: any) {
    await markJobFailed(c.env.DB, body.jobId, String(err.message || err))
    return c.json({ success: false, message: `Import failed: ${err.message || err}` }, 500)
  }
})

export default scrapeRoutes
