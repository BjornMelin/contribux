-- Migration to remove WebAuthn tables and simplify auth to GitHub OAuth only

-- Drop WebAuthn-related tables
DROP TABLE IF EXISTS webauthn_credentials CASCADE;
DROP TABLE IF EXISTS auth_challenges CASCADE;

-- Update user_sessions to remove webauthn auth_method option
ALTER TABLE user_sessions 
DROP CONSTRAINT IF EXISTS user_sessions_auth_method_check;

ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_auth_method_check 
CHECK (auth_method = 'oauth');

-- Clean up any WebAuthn-related audit log entries
DELETE FROM security_audit_logs 
WHERE event_type IN ('webauthn_registration', 'webauthn_authentication');

-- Update any existing sessions to use oauth
UPDATE user_sessions 
SET auth_method = 'oauth' 
WHERE auth_method = 'webauthn';