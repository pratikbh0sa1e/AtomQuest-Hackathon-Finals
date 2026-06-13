-- Video Support Platform — Initial Schema Migration
-- Requirements: 1.1, 1.5, 3.2, 5.1, 6.1

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL CHECK (status IN ('pending','active','ended')) DEFAULT 'pending',
  invite_token  TEXT UNIQUE NOT NULL,
  token_used_at TIMESTAMPTZ,          -- set when Customer joins, NULL = unused
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  ai_transcript TEXT,
  ai_summary    TEXT
);

-- Participants
CREATE TABLE IF NOT EXISTS participants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES sessions(id),
  role               TEXT NOT NULL CHECK (role IN ('agent','customer')),
  name               TEXT NOT NULL,
  joined_at          TIMESTAMPTZ,
  left_at            TIMESTAMPTZ,
  duration           INTEGER DEFAULT 0,  -- seconds
  connection_status  TEXT NOT NULL CHECK (connection_status IN ('connected','disconnected')) DEFAULT 'connected',
  ip_address         TEXT NOT NULL       -- R1.5: required at join time
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('agent','customer')),
  sender_name TEXT NOT NULL,
  content     TEXT NOT NULL,            -- max 10,000 chars enforced in app layer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recordings
CREATE TABLE IF NOT EXISTS recordings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id),
  status          TEXT NOT NULL CHECK (status IN ('recording','processing','ready','failed')) DEFAULT 'recording',
  file_url        TEXT,
  analysis_status TEXT CHECK (analysis_status IN ('processing','completed','failed')),  -- nullable
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shared Files
CREATE TABLE IF NOT EXISTS shared_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id),
  sender_name TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_url    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Log (R4.8: unauthorized Customer actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  TEXT NOT NULL,   -- customer identifier
  session_id      UUID,
  action          TEXT NOT NULL,   -- attempted action name
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at   ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_invite_token ON sessions(invite_token);
CREATE INDEX IF NOT EXISTS idx_participants_session  ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session      ON messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_recordings_session    ON recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_files_session  ON shared_files(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_participant ON audit_log(participant_id);

-- Grant permissions for API access
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role, anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role, anon, authenticated;
