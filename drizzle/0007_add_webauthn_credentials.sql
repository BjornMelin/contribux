-- Migration: Add WebAuthn credentials table for passwordless authentication
-- Portfolio showcase feature for advanced security demonstration

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT webauthn_credentials_user_id_idx UNIQUE (user_id, credential_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);

-- Comments for documentation
COMMENT ON TABLE webauthn_credentials IS 'WebAuthn credentials for passwordless authentication';
COMMENT ON COLUMN webauthn_credentials.credential_id IS 'Base64url-encoded credential ID from WebAuthn';
COMMENT ON COLUMN webauthn_credentials.public_key IS 'Raw public key bytes from WebAuthn registration';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Signature counter for replay attack prevention';