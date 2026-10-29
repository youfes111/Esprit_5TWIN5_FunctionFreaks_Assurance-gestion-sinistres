CREATE TABLE users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 2 AND 120),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'VIEWER' CHECK(role IN ('ADMIN','AGENT','VIEWER')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','DISABLED')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER,
  created_by TEXT REFERENCES users(id),
  CHECK(status != 'ACTIVE' OR password_hash IS NOT NULL)
);
CREATE INDEX users_role_status ON users(role,status);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE account_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('ACTIVATE','RESET')), expires_at INTEGER NOT NULL
);
CREATE INDEX account_tokens_user ON account_tokens(user_id);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY, actor_id TEXT, subject_id TEXT, event TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE captcha_uses (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
