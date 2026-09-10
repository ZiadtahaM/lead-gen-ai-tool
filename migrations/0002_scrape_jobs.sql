-- Tracks async GitHub-Actions-powered live Google Maps scrape jobs.
-- Dashboard dispatches a job, GitHub Actions runs real Playwright/Chromium,
-- then POSTs results back to /api/leads/import which updates this row.

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  max_results INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | RUNNING | DONE | FAILED
  new_leads_count INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  audited_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON scrape_jobs(created_at);
