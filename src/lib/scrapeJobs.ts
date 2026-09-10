// Scrape job tracking — bridges the async GitHub-Actions-powered Playwright scraper
// with the synchronous Cloudflare Pages dashboard via polling.

export interface ScrapeJobRow {
  id: string
  market: string
  keyword: string
  location: string
  max_results: number
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
  new_leads_count: number
  duplicates_skipped: number
  audited_count: number
  error_message: string | null
  created_at: string
  finished_at: string | null
}

export async function createScrapeJob(
  db: D1Database,
  job: { id: string; market: string; keyword: string; location: string; maxResults: number }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scrape_jobs (id, market, keyword, location, max_results, status) VALUES (?,?,?,?,?, 'PENDING')`
    )
    .bind(job.id, job.market, job.keyword, job.location, job.maxResults)
    .run()
}

export async function getScrapeJob(db: D1Database, id: string): Promise<ScrapeJobRow | null> {
  return db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').bind(id).first<ScrapeJobRow>()
}

export async function markJobRunning(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE scrape_jobs SET status = 'RUNNING' WHERE id = ? AND status = 'PENDING'`).bind(id).run()
}

export async function markJobDone(
  db: D1Database,
  id: string,
  counts: { newLeadsCount: number; duplicatesSkipped: number; auditedCount: number }
): Promise<void> {
  await db
    .prepare(
      `UPDATE scrape_jobs SET status = 'DONE', new_leads_count = ?, duplicates_skipped = ?, audited_count = ?, finished_at = datetime('now') WHERE id = ?`
    )
    .bind(counts.newLeadsCount, counts.duplicatesSkipped, counts.auditedCount, id)
    .run()
}

export async function markJobFailed(db: D1Database, id: string, errorMessage: string): Promise<void> {
  await db
    .prepare(`UPDATE scrape_jobs SET status = 'FAILED', error_message = ?, finished_at = datetime('now') WHERE id = ?`)
    .bind(errorMessage.slice(0, 2000), id)
    .run()
}

export async function listRecentJobs(db: D1Database, limit = 10): Promise<ScrapeJobRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM scrape_jobs ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<ScrapeJobRow>()
  return results || []
}
