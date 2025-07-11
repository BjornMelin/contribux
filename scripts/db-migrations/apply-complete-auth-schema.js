#!/usr/bin/env node

/**
 * Complete Authentication Schema Migration
 * Consolidates WebAuthn, OAuth, Sessions, Audit Logs, and MFA schemas
 *
 * Usage: node scripts/db-migrations/apply-complete-auth-schema.js
 */

const { neon } = require('@neondatabase/serverless')

async function applyCompleteAuthSchema() {
  const sql = neon(process.env.DATABASE_URL)

  try {
    console.log('Applying complete authentication schema...')

    // === WebAuthn & OAuth Tables ===

    // Create webauthn_credentials table
    await sql`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        credential_device_type TEXT NOT NULL,
        credential_backed_up BOOLEAN NOT NULL DEFAULT false,
        transports TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used_at TIMESTAMP WITH TIME ZONE,
        name TEXT,
        CONSTRAINT unique_credential_id UNIQUE(credential_id)
      )
    `

    // Create auth_challenges table
    await sql`
      CREATE TABLE IF NOT EXISTS auth_challenges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        challenge TEXT NOT NULL UNIQUE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT false
      )
    `

    // Create user_sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        auth_method TEXT NOT NULL CHECK (auth_method IN ('webauthn', 'oauth')),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // Create oauth_accounts table
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        token_type TEXT,
        scope TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_provider_account UNIQUE(provider, provider_account_id)
      )
    `

    // Create security_audit_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS security_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_type TEXT NOT NULL,
        event_severity TEXT NOT NULL CHECK (event_severity IN ('info', 'warning', 'error', 'critical')),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ip_address INET,
        user_agent TEXT,
        event_data JSONB,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        -- MFA-related fields
        mfa_method TEXT CHECK (mfa_method IN ('totp', 'webauthn', 'backup_code')),
        mfa_success BOOLEAN,
        device_fingerprint TEXT
      )
    `

    // Create user_consents table
    await sql`
      CREATE TABLE IF NOT EXISTS user_consents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consent_type TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        version TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ip_address INET,
        user_agent TEXT
      )
    `

    // Create refresh_tokens table
    await sql`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token_hash TEXT NOT NULL UNIQUE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        revoked_at TIMESTAMP WITH TIME ZONE,
        replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
        CONSTRAINT unique_token_hash UNIQUE(token_hash)
      )
    `

    // === MFA Tables ===

    // Create totp_credentials table
    await sql`
      CREATE TABLE IF NOT EXISTS totp_credentials (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        secret TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'SHA1' CHECK (algorithm IN ('SHA1', 'SHA256', 'SHA512')),
        digits INTEGER NOT NULL DEFAULT 6 CHECK (digits IN (6, 8)),
        period INTEGER NOT NULL DEFAULT 30 CHECK (period >= 15 AND period <= 300),
        issuer TEXT NOT NULL DEFAULT 'Contribux',
        account_name TEXT NOT NULL,
        qr_code_url TEXT,
        last_used_at TIMESTAMP WITH TIME ZONE,
        last_used_counter BIGINT DEFAULT 0,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        backup_codes_generated_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_totp_per_user UNIQUE (user_id)
      )
    `

    // Create mfa_backup_codes table
    await sql`
      CREATE TABLE IF NOT EXISTS mfa_backup_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        used_at TIMESTAMP WITH TIME ZONE,
        generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_backup_code_per_user UNIQUE (user_id, code_hash)
      )
    `

    // === User Table MFA Columns ===
    try {
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS primary_mfa_method TEXT CHECK (primary_mfa_method IN ('totp', 'webauthn', 'backup_code')),
        ADD COLUMN IF NOT EXISTS mfa_enrolled_methods TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS last_mfa_used_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS mfa_backup_codes_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS trusted_device_fingerprints TEXT[] DEFAULT '{}'
      `
    } catch (error) {
      if (error.message.includes('already exists')) {
        // Columns already exist, skip addition
      } else {
        throw error
      }
    }

    // === Indexes ===
    const indexes = [
      // WebAuthn & OAuth indexes
      'CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id)',
      'CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_last_used ON webauthn_credentials(last_used_at)',
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_challenge ON auth_challenges(challenge)',
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_id ON auth_challenges(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_type ON auth_challenges(type)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active ON user_sessions(last_active_at)',
      'CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider)',
      'CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_account_id ON oauth_accounts(provider_account_id)',
      'CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_id ON security_audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type ON security_audit_logs(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON security_audit_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_severity ON security_audit_logs(event_severity)',
      'CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_consents_consent_type ON user_consents(consent_type)',
      'CREATE INDEX IF NOT EXISTS idx_user_consents_timestamp ON user_consents(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id ON refresh_tokens(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)',
      // MFA indexes
      'CREATE INDEX IF NOT EXISTS idx_totp_credentials_user_id ON totp_credentials(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_totp_credentials_last_used ON totp_credentials(last_used_at)',
      'CREATE INDEX IF NOT EXISTS idx_totp_credentials_verified ON totp_credentials(is_verified)',
      'CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_used ON mfa_backup_codes(is_used)',
      'CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_generated ON mfa_backup_codes(generated_at)',
      'CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled)',
      'CREATE INDEX IF NOT EXISTS idx_users_primary_mfa_method ON users(primary_mfa_method)',
      'CREATE INDEX IF NOT EXISTS idx_users_last_mfa_used ON users(last_mfa_used_at)',
    ]

    for (const indexSql of indexes) {
      await sql([indexSql])
    }

    // === Triggers ===
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `

    const triggerTables = ['totp_credentials', 'mfa_backup_codes', 'oauth_accounts']
    for (const table of triggerTables) {
      await sql`
        DROP TRIGGER IF EXISTS ${sql(table)}_updated_at ON ${sql(table)};
        CREATE TRIGGER ${sql(table)}_updated_at 
          BEFORE UPDATE ON ${sql(table)}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `
    }

    // === Constraints ===
    await sql`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_mfa_enabled_has_methods 
      CHECK (
        (mfa_enabled = FALSE) OR 
        (mfa_enabled = TRUE AND array_length(mfa_enrolled_methods, 1) > 0)
      )
    `

    await sql`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_primary_mfa_in_enrolled 
      CHECK (
        (primary_mfa_method IS NULL) OR 
        (primary_mfa_method = ANY(mfa_enrolled_methods))
      )
    `

    await sql`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_backup_codes_count_valid 
      CHECK (mfa_backup_codes_count >= 0 AND mfa_backup_codes_count <= 10)
    `

    console.log('✅ Complete authentication schema applied successfully!')
  } catch (error) {
    console.error('❌ Error applying authentication schema:', error)
    process.exit(1)
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  applyCompleteAuthSchema().catch(console.error)
}

module.exports = { applyCompleteAuthSchema }
