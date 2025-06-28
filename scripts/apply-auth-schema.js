const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

async function applyAuthSchema() {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    console.log('🔄 Applying authentication schema...');
    
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
    `;
    console.log('✅ webauthn_credentials table created');

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
    `;
    console.log('✅ auth_challenges table created');

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
    `;
    console.log('✅ user_sessions table created');

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
    `;
    console.log('✅ oauth_accounts table created');

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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    console.log('✅ security_audit_logs table created');

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
    `;
    console.log('✅ user_consents table created');

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
    `;
    console.log('✅ refresh_tokens table created');

    // Create indexes
    console.log('🔄 Creating indexes...');
    
    const indexes = [
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
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)'
    ];

    for (const indexSql of indexes) {
      await sql([indexSql]);
    }
    console.log('✅ All indexes created');

    console.log('🎉 Authentication schema applied successfully!');
    
  } catch (error) {
    console.error('❌ Error applying auth schema:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

applyAuthSchema();