CREATE TABLE IF NOT EXISTS watches (
  symbol TEXT PRIMARY KEY,
  starts_on TEXT NOT NULL,
  expires_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  body TEXT,
  error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
  report_date TEXT NOT NULL,
  part INTEGER NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  PRIMARY KEY (report_date, part)
);
CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);
