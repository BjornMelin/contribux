const { neon } = require('@neondatabase/serverless')

async function applyAuthIndexes() {
  const sql = neon(process.env.DATABASE_URL)

  try {
    const indexes = [
      'idx_webauthn_credentials_user_id ON webauthn_credentials(user_id)',
      'idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id)',
      'idx_webauthn_credentials_last_used ON webauthn_credentials(last_used_at)',
      'idx_auth_challenges_challenge ON auth_challenges(challenge)',
      'idx_auth_challenges_user_id ON auth_challenges(user_id)',
      'idx_auth_challenges_expires_at ON auth_challenges(expires_at)',
      'idx_auth_challenges_type ON auth_challenges(type)',
      'idx_user_sessions_user_id ON user_sessions(user_id)',
      'idx_user_sessions_expires_at ON user_sessions(expires_at)',
      'idx_user_sessions_last_active ON user_sessions(last_active_at)',
      'idx_oauth_accounts_user_id ON oauth_accounts(user_id)',
      'idx_oauth_accounts_provider ON oauth_accounts(provider)',
      'idx_oauth_accounts_provider_account_id ON oauth_accounts(provider_account_id)',
      'idx_security_audit_logs_user_id ON security_audit_logs(user_id)',
      'idx_security_audit_logs_event_type ON security_audit_logs(event_type)',
      'idx_security_audit_logs_created_at ON security_audit_logs(created_at)',
      'idx_security_audit_logs_event_severity ON security_audit_logs(event_severity)',
      'idx_user_consents_user_id ON user_consents(user_id)',
      'idx_user_consents_consent_type ON user_consents(consent_type)',
      'idx_user_consents_timestamp ON user_consents(timestamp)',
      'idx_refresh_tokens_user_id ON refresh_tokens(user_id)',
      'idx_refresh_tokens_session_id ON refresh_tokens(session_id)',
      'idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)',
      'idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)',
    ]

    for (const index of indexes) {
      await sql`CREATE INDEX IF NOT EXISTS ${sql(index)}`
    }
  } catch (_error) {
    process.exit(1)
  }
}

applyAuthIndexes()
