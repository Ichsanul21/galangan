CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  table_name TEXT NOT NULL DEFAULT '',
  row_id TEXT NOT NULL DEFAULT '',
  diff TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
