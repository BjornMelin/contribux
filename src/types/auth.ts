import type { DefaultSession } from 'next-auth'
import { z } from 'zod'
import type { ApiResponse, BaseEntity, Email, GitHubUsername, Result, UUID } from './base'
import { BaseEntitySchema, EmailSchema, GitHubUsernameSchema, UUIDSchema } from './base'

// Extend NextAuth types
declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string
    provider?: string // Added provider property at root level
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      login?: string
      githubId?: number
      githubUsername?: string | undefined
      connectedProviders?: string[]
      primaryProvider?: string
      provider?: string // Keep provider property on user as well for compatibility
    } & DefaultSession['user']
  }

  interface User {
    id: string
    email: string
    emailVerified: Date | null
    name?: string | null
    image?: string | null
    login?: string
    githubId?: number
    githubUsername?: string
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    login?: string
    githubId?: number
    provider?: string
  }
}

// Note: NextAuth v5 uses @auth/core/adapters internally
// We define these interfaces here for type compatibility
export interface CustomAdapterUser {
  id: string
  email: string
  emailVerified: Date | null
  name?: string | null
  image?: string | null
  githubUsername?: string
}

export interface CustomAdapterAccount {
  userId: string
  type: string
  provider: string
  providerAccountId: string
  refresh_token?: string | null
  access_token?: string | null
  expires_at?: number | null
  token_type?: string | null
  scope?: string | null
  id_token?: string | null
  session_state?: string | null
}

export interface CustomAdapterSession {
  id: string
  sessionToken: string
  userId: string
  expires: Date
}

// ==================== CORE ENUMS ====================

/**
 * Authentication methods supported by the system
 */
export const AuthMethod = {
  OAUTH: 'oauth',
} as const

export type AuthMethod = (typeof AuthMethod)[keyof typeof AuthMethod]

export const AuthMethodSchema = z.nativeEnum(AuthMethod)

/**
 * OAuth providers supported by the system
 */
export const OAuthProvider = {
  GITHUB: 'github',
  GOOGLE: 'google',
  DISCORD: 'discord',
} as const

export type OAuthProvider = (typeof OAuthProvider)[keyof typeof OAuthProvider]

export const OAuthProviderSchema = z.nativeEnum(OAuthProvider)

/**
 * Event severity levels for security audit logs
 */
export const EventSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const

export type EventSeverity = (typeof EventSeverity)[keyof typeof EventSeverity]

export const EventSeveritySchema = z.nativeEnum(EventSeverity)

// ==================== USER TYPES ====================

/**
 * Core user interface with strict typing
 */
export interface User extends BaseEntity {
  readonly email: Email
  readonly displayName: string
  readonly username: string
  readonly githubUsername?: GitHubUsername
  readonly emailVerified: boolean
  readonly twoFactorEnabled: boolean
  readonly recoveryEmail?: Email
  readonly lockedAt?: Date
  readonly failedLoginAttempts: number
  readonly lastLoginAt?: Date
}

/**
 * Zod schema for user validation
 */
export const UserSchema = BaseEntitySchema.extend({
  email: EmailSchema,
  displayName: z.string().min(1).max(100),
  username: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  githubUsername: GitHubUsernameSchema.optional(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  recoveryEmail: EmailSchema.optional(),
  lockedAt: z.date().optional(),
  failedLoginAttempts: z.number().int().min(0),
  lastLoginAt: z.date().optional(),
})

/**
 * OAuth account linking information
 */
export interface OAuthAccount extends BaseEntity {
  readonly userId: UUID
  readonly provider: OAuthProvider
  readonly providerAccountId: string
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly expiresAt?: Date
  readonly tokenType?: string
  readonly scope?: string
  readonly isPrimary: boolean
  readonly linkedAt: Date
}

/**
 * Zod schema for OAuth account validation
 */
export const OAuthAccountSchema = BaseEntitySchema.extend({
  userId: UUIDSchema,
  provider: OAuthProviderSchema,
  providerAccountId: z.string().min(1),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
  isPrimary: z.boolean(),
  linkedAt: z.date(),
})

/**
 * User session information
 */
export interface UserSession extends BaseEntity {
  readonly userId: UUID
  readonly expiresAt: Date
  readonly authMethod: AuthMethod
  readonly ipAddress?: string
  readonly userAgent?: string
  readonly lastActiveAt: Date
}

/**
 * Zod schema for user session validation
 */
export const UserSessionSchema = BaseEntitySchema.extend({
  userId: UUIDSchema,
  expiresAt: z.date(),
  authMethod: AuthMethodSchema,
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  lastActiveAt: z.date(),
})
// =============================================================================
// MFA TYPE DEFINITIONS
// =============================================================================

/**
 * Multi-Factor Authentication method types
 */
export const MFAMethod = z.enum(['totp', 'webauthn', 'backup_code'])
export type MFAMethod = z.infer<typeof MFAMethod>

/**
 * TOTP (Time-based One-Time Password) credential for MFA
 */
export interface TOTPCredential extends BaseEntity {
  readonly userId: string
  readonly secret: string // Base32 encoded secret
  readonly algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  readonly digits: 6 | 8
  readonly period: number // Time step in seconds (typically 30)
  readonly issuer: string
  readonly accountName: string
  readonly qrCodeUrl?: string
  readonly backupCodes: string[] // Encrypted backup codes
  readonly lastUsedAt?: Date
  readonly isVerified: boolean // Whether the TOTP setup was completed
}

export const TOTPCredentialSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  secret: z.string().min(16).max(64), // Base32 encoded secret
  algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']).default('SHA1'),
  digits: z.union([z.literal(6), z.literal(8)]).default(6),
  period: z.number().int().min(15).max(300).default(30),
  issuer: z.string().min(1).max(100),
  accountName: z.string().min(1).max(255),
  qrCodeUrl: z.string().url().optional(),
  backupCodes: z.array(z.string()).max(10),
  lastUsedAt: z.date().optional(),
  isVerified: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/**
 * WebAuthn credential for MFA (enhanced from existing)
 */
export interface WebAuthnCredential extends BaseEntity {
  readonly userId: string
  readonly credentialId: string // Base64URL encoded credential ID
  readonly publicKey: string // Base64URL encoded public key
  readonly counter: number // Signature counter
  readonly deviceType: 'single_device' | 'multi_device'
  readonly backedUp: boolean
  readonly transports: AuthenticatorTransport[]
  readonly userHandle?: string // Base64URL encoded user handle
  readonly attestationType: 'none' | 'self' | 'basic' | 'ecdaa'
  readonly lastUsedAt?: Date
  readonly name?: string // User-assigned name for the device
}

export const WebAuthnCredentialSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  credentialId: z.string().min(1),
  publicKey: z.string().min(1),
  counter: z.number().int().min(0),
  deviceType: z.enum(['single_device', 'multi_device']),
  backedUp: z.boolean(),
  transports: z.array(z.enum(['usb', 'nfc', 'ble', 'hybrid', 'internal'])),
  userHandle: z.string().optional(),
  attestationType: z.enum(['none', 'self', 'basic', 'ecdaa']).default('none'),
  lastUsedAt: z.date().optional(),
  name: z.string().max(100).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/**
 * MFA backup codes for account recovery
 */
export interface MFABackupCode extends BaseEntity {
  readonly userId: string
  readonly code: string // Hashed backup code
  readonly isUsed: boolean
  readonly usedAt?: Date
  readonly generatedAt: Date
}

export const MFABackupCodeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  code: z.string().length(8), // 8-character backup code
  isUsed: z.boolean().default(false),
  usedAt: z.date().optional(),
  generatedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/**
 * MFA enrollment request
 */
export interface MFAEnrollmentRequest {
  readonly method: MFAMethod
  readonly deviceName?: string // For WebAuthn devices
}

export const MFAEnrollmentRequestSchema = z.object({
  method: MFAMethod,
  deviceName: z.string().min(1).max(100).optional(),
})

/**
 * MFA verification request
 */
export interface MFAVerificationRequest {
  readonly method: MFAMethod
  readonly token?: string // For TOTP or backup codes
  readonly credentialId?: string // For WebAuthn
  readonly assertion?: object // WebAuthn assertion response
}

export const MFAVerificationRequestSchema = z
  .object({
    method: MFAMethod,
    token: z.string().optional(),
    credentialId: z.string().optional(),
    assertion: z.object({}).optional(),
  })
  .strict()

/**
 * MFA enrollment response
 */
export interface MFAEnrollmentResponse {
  readonly success: boolean
  readonly method: MFAMethod
  readonly secret?: string // Base32 TOTP secret for QR code generation
  readonly qrCodeUrl?: string // TOTP QR code URL
  readonly backupCodes?: string[] // Plaintext backup codes (show once)
  readonly registrationOptions?: object // WebAuthn registration options
  readonly error?: string
}

export const MFAEnrollmentResponseSchema = z.object({
  success: z.boolean(),
  method: MFAMethod,
  secret: z.string().optional(),
  qrCodeUrl: z.string().url().optional(),
  backupCodes: z.array(z.string()).optional(),
  registrationOptions: z.object({}).optional(),
  error: z.string().optional(),
})

/**
 * MFA verification response
 */
export interface MFAVerificationResponse {
  readonly success: boolean
  readonly method: MFAMethod
  readonly remainingAttempts?: number
  readonly lockoutDuration?: number // Seconds until next attempt allowed
  readonly error?: string
}

export const MFAVerificationResponseSchema = z.object({
  success: z.boolean(),
  method: MFAMethod,
  remainingAttempts: z.number().int().min(0).optional(),
  lockoutDuration: z.number().int().min(0).optional(),
  error: z.string().optional(),
})

/**
 * MFA settings for a user
 */
export interface MFASettings {
  readonly enabled: boolean
  readonly primaryMethod?: MFAMethod
  readonly enrolledMethods: MFAMethod[]
  readonly backupCodesCount: number
  readonly lastMFAUsed?: Date
  readonly trustedDevices: string[] // Device fingerprints
}

export const MFASettingsSchema = z.object({
  enabled: z.boolean(),
  primaryMethod: MFAMethod.optional(),
  enrolledMethods: z.array(MFAMethod),
  backupCodesCount: z.number().int().min(0).max(10),
  lastMFAUsed: z.date().optional(),
  trustedDevices: z.array(z.string()),
})

/**
 * Enhanced AuthenticationResult with detailed MFA information
 */
export interface EnhancedAuthenticationResult extends AuthenticationResult {
  readonly mfaRequired: boolean
  readonly mfaSettings?: MFASettings
  readonly availableMethods?: MFAMethod[]
  readonly mfaAttempts?: number
  readonly mfaLockoutDuration?: number
}

/**
 * Refresh token for session management
 */
export interface RefreshToken extends BaseEntity {
  readonly tokenHash: string
  readonly userId: UUID
  readonly sessionId: UUID
  readonly expiresAt: Date
  readonly revokedAt?: Date
  readonly replacedBy?: UUID
}

/**
 * Zod schema for refresh token validation
 */
export const RefreshTokenSchema = BaseEntitySchema.extend({
  tokenHash: z.string().min(1),
  userId: UUIDSchema,
  sessionId: UUIDSchema,
  expiresAt: z.date(),
  revokedAt: z.date().optional(),
  replacedBy: UUIDSchema.optional(),
})

// ==================== AUDIT LOG TYPES ====================

/**
 * Authentication and security event types
 */
export const AuthEventType = {
  // Authentication events
  LOGIN_ATTEMPT: 'login_attempt',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',

  // OAuth events
  OAUTH_LINK: 'oauth_link',
  OAUTH_UNLINK: 'oauth_unlink',

  // Session events
  SESSION_CREATED: 'session_created',
  SESSION_REFRESHED: 'session_refreshed',
  SESSION_EXPIRED: 'session_expired',
  SESSION_TERMINATED: 'session_terminated',
  SESSION_REVOKED: 'session_revoked',

  // Token events
  TOKEN_REFRESHED: 'token_refreshed',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_REUSE_DETECTED: 'token_reuse_detected',

  // Account security
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',

  // Error events
  AUTHENTICATION_ERROR: 'authentication_error',
  AUTHORIZATION_FAILURE: 'authorization_failure',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',

  // Data events
  DATA_ACCESS: 'data_access',
  DATA_EXPORT_REQUEST: 'data_export_request',
  DATA_DELETION_REQUEST: 'data_deletion_request',

  // Consent events
  CONSENT_GRANTED: 'consent_granted',
  CONSENT_REVOKED: 'consent_revoked',

  // Configuration events
  CONFIG_CHANGE: 'config_change',
  CONFIG_VIEW: 'config_view',

  // Security events
  UNUSUAL_ACTIVITY: 'unusual_activity',
  SECURITY_VIOLATION: 'security_violation',
  DATA_BREACH_ATTEMPT: 'data_breach_attempt',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  CRITICAL_OPERATION: 'critical_operation',
  SYSTEM_COMPROMISE: 'system_compromise',
} as const

export type AuthEventType = (typeof AuthEventType)[keyof typeof AuthEventType]

export const AuthEventTypeSchema = z.nativeEnum(AuthEventType)

/**
 * Security audit log entry
 */
export interface SecurityAuditLog extends BaseEntity {
  readonly eventType: AuthEventType
  readonly eventSeverity: EventSeverity
  readonly userId?: UUID
  readonly ipAddress?: string
  readonly userAgent?: string
  readonly eventData?: Record<string, unknown>
  readonly success: boolean
  readonly errorMessage?: string
  readonly checksum?: string
}

/**
 * Zod schema for security audit log validation
 */
export const SecurityAuditLogSchema = BaseEntitySchema.extend({
  eventType: AuthEventTypeSchema,
  eventSeverity: EventSeveritySchema,
  userId: UUIDSchema.optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  eventData: z.record(z.unknown()).optional(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
  checksum: z.string().optional(),
})

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  readonly userId?: UUID
  readonly eventTypes?: readonly AuthEventType[]
  readonly startDate?: Date
  readonly endDate?: Date
  readonly severity?: EventSeverity
  readonly limit?: number
  readonly offset?: number
}

/**
 * Zod schema for audit log filters validation
 */
export const AuditLogFiltersSchema = z.object({
  userId: UUIDSchema.optional(),
  eventTypes: z.array(AuthEventTypeSchema).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  severity: EventSeveritySchema.optional(),
  limit: z.number().int().positive().max(1000).default(100).optional(),
  offset: z.number().int().min(0).default(0).optional(),
})

/**
 * Security metrics for monitoring
 */
export interface SecurityMetrics {
  readonly loginSuccessRate: number
  readonly failedLoginCount: number
  readonly lockedAccountCount: number
  readonly anomalyCount: number
  readonly periodStart: Date
  readonly periodEnd: Date
}

/**
 * Zod schema for security metrics validation
 */
export const SecurityMetricsSchema = z.object({
  loginSuccessRate: z.number().min(0).max(1),
  failedLoginCount: z.number().int().min(0),
  lockedAccountCount: z.number().int().min(0),
  anomalyCount: z.number().int().min(0),
  periodStart: z.date(),
  periodEnd: z.date(),
})

/**
 * Anomaly detection result
 */
export interface AnomalyDetection {
  readonly detected: boolean
  readonly type?: string | undefined
  readonly confidence?: number | undefined
  readonly details?: Record<string, boolean> | undefined
}

/**
 * Zod schema for anomaly detection validation
 */
export const AnomalyDetectionSchema = z.object({
  detected: z.boolean(),
  type: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  details: z.record(z.boolean()).optional(),
})

// ==================== CONSENT MANAGEMENT ====================

/**
 * Consent types for GDPR compliance
 */
export const ConsentType = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  MARKETING: 'marketing',
  ANALYTICS: 'analytics',
  FUNCTIONAL: 'functional',
} as const

export type ConsentType = (typeof ConsentType)[keyof typeof ConsentType]

export const ConsentTypeSchema = z.nativeEnum(ConsentType)

/**
 * User consent record
 */
export interface UserConsent extends BaseEntity {
  readonly userId: UUID
  readonly consentType: ConsentType
  readonly granted: boolean
  readonly version: string
  readonly timestamp: Date
  readonly ipAddress?: string | undefined
  readonly userAgent?: string | undefined
}

/**
 * Zod schema for user consent validation
 */
export const UserConsentSchema = BaseEntitySchema.extend({
  userId: UUIDSchema,
  consentType: ConsentTypeSchema,
  granted: z.boolean(),
  version: z.string().min(1),
  timestamp: z.date(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
})

// ==================== JWT TOKEN PAYLOADS ====================

/**
 * Access token JWT payload
 */
export interface AccessTokenPayload {
  readonly sub: UUID // user id
  readonly email: Email
  readonly githubUsername?: GitHubUsername | undefined
  readonly authMethod: AuthMethod
  readonly sessionId: UUID
  readonly iat: number
  readonly exp: number
  readonly iss: string
  readonly aud: readonly string[]
  readonly jti: UUID // JWT ID for replay protection
  // Index signature to make compatible with Record<string, unknown>
  readonly [key: string]: unknown
}

/**
 * Refresh token JWT payload
 */
export interface RefreshTokenPayload {
  readonly jti: UUID // token id
  readonly sub: UUID // user id
  readonly sessionId: UUID
  readonly iat: number
  readonly exp: number
  readonly iss: string
}

/**
 * Zod schema for access token payload validation
 */
export const AccessTokenPayloadSchema = z.object({
  sub: UUIDSchema,
  email: EmailSchema,
  githubUsername: GitHubUsernameSchema.optional(),
  authMethod: AuthMethodSchema,
  sessionId: UUIDSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  iss: z.string().min(1),
  aud: z.array(z.string().min(1)),
  jti: UUIDSchema,
})

/**
 * Zod schema for refresh token payload validation
 */
export const RefreshTokenPayloadSchema = z.object({
  jti: UUIDSchema,
  sub: UUIDSchema,
  sessionId: UUIDSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  iss: z.string().min(1),
})

// ==================== GDPR DATA EXPORT ====================

/**
 * Complete user data export for GDPR compliance
 */
export interface UserDataExport {
  readonly user: User
  readonly oauthAccounts: readonly OAuthAccount[]
  readonly sessions: readonly UserSession[]
  readonly consents: readonly UserConsent[]
  readonly auditLogs: readonly SecurityAuditLog[]
  readonly preferences: Record<string, unknown>
  readonly notifications: readonly unknown[]
  readonly contributions: readonly unknown[]
  readonly interactions: readonly unknown[]
  readonly exportedAt: Date
  readonly exportVersion: string
}

/**
 * Zod schema for user data export validation
 */
export const UserDataExportSchema = z.object({
  user: UserSchema,
  oauthAccounts: z.array(OAuthAccountSchema),
  sessions: z.array(UserSessionSchema),
  consents: z.array(UserConsentSchema),
  auditLogs: z.array(SecurityAuditLogSchema),
  preferences: z.record(z.unknown()),
  notifications: z.array(z.unknown()),
  contributions: z.array(z.unknown()),
  interactions: z.array(z.unknown()),
  exportedAt: z.date(),
  exportVersion: z.string().min(1),
})

// ==================== AUTHENTICATION RESPONSES ====================

/**
 * Authentication operation result
 */
export interface AuthenticationResult {
  readonly success: boolean
  readonly user: User | undefined
  readonly session: UserSession | undefined
  readonly accessToken: string | undefined
  readonly refreshToken: string | undefined
  readonly error: string | undefined
  readonly requiresTwoFactor: boolean | undefined
  readonly requiresConsent: boolean | undefined
}

/**
 * Zod schema for authentication result validation
 */
export const AuthenticationResultSchema = z.object({
  success: z.boolean(),
  user: UserSchema.optional(),
  session: UserSessionSchema.optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  error: z.string().optional(),
  requiresTwoFactor: z.boolean().optional(),
  requiresConsent: z.boolean().optional(),
})

/**
 * Zod schema for enhanced authentication result validation
 */
export const EnhancedAuthenticationResultSchema = AuthenticationResultSchema.extend({
  mfaRequired: z.boolean(),
  mfaSettings: MFASettingsSchema.optional(),
  availableMethods: z.array(MFAMethod).optional(),
  mfaAttempts: z.number().int().min(0).optional(),
  mfaLockoutDuration: z.number().int().min(0).optional(),
})

/**
 * User registration data
 */
export interface RegistrationData {
  readonly email: Email
  readonly githubUsername: GitHubUsername | undefined
  readonly consents: {
    readonly terms: boolean
    readonly privacy: boolean
    readonly marketing: boolean | undefined
  }
}

/**
 * Zod schema for registration data validation
 */
export const RegistrationDataSchema = z.object({
  email: EmailSchema,
  githubUsername: GitHubUsernameSchema.optional(),
  consents: z.object({
    terms: z.boolean(),
    privacy: z.boolean(),
    marketing: z.boolean().optional(),
  }),
})

// ==================== OAUTH FLOW MANAGEMENT ====================

/**
 * OAuth state for PKCE flow
 */
export interface OAuthState {
  readonly state: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly createdAt: number
}

/**
 * Zod schema for OAuth state validation
 */
export const OAuthStateSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().url(),
  createdAt: z.number().int().positive(),
})

/**
 * Account linking verification request
 */
export interface AccountLinkingRequest extends BaseEntity {
  readonly userId: UUID
  readonly provider: OAuthProvider
  readonly providerAccountId: string
  readonly email: Email
  readonly verificationToken: string
  readonly expiresAt: Date
  readonly verifiedAt: Date | undefined
}

/**
 * Zod schema for account linking request validation
 */
export const AccountLinkingRequestSchema = BaseEntitySchema.extend({
  userId: UUIDSchema,
  provider: OAuthProviderSchema,
  providerAccountId: z.string().min(1),
  email: EmailSchema,
  verificationToken: z.string().min(1),
  expiresAt: z.date(),
  verifiedAt: z.date().optional(),
})

/**
 * Multi-provider user data for account merging
 */
export interface MultiProviderUserData {
  readonly email: Email
  readonly displayName: string
  readonly username: string
  readonly githubUsername: GitHubUsername | undefined
  readonly emailVerified: boolean
}

/**
 * Zod schema for multi-provider user data validation
 */
export const MultiProviderUserDataSchema = z.object({
  email: EmailSchema,
  displayName: z.string().min(1).max(100),
  username: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  githubUsername: GitHubUsernameSchema.optional(),
  emailVerified: z.boolean(),
})

/**
 * OAuth callback URL parameters
 */
export interface OAuthCallbackParams {
  readonly code: string | undefined
  readonly state: string
  readonly error: string | undefined
  readonly errorDescription: string | undefined
}

/**
 * Zod schema for OAuth callback parameters validation
 */
export const OAuthCallbackParamsSchema = z.object({
  code: z.string().optional(),
  state: z.string().min(1),
  error: z.string().optional(),
  errorDescription: z.string().optional(),
})

/**
 * OAuth token response
 */
export interface OAuthTokens {
  readonly accessToken: string
  readonly refreshToken: string | undefined
  readonly tokenType: string
  readonly scope: string | undefined
  readonly expiresAt: Date | undefined
}

/**
 * Zod schema for OAuth tokens validation
 */
export const OAuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenType: z.string().min(1),
  scope: z.string().optional(),
  expiresAt: z.date().optional(),
})

// ==================== SECURITY CONTEXT ====================

/**
 * Security context for request tracking
 */
export interface SecurityContext {
  readonly ipAddress: string | undefined
  readonly userAgent: string | undefined
  readonly fingerprint: string | undefined
  readonly geoLocation:
    | {
        readonly country: string | undefined
        readonly region: string | undefined
        readonly city: string | undefined
      }
    | undefined
}

/**
 * Zod schema for security context validation
 */
export const SecurityContextSchema = z.object({
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  fingerprint: z.string().optional(),
  geoLocation: z
    .object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
})

// ==================== TYPE EXPORTS ====================

/**
 * Export all auth-related result types
 */
export type AuthResult<T> = Result<T, string>
export type AuthApiResponse<T> = ApiResponse<T>
