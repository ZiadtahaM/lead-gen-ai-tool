-- Lead Engine PRO MAX — Initial Schema
-- Real, persistent lead database. No fake/demo data ever stored here.

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  osm_id TEXT,
  business_name TEXT NOT NULL,
  category TEXT,
  city TEXT,
  country TEXT,
  address TEXT,
  phone_raw TEXT,
  phone_normalized TEXT,
  website_raw TEXT,
  website_cleaned TEXT,
  website_category TEXT NOT NULL DEFAULT 'NO_WEBSITE', -- NO_WEBSITE | SOCIAL_MEDIA_ONLY | REAL_WEBSITE
  market TEXT NOT NULL DEFAULT 'usa', -- ksa | egypt | usa | morocco
  rating REAL DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  google_maps_url TEXT,
  source TEXT DEFAULT 'osm_overpass',
  weakness_score INTEGER DEFAULT 0,
  audit_report TEXT, -- JSON string
  pitch_script TEXT, -- JSON string
  email_harvested TEXT,
  whatsapp_url TEXT,
  tel_url TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_market ON leads(market);
CREATE INDEX IF NOT EXISTS idx_leads_website_category ON leads(website_category);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Tracks search progression per query so every "Ignite Run" click discovers
-- genuinely NEW businesses (wider radius / next area) instead of repeating.
CREATE TABLE IF NOT EXISTS search_cursors (
  cursor_key TEXT PRIMARY KEY, -- normalized market::keyword::location
  radius_km INTEGER NOT NULL DEFAULT 5,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_lat REAL,
  last_lon REAL,
  last_run_at TEXT
);

CREATE TABLE IF NOT EXISTS outreach_queue (
  id TEXT PRIMARY KEY, -- matches leads.id
  business_name TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  market TEXT,
  website_category TEXT,
  weakness_score INTEGER DEFAULT 0,
  channel TEXT DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'QUEUED', -- QUEUED|DISPATCHED|REPLIED|CONVERTED|BOUNCED
  pitch_script TEXT, -- JSON
  enqueued_at TEXT DEFAULT (datetime('now')),
  dispatched_at TEXT,
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_queue(status);

CREATE TABLE IF NOT EXISTS do_not_contact (
  target TEXT PRIMARY KEY, -- lowercase phone or email
  added_at TEXT DEFAULT (datetime('now'))
);
