-- Migration: Add Multi-Provider OAuth Support
-- Description: Updates the database schema to support multiple OAuth providers (GitHub, Google, LinkedIn, etc.)
-- while maintaining backwards compatibility with existing GitHub-only authentication
-- Date: 2025-06-24

BEGIN;

-- Step 1: Make github_username optional and add new user fields
-- This allows users to exist without a GitHub account (e.g., Google-only users)
ALTER TABLE users 
    ALTER COLUMN github_username DROP NOT NULL,
    ADD COLUMN display_name VARCHAR(255),
    ADD COLUMN username VARCHAR(255) UNIQUE;

-- Step 2: Populate new fields from existing data for backwards compatibility
-- Set display_name from github_name or github_username as fallback
UPDATE users 
SET 
    display_name = COALESCE(github_name, github_username),
    username = github_username
WHERE display_name IS NULL OR username IS NULL;

-- Step 3: Add constraints for the new fields
-- Ensure every user has a display_name and username
ALTER TABLE users 
    ALTER COLUMN display_name SET NOT NULL,
    ALTER COLUMN username SET NOT NULL;

-- Step 4: Update oauth_accounts table for multi-provider support
ALTER TABLE oauth_accounts 
    ADD COLUMN is_primary BOOLEAN DEFAULT false,
    ADD COLUMN linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 5: Set existing GitHub accounts as primary
UPDATE oauth_accounts 
SET is_primary = true 
WHERE provider = 'github';

-- Step 6: Create account_linking_requests table for email verification during account linking
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

-- Step 7: Create indexes for performance

-- User table indexes for new fields
CREATE INDEX idx_users_display_name ON users(display_name);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_display_name_trgm ON users USING GIN(display_name gin_trgm_ops);

-- OAuth accounts indexes for multi-provider support
CREATE INDEX idx_oauth_accounts_is_primary ON oauth_accounts(is_primary);
CREATE INDEX idx_oauth_accounts_linked_at ON oauth_accounts(linked_at);
CREATE INDEX idx_oauth_accounts_user_provider ON oauth_accounts(user_id, provider);

-- Account linking requests indexes
CREATE INDEX idx_account_linking_requests_user_id ON account_linking_requests(user_id);
CREATE INDEX idx_account_linking_requests_verification_token ON account_linking_requests(verification_token);
CREATE INDEX idx_account_linking_requests_expires_at ON account_linking_requests(expires_at);
CREATE INDEX idx_account_linking_requests_email ON account_linking_requests(email);

-- Step 8: Add constraint to ensure each user has at least one primary OAuth account
-- This will be enforced at the application level initially, then as a trigger later

-- Step 9: Update the cleanup function to handle account linking requests
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

-- Step 10: Add trigger for updated_at on account_linking_requests
CREATE TRIGGER update_account_linking_requests_updated_at BEFORE UPDATE ON account_linking_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 11: Create helper function to get user's primary OAuth provider
CREATE OR REPLACE FUNCTION get_user_primary_provider(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT provider 
        FROM oauth_accounts 
        WHERE user_id = user_uuid AND is_primary = true 
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create helper function to check if email is available for linking
CREATE OR REPLACE FUNCTION is_email_available_for_linking(check_email TEXT, current_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if email exists for a different user
    RETURN NOT EXISTS (
        SELECT 1 FROM users 
        WHERE email = check_email 
        AND (current_user_id IS NULL OR id != current_user_id)
    );
END;
$$ LANGUAGE plpgsql;

-- Step 13: Add comments for documentation
COMMENT ON COLUMN users.display_name IS 'User''s preferred display name, shown in UI';
COMMENT ON COLUMN users.username IS 'Unique username for the platform, may be from primary OAuth provider';
COMMENT ON COLUMN oauth_accounts.is_primary IS 'Indicates the primary OAuth account used for initial registration';
COMMENT ON COLUMN oauth_accounts.linked_at IS 'Timestamp when this OAuth account was linked to the user';
COMMENT ON TABLE account_linking_requests IS 'Temporary table for managing email verification during OAuth account linking';

-- Commit the transaction
COMMIT;