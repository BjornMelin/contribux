-- Simplified Authentication Schema for contribux
-- Multi-provider OAuth authentication (GitHub, Google, LinkedIn, etc.) with comprehensive audit logging
-- GDPR compliant with simplified architecture

-- User sessions for managing active authentication sessions
CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY, -- Session token
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    auth_method TEXT NOT NULL DEFAULT 'oauth' CHECK (auth_method = 'oauth'),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth accounts for multi-provider authentication (GitHub, Google, LinkedIn, etc.)
CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    token_type TEXT,
    scope TEXT,
    is_primary BOOLEAN DEFAULT false,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_provider_account UNIQUE(provider, provider_account_id)
);

-- Security audit logs for GDPR compliance and security monitoring
CREATE TABLE security_audit_logs (
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
);

-- User consents for GDPR compliance
CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    version TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Refresh tokens for secure token rotation
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    
    CONSTRAINT unique_token_hash UNIQUE(token_hash)
);

-- OAuth state management for secure OAuth flows
CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    provider TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Account linking requests for email verification during multi-provider linking
CREATE TABLE account_linking_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    email VARCHAR(255) NOT NULL,
    verification_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_pending_request UNIQUE(user_id, provider, provider_account_id),
    CONSTRAINT valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT valid_verification CHECK (verified_at IS NULL OR verified_at >= created_at)
);

-- Indexes for performance
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_account_id);
CREATE INDEX idx_oauth_accounts_is_primary ON oauth_accounts(is_primary);
CREATE INDEX idx_oauth_accounts_linked_at ON oauth_accounts(linked_at);
CREATE INDEX idx_oauth_accounts_user_provider ON oauth_accounts(user_id, provider);
CREATE INDEX idx_security_audit_logs_user_id ON security_audit_logs(user_id);
CREATE INDEX idx_security_audit_logs_created_at ON security_audit_logs(created_at);
CREATE INDEX idx_security_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX idx_account_linking_requests_user_id ON account_linking_requests(user_id);
CREATE INDEX idx_account_linking_requests_verification_token ON account_linking_requests(verification_token);
CREATE INDEX idx_account_linking_requests_expires_at ON account_linking_requests(expires_at);
CREATE INDEX idx_account_linking_requests_email ON account_linking_requests(email);

-- Clean up expired data automatically
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
    -- Delete expired sessions
    DELETE FROM user_sessions WHERE expires_at < NOW();
    
    -- Delete expired OAuth states
    DELETE FROM oauth_states WHERE expires_at < NOW();
    
    -- Delete expired and revoked refresh tokens older than 30 days
    DELETE FROM refresh_tokens 
    WHERE (expires_at < NOW() OR revoked_at IS NOT NULL) 
    AND created_at < NOW() - INTERVAL '30 days';
    
    -- Delete expired account linking requests
    DELETE FROM account_linking_requests 
    WHERE expires_at < NOW() AND verified_at IS NULL;
    
    -- Delete old verified account linking requests (older than 7 days)
    DELETE FROM account_linking_requests 
    WHERE verified_at IS NOT NULL 
    AND verified_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to clean up expired data (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-auth-data', '0 2 * * *', 'SELECT cleanup_expired_auth_data();');