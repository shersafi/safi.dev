CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  native_url TEXT NOT NULL,
  watch_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_uploaded_at
  ON assets(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS view_sessions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  ip TEXT,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  colo TEXT,
  asn INTEGER,
  as_organization TEXT,
  viewer_kind TEXT NOT NULL DEFAULT 'unknown',
  viewer_confidence TEXT NOT NULL DEFAULT 'low',
  viewer_flags TEXT NOT NULL DEFAULT '',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  last_method TEXT,
  last_range TEXT,
  last_path TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_view_sessions_asset_last_seen
  ON view_sessions(asset_id, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_view_sessions_ip
  ON view_sessions(ip);

CREATE INDEX IF NOT EXISTS idx_view_sessions_viewer_kind
  ON view_sessions(viewer_kind);
