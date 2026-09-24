-- MySQL compat: VARCHAR PK + VARCHAR indexed cols (TEXT cannot be indexed without length),
-- no TEXT DEFAULTs, `actor` column name (`user` is reserved in MySQL).
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(128) PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  row_id TEXT NOT NULL,
  diff TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL
);
CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
