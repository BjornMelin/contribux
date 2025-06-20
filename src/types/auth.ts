// User types
export interface User {
  id: string
  email: string
  github_username: string | null
  email_verified: boolean
  two_factor_enabled: boolean
  recovery_email: string | null
  locked_at: Date | null
  failed_login_attempts: number
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
}

// WebAuthn credential types
export interface WebAuthnCredential {
  id: string
  user_id: string
  credential_id: string
  public_key: string
  counter: number
  credential_device_type: string
  credential_backed_up: boolean
  transports: string[] | null
  created_at: Date
  last_used_at: Date | null
  name: string | null
}

// OAuth account types
export interface OAuthAccount {
  id: string
  user_id: string
  provider: string
  provider_account_id: string
  access_token: string | null
  refresh_token: string | null
  expires_at: Date | null
  token_type: string | null
  scope: string | null
  created_at: Date
  updated_at: Date
}

// Session types
export interface UserSession {
  id: string
  user_id: string
  expires_at: Date
  auth_method: 'webauthn' | 'oauth'
  ip_address: string | null
  user_agent: string | null
  created_at: Date
  last_active_at: Date
}

// Refresh token types
export interface RefreshToken {
  id: string
  token_hash: string
  user_id: string
  session_id: string
  expires_at: Date
  created_at: Date
  revoked_at: Date | null
  replaced_by: string | null
}

// Audit log types
export type AuthEventType =
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_request'
  | 'password_reset_success'
  | 'webauthn_registration'
  | 'webauthn_authentication'
  | 'oauth_link'
  | 'oauth_unlink'
  | 'session_created'
  | 'session_refreshed'
  | 'session_expired'
  | 'session_terminated'
  | 'session_revoked'
  | 'token_refreshed'
  | 'token_expired'
  | 'token_reuse_detected'
  | 'account_locked'
  | 'account_unlocked'
  | 'authentication_error'
  | 'authorization_failure'
  | 'rate_limit_exceeded'
  | 'data_access'
  | 'data_export_request'
  | 'data_deletion_request'
  | 'consent_granted'
  | 'consent_revoked'
  | 'config_change'
  | 'config_view'
  | 'unusual_activity'
  | 'security_violation'
  | 'data_breach_attempt'
  | 'privilege_escalation'
  | 'critical_operation'
  | 'system_compromise'

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface SecurityAuditLog {
  id: string
  event_type: AuthEventType | string
  event_severity: EventSeverity
  user_id: string | null
  ip_address: string | null
  user_agent: string | null
  event_data: Record<string, unknown> | null
  success: boolean
  error_message: string | null
  checksum?: string
  created_at: Date
}

// Audit log filters
export interface AuditLogFilters {
  userId?: string
  eventTypes?: string[]
  startDate?: Date
  endDate?: Date
  severity?: EventSeverity
  limit?: number
  offset?: number
}

// Security metrics
export interface SecurityMetrics {
  loginSuccessRate: number
  failedLoginCount: number
  lockedAccountCount: number
  anomalyCount: number
}

// Anomaly detection
export interface AnomalyDetection {
  detected: boolean
  type?: string
  confidence?: number
  details?: Record<string, boolean>
}

// User consent types
export interface UserConsent {
  id: string
  user_id: string
  consent_type: string
  granted: boolean
  version: string
  timestamp: Date
  ip_address: string | null
  user_agent: string | null
}

// Auth challenge types
export interface AuthChallenge {
  id: string
  challenge: string
  user_id: string | null
  type: 'registration' | 'authentication'
  created_at: Date
  expires_at: Date
  used: boolean
}

// JWT token payloads
export interface AccessTokenPayload {
  sub: string // user id
  email: string
  github_username?: string
  auth_method: 'webauthn' | 'oauth'
  session_id: string
  iat: number
  exp: number
  iss: string
  aud: string[]
}

export interface RefreshTokenPayload {
  jti: string // token id
  sub: string // user id
  session_id: string
  iat: number
  exp: number
  iss: string
}

// GDPR data export types
export interface UserDataExport {
  user: User
  oauth_accounts: OAuthAccount[]
  webauthn_credentials: Omit<WebAuthnCredential, 'public_key'>[]
  sessions: UserSession[]
  consents: UserConsent[]
  audit_logs: SecurityAuditLog[]
  preferences: Record<string, unknown> // From user_preferences table
  notifications: unknown[] // From notifications table
  contributions: unknown[] // From contribution_outcomes table
  interactions: unknown[] // From user_repository_interactions table
}

// Authentication response types
export interface AuthenticationResult {
  success: boolean
  user?: User
  session?: UserSession
  accessToken?: string
  refreshToken?: string
  error?: string
  requiresTwoFactor?: boolean
  requiresConsent?: boolean
}

// Registration types
export interface RegistrationData {
  email: string
  github_username?: string
  consents: {
    terms: boolean
    privacy: boolean
    marketing?: boolean
  }
}

// OAuth state management
export interface OAuthState {
  state: string
  codeVerifier: string
  redirectUri: string
  createdAt: number
}

// OAuth callback parameters
export interface OAuthCallbackParams {
  code?: string
  state: string
  error?: string
  error_description?: string
}

// OAuth tokens
export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType: string
  scope?: string
  expiresAt?: Date
}

// Security context
export interface SecurityContext {
  ip_address: string | null
  user_agent: string | null
  fingerprint?: string
  geo_location?: {
    country?: string
    region?: string
    city?: string
  }
}
