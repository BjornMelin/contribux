-- Add OAuth account linking and security audit storage used by NextAuth callbacks.
-- This keeps the migrated database aligned with the application auth layer.

ALTER TABLE users
  ALTER COLUMN github_id DROP NOT NULL,
  ALTER COLUMN github_login DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS preferences JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
  ON oauth_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_primary_provider
  ON oauth_accounts(user_id, provider)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_severity TEXT NOT NULL DEFAULT 'info',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  event_data JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type
  ON security_audit_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id
  ON security_audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at
  ON security_audit_logs(created_at DESC);
