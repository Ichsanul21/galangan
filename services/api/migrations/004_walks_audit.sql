-- Safety walk & jadwal audit internal: sebelumnya useState evaporatif
-- (hilang saat reload). Koleksi generik agar persist + tersinkron.
CREATE TABLE IF NOT EXISTS walks (id VARCHAR(128) PRIMARY KEY, branch VARCHAR(64), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_walks_branch ON walks(branch);
CREATE TABLE IF NOT EXISTS auditPlans (id VARCHAR(128) PRIMARY KEY, branch VARCHAR(64), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_auditPlans_branch ON auditPlans(branch);
