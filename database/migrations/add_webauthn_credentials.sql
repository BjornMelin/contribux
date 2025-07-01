-- Migration: Add WebAuthn credentials table for passwordless authentication
-- Portfolio showcase feature for advanced security demonstration
-- Integrated with existing contribux migration system

-- This migration adds WebAuthn passwordless authentication support
-- Compatible with the existing database schema and migration tracking

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL, -- Store as base64 encoded for compatibility with Drizzle schema
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Composite unique constraint to prevent duplicate credentials per user
  CONSTRAINT webauthn_credentials_user_id_credential_id_unique UNIQUE (user_id, credential_id)
);

-- Index for efficient lookups by user_id
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);

-- Index for efficient lookups by credential_id (used during authentication)
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);

-- Check constraints for data integrity (matching Drizzle schema expectations)
ALTER TABLE webauthn_credentials 
  ADD CONSTRAINT IF NOT EXISTS counter_positive CHECK (counter >= 0);

ALTER TABLE webauthn_credentials 
  ADD CONSTRAINT IF NOT EXISTS credential_id_not_empty 
  CHECK (length(trim(credential_id)) > 0);

ALTER TABLE webauthn_credentials 
  ADD CONSTRAINT IF NOT EXISTS public_key_not_empty 
  CHECK (length(trim(public_key)) > 0);

-- Comments for documentation
COMMENT ON TABLE webauthn_credentials IS 'WebAuthn credentials for passwordless authentication';
COMMENT ON COLUMN webauthn_credentials.credential_id IS 'Base64url-encoded credential ID from WebAuthn';
COMMENT ON COLUMN webauthn_credentials.public_key IS 'Base64-encoded public key from WebAuthn registration';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Signature counter for replay attack prevention';
COMMENT ON COLUMN webauthn_credentials.device_name IS 'User-friendly device name for credential management';
COMMENT ON COLUMN webauthn_credentials.created_at IS 'Credential registration timestamp';
COMMENT ON COLUMN webauthn_credentials.last_used_at IS 'Last successful authentication timestamp';

-- Verify the foreign key relationship exists (users table should exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'Users table does not exist. Please run base schema migrations first.';
  END IF;
END $$;