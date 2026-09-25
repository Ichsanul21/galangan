-- Sesi login realtime (presence): 1 baris aktif per user (last writer wins).
-- Dibuat saat login, disegarkan via POST /api/auth/heartbeat (60 dtk),
-- dihapus saat logout eksplisit. Basi di atas 10 mnt dianggap offline oleh UI.
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  username VARCHAR(128) NOT NULL,
  role VARCHAR(64) NOT NULL,
  login_at VARCHAR(32) NOT NULL,
  last_seen_at VARCHAR(32) NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_seen ON sessions(last_seen_at);
