-- Migration 002: Agents table
-- Stores agent and supervisor accounts with bcrypt-hashed passwords.
-- Role: 'agent' = support agent, 'supervisor' = admin/supervisor

CREATE TABLE IF NOT EXISTS agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,  -- bcrypt hash
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('agent', 'supervisor')) DEFAULT 'agent',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_username ON agents(username);

-- Grant full access to service_role (used by backend adminDb client)
-- Without this, even the service key gets "permission denied"
GRANT ALL ON TABLE agents TO service_role;
GRANT ALL ON TABLE agents TO authenticated;
GRANT ALL ON TABLE agents TO anon;

-- Enable RLS (but allow service_role to bypass it)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Policy: service_role bypasses RLS automatically in Supabase
-- This policy allows any authenticated backend operation
DROP POLICY IF EXISTS "service_role_full_access" ON agents;
CREATE POLICY "service_role_full_access" ON agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed demo accounts (bcrypt hashed passwords)
-- demo_agent  → Demo@1234
-- supervisor  → Super@1234
INSERT INTO agents (username, password, name, role) VALUES
  (
    'demo_agent',
    '$2b$10$f79z5sktnt4pcnfxOuSVPuAxRY70t/PqxKSDgpFBXwp3iQ2rDFcDG',
    'Support Agent',
    'agent'
  ),
  (
    'supervisor',
    '$2b$10$hQziFDXdgS00G0jMShpTfOzfqNOQktAXJt6o..EKFRJidm5qJTeVe',
    'Supervisor',
    'supervisor'
  )
ON CONFLICT (username) DO NOTHING;
