#!/usr/bin/env node

/**
 * Database schema migration for Multi-Factor Authentication (MFA)
 * Adds TOTP credentials and backup codes tables
 *
 * Usage: node scripts/apply-mfa-schema.js
 */

const { Client } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_DEV

if (!DATABASE_URL) {
  process.exit(1)
}

async function applyMFASchema() {
  const client = new Client({ connectionString: DATABASE_URL })

  try {
    await client.connect()
    await client.query(`
      CREATE TABLE IF NOT EXISTS totp_credentials (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        secret TEXT NOT NULL, -- Base32 encoded secret
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
        
        -- Ensure only one TOTP credential per user
        CONSTRAINT unique_totp_per_user UNIQUE (user_id)
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mfa_backup_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL, -- SHA-256 hash of the backup code
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        used_at TIMESTAMP WITH TIME ZONE,
        generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Prevent duplicate codes for same user
        CONSTRAINT unique_backup_code_per_user UNIQUE (user_id, code_hash)
      )
    `)
    try {
      // Add MFA columns if they don't exist
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS primary_mfa_method TEXT CHECK (primary_mfa_method IN ('totp', 'webauthn', 'backup_code')),
        ADD COLUMN IF NOT EXISTS mfa_enrolled_methods TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS last_mfa_used_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS mfa_backup_codes_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS trusted_device_fingerprints TEXT[] DEFAULT '{}'
      `)
    } catch (error) {
      if (error.message.includes('already exists')) {
        // Column already exists, skip addition
      } else {
        throw error
      }
    }
    const indexes = [
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

    for (const indexQuery of indexes) {
      await client.query(indexQuery)
    }
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `)

    const triggerTables = ['totp_credentials', 'mfa_backup_codes']
    for (const table of triggerTables) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at 
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `)
    }
    try {
      await client.query(`
        ALTER TABLE audit_logs 
        ADD COLUMN IF NOT EXISTS mfa_method TEXT CHECK (mfa_method IN ('totp', 'webauthn', 'backup_code')),
        ADD COLUMN IF NOT EXISTS mfa_success BOOLEAN,
        ADD COLUMN IF NOT EXISTS device_fingerprint TEXT
      `)
    } catch (error) {
      if (error.message.includes('already exists')) {
        // Audit log columns already exist, skip addition
      } else {
        throw error
      }
    }

    // Constraint: Users with MFA enabled must have at least one method
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_mfa_enabled_has_methods 
      CHECK (
        (mfa_enabled = FALSE) OR 
        (mfa_enabled = TRUE AND array_length(mfa_enrolled_methods, 1) > 0)
      )
    `)

    // Constraint: Primary MFA method must be in enrolled methods
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_primary_mfa_in_enrolled 
      CHECK (
        (primary_mfa_method IS NULL) OR 
        (primary_mfa_method = ANY(mfa_enrolled_methods))
      )
    `)

    // Constraint: Backup codes count matches actual backup codes
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT IF NOT EXISTS check_backup_codes_count_valid 
      CHECK (mfa_backup_codes_count >= 0 AND mfa_backup_codes_count <= 10)
    `)
  } catch (_error) {
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  applyMFASchema().catch(console.error)
}

module.exports = { applyMFASchema }
