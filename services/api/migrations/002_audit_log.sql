-- MySQL compat: VARCHAR(128) PK (MySQL cannot index a TEXT PK without a length),
-- no TEXT DEFAULTs (defaults handled in code inserts), `actor` column name
-- (`user` is a reserved word in MySQL).
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(128) PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  diff TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
