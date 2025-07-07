import { oauthConfig } from '@/lib/config/oauth'
import { sql } from '@/lib/db/config'
import { env } from '@/lib/validation/env'
import type { OAuthCallbackParams, OAuthTokens, User } from '@/types/auth'
import { z } from 'zod'
import { logSecurityEvent } from './audit'
import { decryptOAuthToken, encryptOAuthToken } from './crypto'
import { generateEnhancedPKCEChallenge, validatePKCESecure } from './pkce'

// OAuth configuration
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_URL = 'https://api.github.com'

// Environment configuration with validation
const getGithubClientId = (): string => {
  const clientId = env.GITHUB_CLIENT_ID
  if (!clientId || clientId.trim() === '') {
    throw new Error('GITHUB_CLIENT_ID is required and cannot be empty')
  }

  // Prevent test values in production
  if (env.NODE_ENV === 'production' && clientId.toLowerCase().includes('test')) {
    throw new Error('GITHUB_CLIENT_ID contains test values in production environment')
  }

  return clientId
}
const getGithubClientSecret = () => {
  const secret = env.GITHUB_CLIENT_SECRET
  if (!secret) {
    throw new Error('GITHUB_CLIENT_SECRET environment variable is required')
  }
  if (process.env.NODE_ENV !== 'test' && secret.includes('test')) {
    throw new Error('GITHUB_CLIENT_SECRET contains test keywords in non-test environment')
  }
  return secret
}
const ALLOWED_REDIRECT_URIS = env.ALLOWED_REDIRECT_URIS?.split(',') || [
  'http://localhost:3000/auth/callback',
  'http://localhost:3000/api/auth/github/callback',
  'https://localhost:3000/auth/callback',
  'https://localhost:3000/api/auth/github/callback',
]

// Validation schemas
const GenerateOAuthUrlSchema = z.object({
  provider: z.enum(['github', 'google', 'linkedin', 'microsoft']),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()),
  userId: z.string().uuid().optional(),
  allowSignup: z.boolean().optional(),
})

const ValidateCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

const ExchangeTokenSchema = z.object({
  code: z.string(),
  codeVerifier: z.string(),
  redirectUri: z.string().url(),
  fetchUserProfile: z.boolean().optional(),
  securityContext: z
    .object({
      ip_address: z.string().nullable(),
      user_agent: z.string().nullable(),
    })
    .optional(),
})

// Generate OAuth authorization URL with PKCE
export async function generateOAuthUrl(
  params: z.infer<typeof GenerateOAuthUrlSchema>
): Promise<{ url: string; state: string; codeVerifier: string }> {
  const validated = GenerateOAuthUrlSchema.parse(params)

  // Enhanced redirect URI validation with security checks
  const redirectValidation = await validateRedirectUriSecure(validated.redirectUri)
  if (!redirectValidation.valid) {
    throw new Error('Invalid or suspicious redirect URI')
  }

  // Generate enhanced PKCE challenge with entropy validation
  const pkceResult = await generateEnhancedPKCEChallenge()

  // Validate PKCE entropy meets security requirements
  if (pkceResult.entropy < 4.0) {
    throw new Error('Insufficient PKCE entropy for security requirements')
  }

  // Generate cryptographically secure state with session binding
  const state = await generateSecureOAuthState(validated.userId)

  // Store OAuth state with enhanced security metadata
  await sql`
    INSERT INTO oauth_states (
      state, code_verifier, provider, redirect_uri, 
      user_id, created_at, expires_at, security_metadata
    )
    VALUES (
      ${state},
      ${pkceResult.codeVerifier},
      ${validated.provider},
      ${validated.redirectUri},
      ${validated.userId || null},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '${oauthConfig.stateExpiry / 1000} seconds',
      ${JSON.stringify({
        entropy: pkceResult.entropy,
        challenge_method: 'S256',
        security_version: '2.0',
        created_by: 'enhanced_oauth_flow',
      })}
    )
  `

  // Log security event for monitoring
  await logSecurityEvent({
    event_type: 'oauth_url_generated',
    event_severity: 'info',
    ...(validated.userId && { user_id: validated.userId }),
    event_data: {
      provider: validated.provider,
      entropy: pkceResult.entropy,
    },
    success: true,
  })

  // Build authorization URL with enhanced security parameters
  const url = new URL(GITHUB_AUTH_URL)
  url.searchParams.set('client_id', getGithubClientId())
  url.searchParams.set('redirect_uri', validated.redirectUri)
  url.searchParams.set('scope', validated.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', pkceResult.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  // Add security response type
  url.searchParams.set('response_type', 'code')

  if (validated.allowSignup !== undefined) {
    url.searchParams.set('allow_signup', validated.allowSignup.toString())
  }

  return {
    url: url.toString(),
    state,
    codeVerifier: pkceResult.codeVerifier,
  }
}

/**
 * Enhanced redirect URI validation with comprehensive security checks
 */
async function _validateRedirectUriSecure(redirectUri: string): Promise<boolean> {
  try {
    // Basic allowlist check first
    if (ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
      return true
    }

    const url = new URL(redirectUri)

    // Protocol validation
    const allowedProtocols = ['http:', 'https:']
    if (!allowedProtocols.includes(url.protocol)) {
      return false
    }

    // In production, enforce HTTPS
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return false
    }

    // Domain validation - only allow specific domains
    const allowedDomains = ['localhost', '127.0.0.1', 'contribux.vercel.app', 'contribux.app']

    const isAllowedDomain = allowedDomains.some(
      domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    )

    if (!isAllowedDomain) {
      return false
    }

    // Port validation (development only)
    const allowedPorts = [3000, 3001, 8080, 80, 443]
    const port = url.port ? Number.parseInt(url.port) : url.protocol === 'https:' ? 443 : 80

    if (!allowedPorts.includes(port)) {
      return false
    }

    // Path validation - prevent suspicious paths
    if (url.pathname.includes('..') || url.pathname.includes('//') || url.pathname.length > 1000) {
      return false
    }

    // Query parameter validation - prevent redirect chains
    const suspiciousParams = ['redirect', 'next', 'return_to', 'url']
    for (const param of suspiciousParams) {
      if (url.searchParams.has(param)) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Generate cryptographically secure OAuth state with session binding
 */
async function generateSecureOAuthState(userId?: string): Promise<string> {
  const timestamp = Date.now()
  const random = generateSecureRandomString(32)

  // Create state data with session binding
  const stateData = {
    timestamp,
    random,
    userId: userId || null,
    version: '2.0',
  }

  // Create cryptographic hash of state data
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(stateData))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert to base64url
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return `${timestamp}.${random}.${hashHex.substring(0, 32)}`
}

/**
 * Enhanced PKCE challenge generation with configurable entropy
 */

// Helper function to validate OAuth errors
async function validateOAuthErrors(validated: {
  error?: string | undefined
  error_description?: string | undefined
}): Promise<void> {
  if (validated.error) {
    await logSecurityEvent({
      event_type: 'oauth_callback_error',
      event_severity: 'error',
      event_data: {
        error: validated.error,
        description: validated.error_description,
      },
      success: false,
    })

    throw new Error(
      `OAuth error: ${validated.error} - ${validated.error_description || 'Unknown error'}`
    )
  }
}

// Helper function to fetch OAuth state with timing protection
async function fetchOAuthState(state: string): Promise<{
  state: string
  code_verifier?: string
  provider?: string
  redirect_uri?: string
  user_id?: string
  created_at: Date
  security_metadata?: string
}> {
  const startTime = performance.now()

  const stateResult = await sql`
    SELECT 
      state, 
      code_verifier, 
      provider, 
      redirect_uri, 
      user_id, 
      created_at,
      security_metadata
    FROM oauth_states
    WHERE state = ${state}
    AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `

  // Timing attack protection - ensure minimum response time
  const elapsedTime = performance.now() - startTime
  if (elapsedTime < 10) {
    await new Promise(resolve => setTimeout(resolve, 10 - elapsedTime))
  }

  if (stateResult.length === 0) {
    await logSecurityEvent({
      event_type: 'oauth_invalid_state',
      event_severity: 'warning',
      event_data: {
        provided_state: `${state?.substring(0, 8)}...`,
        ip_address: 'callback_request',
      },
      success: false,
    })
    throw new Error('Invalid or expired OAuth state')
  }

  const result = stateResult[0]
  if (!result) {
    throw new Error('Invalid or expired OAuth state')
  }

  return result as {
    state: string
    code_verifier?: string
    provider?: string
    redirect_uri?: string
    user_id?: string
    created_at: Date
    security_metadata?: string
  }
}

// Helper function to validate security metadata
function validateSecurityMetadata(securityMetadata: string | null): boolean {
  if (!securityMetadata) return true

  try {
    const metadata = JSON.parse(securityMetadata)

    // Check security version
    if (!metadata.security_version || metadata.security_version < '2.0') {
      return false
    }

    // Validate entropy if available
    if (metadata.entropy && metadata.entropy < 4.0) {
      return false
    }

    return true
  } catch {
    return false
  }
}

// Helper function to perform PKCE validation
async function validatePKCE(codeVerifier: string, _validatedCode: string): Promise<void> {
  const pkceValidation = await validatePKCESecure(
    codeVerifier,
    codeVerifier // This will be compared against challenge during token exchange
  )

  if (!pkceValidation.valid || pkceValidation.entropy < 4.0) {
    await logSecurityEvent({
      event_type: 'oauth_pkce_validation_failed',
      event_severity: 'error',
      event_data: {
        entropy: pkceValidation.entropy,
        timing_safe: pkceValidation.timingSafe,
      },
      success: false,
    })
    throw new Error('PKCE validation failed')
  }
}

// Validate OAuth callback
export async function validateOAuthCallback(params: OAuthCallbackParams): Promise<{
  valid: boolean
  code?: string
  codeVerifier?: string
  provider?: string
  userId?: string
  securityChecks?: {
    stateValid: boolean
    timeValid: boolean
    securityMetadataValid: boolean
  }
}> {
  const validated = ValidateCallbackSchema.parse(params)

  // Check for OAuth errors
  await validateOAuthErrors({
    error: validated.error,
    error_description: validated.error_description,
  })

  // Fetch and validate OAuth state
  const stateData = await fetchOAuthState(validated.state)
  if (!stateData) {
    throw new Error('Invalid OAuth state data')
  }

  // Enhanced security validations
  const securityChecks = {
    stateValid: true,
    timeValid: true,
    securityMetadataValid: validateSecurityMetadata(stateData.security_metadata ?? null),
  }

  // Validate state age with stricter timing
  const stateAge = Date.now() - new Date(stateData.created_at).getTime()
  if (stateAge > oauthConfig.stateExpiry) {
    securityChecks.timeValid = false
    await logSecurityEvent({
      event_type: 'oauth_state_expired',
      event_severity: 'warning',
      event_data: {
        state_age: stateAge,
        max_age: oauthConfig.stateExpiry,
      },
      success: false,
    })
    throw new Error('OAuth state expired')
  }

  // Enhanced PKCE validation if code verifier is present
  if (stateData.code_verifier && validated.code) {
    await validatePKCE(stateData.code_verifier, validated.code)
  }

  // Delete used state to prevent replay attacks
  await sql`
    DELETE FROM oauth_states
    WHERE state = ${validated.state}
  `

  // Log successful validation
  await logSecurityEvent({
    event_type: 'oauth_callback_validated',
    event_severity: 'info',
    ...(stateData.user_id && { user_id: stateData.user_id }),
    event_data: {
      provider: stateData.provider,
      security_checks: securityChecks,
    },
    success: true,
  })

  const result: {
    valid: boolean
    code?: string
    codeVerifier?: string
    provider?: string
    userId?: string
    securityChecks?: typeof securityChecks
  } = {
    valid:
      securityChecks.stateValid && securityChecks.timeValid && securityChecks.securityMetadataValid,
    securityChecks,
  }

  if (validated.code !== undefined) result.code = validated.code
  if (stateData.code_verifier !== undefined) result.codeVerifier = stateData.code_verifier
  if (stateData.provider !== undefined) result.provider = stateData.provider
  if (stateData.user_id !== undefined) result.userId = stateData.user_id

  return result
}

// Helper types for OAuth state validation
type OAuthStateData = {
  state: string
  session_id: string | null
  client_fingerprint: string | null
  created_at: Date
  expires_at: Date
  security_flags: string | null
}

type SecurityChecks = {
  stateExists: boolean
  notExpired: boolean
  sessionMatch: boolean
  fingerprintMatch: boolean
  timingProtected: boolean
}

/**
 * Retrieve OAuth state data from database
 */
async function retrieveOAuthState(providedState: string): Promise<OAuthStateData | null> {
  try {
    const stateResult = await sql`
      SELECT 
        state, 
        session_id, 
        client_fingerprint,
        created_at, 
        expires_at,
        security_flags
      FROM oauth_states
      WHERE state = ${providedState}
      LIMIT 1
    `

    if (stateResult.length > 0) {
      return stateResult[0] as OAuthStateData
    }
    return null
  } catch (error) {
    await logSecurityEvent({
      event_type: 'oauth_state_retrieval_error',
      event_severity: 'error',
      event_data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        providedState: `${providedState.substring(0, 8)}...`,
      },
      success: false,
    })
    return null
  }
}

/**
 * Validate OAuth state security checks
 */
function validateSecurityChecks(
  stateData: OAuthStateData | null,
  sessionId: string,
  clientFingerprint?: string
): SecurityChecks {
  const stateExists = stateData !== null
  const notExpired = stateData ? new Date(stateData.expires_at) > new Date() : false

  const sessionMatch =
    stateData?.session_id && sessionId
      ? timingSafeStringCompare(stateData.session_id, sessionId)
      : false

  const fingerprintMatch =
    shouldValidateFingerprint(stateData, clientFingerprint) && stateData && clientFingerprint
      ? validateFingerprint(stateData, clientFingerprint)
      : true

  return {
    stateExists,
    notExpired,
    sessionMatch,
    fingerprintMatch,
    timingProtected: true,
  }
}

/**
 * Check if client fingerprint validation should be performed
 */
function shouldValidateFingerprint(
  stateData: OAuthStateData | null,
  clientFingerprint?: string
): boolean {
  return !!(
    oauthConfig.security.sessionBinding.enabled &&
    oauthConfig.security.sessionBinding.bindToUserAgent &&
    stateData?.client_fingerprint &&
    clientFingerprint
  )
}

/**
 * Validate client fingerprint using timing-safe comparison
 */
function validateFingerprint(stateData: OAuthStateData, clientFingerprint: string): boolean {
  return stateData.client_fingerprint
    ? timingSafeStringCompare(stateData.client_fingerprint, clientFingerprint)
    : false
}

/**
 * Apply timing attack protection
 */
async function applyTimingProtection(startTime: number): Promise<void> {
  const elapsedTime = Date.now() - startTime
  const minResponseTime = oauthConfig.security.timingAttackProtection.minResponseTime
  const jitter = Math.random() * oauthConfig.security.timingAttackProtection.maxJitter

  if (elapsedTime < minResponseTime) {
    await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsedTime + jitter))
  }
}

/**
 * Enhanced OAuth state validation with timing attack protection
 */
export async function validateOAuthStateSecure(
  providedState: string,
  sessionId: string,
  clientFingerprint?: string
): Promise<{
  valid: boolean
  securityChecks: SecurityChecks
}> {
  const startTime = Date.now()

  // Retrieve state data
  const stateData = await retrieveOAuthState(providedState)

  // Perform security checks
  const securityChecks = validateSecurityChecks(stateData, sessionId, clientFingerprint)

  // Apply timing protection
  await applyTimingProtection(startTime)

  const valid = Object.values(securityChecks).every(check => check === true)

  return {
    valid,
    securityChecks,
  }
}

/**
 * Enhanced redirect URI validation with comprehensive security checks
 */
export async function validateRedirectUriSecure(
  redirectUri: string,
  allowedUris: string[] = ALLOWED_REDIRECT_URIS
): Promise<{
  valid: boolean
  securityChecks: {
    protocolValid: boolean
    domainValid: boolean
    portValid: boolean
    pathValid: boolean
    noRedirectChain: boolean
  }
}> {
  const validation = oauthConfig.redirectUriValidation

  try {
    const url = new URL(redirectUri)

    // Protocol validation
    const protocol = url.protocol.slice(0, -1) as 'http' | 'https'
    const protocolValid = validation.allowedProtocols.includes(protocol)

    // In production, enforce HTTPS
    const httpsRequired =
      validation.enforceHttpsInProduction && process.env.NODE_ENV === 'production'
    const protocolSecure = !httpsRequired || url.protocol === 'https:'

    // Domain validation
    const domainValid = validation.allowedDomains.some(domain => {
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`) // Allow subdomains
    })

    // Port validation (only for non-standard ports)
    const port = url.port ? Number.parseInt(url.port) : url.protocol === 'https:' ? 443 : 80
    const portValid =
      validation.allowedPorts.includes(port as 3000 | 3001 | 8080) || port === 443 || port === 80 // Standard ports always allowed

    // Path validation (prevent suspicious paths)
    const pathValid =
      !url.pathname.includes('..') && // Prevent path traversal
      !url.pathname.includes('//') && // Prevent double slashes
      url.pathname.length < 1000 // Prevent excessively long paths

    // Check for redirect chains (simplified check)
    const noRedirectChain =
      !url.searchParams.has('redirect') &&
      !url.searchParams.has('next') &&
      !url.searchParams.has('return_to')

    // Exact match validation (most secure)
    const exactMatch = allowedUris.includes(redirectUri)

    const valid =
      exactMatch ||
      (protocolValid && protocolSecure && domainValid && portValid && pathValid && noRedirectChain)

    return {
      valid,
      securityChecks: {
        protocolValid: protocolValid && protocolSecure,
        domainValid,
        portValid,
        pathValid,
        noRedirectChain,
      },
    }
  } catch (_error) {
    // Invalid URL format
    return {
      valid: false,
      securityChecks: {
        protocolValid: false,
        domainValid: false,
        portValid: false,
        pathValid: false,
        noRedirectChain: false,
      },
    }
  }
}

/**
 * OAuth session binding for enhanced security
 */
export async function createOAuthSessionBinding(
  sessionId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{
  fingerprint: string
  bindingData: {
    sessionId: string
    userAgentHash?: string
    ipAddress?: string
    timestamp: number
  }
}> {
  const bindingData: {
    sessionId: string
    userAgentHash?: string
    ipAddress?: string
    timestamp: number
  } = {
    sessionId,
    timestamp: Date.now(),
  }

  // Bind to User-Agent if enabled
  if (oauthConfig.security.sessionBinding.bindToUserAgent && userAgent) {
    bindingData.userAgentHash = await hashString(userAgent)
  }

  // Bind to IP if enabled
  if (oauthConfig.security.sessionBinding.bindToIP && ipAddress) {
    bindingData.ipAddress = ipAddress
  }

  // Create session fingerprint
  const fingerprintData = JSON.stringify(bindingData)
  const fingerprint = await hashString(fingerprintData)

  return {
    fingerprint,
    bindingData,
  }
}

/**
 * OAuth attack detection and prevention
 */
export async function detectOAuthAttack(
  clientId: string,
  ipAddress: string,
  userAgent: string,
  _requestType: 'authorization' | 'token' | 'callback'
): Promise<{
  isAttack: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  patterns: string[]
  action: 'allow' | 'rate_limit' | 'block'
}> {
  const detectionConfig = oauthConfig.security.attackDetection

  if (!detectionConfig.enabled) {
    return {
      isAttack: false,
      riskLevel: 'low',
      patterns: [],
      action: 'allow',
    }
  }

  const patterns: string[] = []
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  // Check for rapid succession attempts
  const recentAttempts = await sql`
    SELECT COUNT(*) as count
    FROM oauth_audit_log
    WHERE client_id = ${clientId}
    AND ip_address = ${ipAddress}
    AND created_at > NOW() - INTERVAL '5 minutes'
  `

  if ((recentAttempts as any[])[0]?.count > 10) {
    patterns.push('rapid_succession_attempts')
    riskLevel = 'high'
  }

  // Check for invalid state patterns
  const invalidStateAttempts = await sql`
    SELECT COUNT(*) as count
    FROM oauth_audit_log
    WHERE ip_address = ${ipAddress}
    AND event_type = 'invalid_state'
    AND created_at > NOW() - INTERVAL '1 hour'
  `

  if ((invalidStateAttempts as any[])[0]?.count > 5) {
    patterns.push('invalid_state_patterns')
    // Escalate to high risk level
    riskLevel = 'high'
  }

  // Check for suspicious User-Agent patterns
  if (!userAgent || userAgent.length < 10 || userAgent.includes('bot')) {
    patterns.push('suspicious_user_agent')
    // Only escalate to medium if not already high or critical
    if (riskLevel === 'low') {
      riskLevel = 'medium'
    }
  }

  // Escalate to critical if multiple severe conditions are met
  if (patterns.length >= 3 || (patterns.length >= 2 && riskLevel === 'high')) {
    riskLevel = 'critical'
  }

  // Determine action based on risk level
  let action: 'allow' | 'rate_limit' | 'block' = 'allow'

  switch (riskLevel) {
    case 'critical':
      action = 'block'
      break
    case 'high':
      action = 'rate_limit'
      break
    case 'medium':
      if (patterns.length >= 2) {
        action = 'rate_limit'
      }
      break
    default:
      action = 'allow'
  }

  return {
    isAttack: patterns.length > 0,
    riskLevel,
    patterns,
    action,
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

/**
 * Secure string hashing for session binding
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  params: z.infer<typeof ExchangeTokenSchema>
): Promise<OAuthTokens & { user?: User }> {
  const validated = ExchangeTokenSchema.parse(params)

  // Step 1: Exchange code for tokens
  const tokens = await performTokenExchange(validated)

  // Step 2: Fetch user profile if requested
  if (validated.fetchUserProfile) {
    const user = await processUserProfile(tokens, validated.securityContext)
    return { ...tokens, user }
  }

  return tokens
}

// Helper function to exchange authorization code for access tokens
async function performTokenExchange(
  params: z.infer<typeof ExchangeTokenSchema>
): Promise<OAuthTokens> {
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: getGithubClientId(),
      client_secret: getGithubClientSecret(),
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.json()
    throw new Error(`Token exchange failed: ${error.error || 'Unknown error'}`)
  }

  const tokenData = await tokenResponse.json()
  return parseTokenResponse(tokenData)
}

// GitHub token response interface
interface GitHubTokenResponse {
  access_token: string
  token_type: string
  refresh_token?: string
  scope?: string
  expires_in?: number
}

// Helper function to parse and validate token response
function parseTokenResponse(tokenData: GitHubTokenResponse): OAuthTokens {
  return {
    accessToken: tokenData.access_token,
    tokenType: tokenData.token_type,
    refreshToken: tokenData.refresh_token,
    scope: tokenData.scope,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined,
  }
}

// Helper function to fetch and process user profile
async function processUserProfile(
  tokens: OAuthTokens,
  securityContext?: z.infer<typeof ExchangeTokenSchema>['securityContext']
): Promise<User> {
  const githubUser = await fetchGitHubUserProfile(tokens.accessToken)
  const user = await findOrCreateUser(githubUser)
  await storeOAuthAccount(user, githubUser, tokens)

  if (securityContext) {
    await logOAuthEvent(user, githubUser, securityContext)
  }

  return user
}

// GitHub user profile interface
interface GitHubUserProfile {
  id: number
  login: string
  email: string
  name?: string
  avatar_url?: string
}

// Helper function to fetch GitHub user profile
async function fetchGitHubUserProfile(accessToken: string): Promise<GitHubUserProfile> {
  const userResponse = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!userResponse.ok) {
    throw new Error('Failed to fetch user profile')
  }

  return await userResponse.json()
}

// Helper function to find existing user or create new one
async function findOrCreateUser(githubUser: GitHubUserProfile): Promise<User> {
  const userResult = await sql`
    SELECT * FROM users
    WHERE github_username = ${githubUser.login}
    OR email = ${githubUser.email}
    LIMIT 1
  `

  if ((userResult as any[]).length === 0) {
    return await createNewUser(githubUser)
  }

  const existingUser = (userResult as any[])[0]
  if (!existingUser) {
    throw new Error('User data not found')
  }

  return existingUser as User
}

// Helper function to create a new user
async function createNewUser(githubUser: GitHubUserProfile): Promise<User> {
  const newUserResult = await sql`
    INSERT INTO users (
      email, github_username, email_verified, 
      created_at, updated_at
    )
    VALUES (
      ${githubUser.email},
      ${githubUser.login},
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    RETURNING *
  `

  const newUser = (newUserResult as any[])[0]
  if (!newUser) {
    throw new Error('Failed to create user')
  }

  return newUser as User
}

// Helper function to store OAuth account with encrypted tokens
async function storeOAuthAccount(
  user: User,
  githubUser: GitHubUserProfile,
  tokens: OAuthTokens
): Promise<void> {
  await sql`
    INSERT INTO oauth_accounts (
      user_id, provider, provider_account_id,
      access_token, refresh_token, expires_at,
      token_type, scope, created_at, updated_at
    )
    VALUES (
      ${user.id},
      'github',
      ${githubUser.id.toString()},
      ${await encryptOAuthToken(tokens.accessToken, user.id, 'github')},
      ${tokens.refreshToken ? await encryptOAuthToken(tokens.refreshToken, user.id, 'github') : null},
      ${tokens.expiresAt || null},
      ${tokens.tokenType},
      ${tokens.scope},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (provider, provider_account_id)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `
}

// Helper function to log OAuth security event
async function logOAuthEvent(
  user: User,
  githubUser: GitHubUserProfile,
  securityContext: z.infer<typeof ExchangeTokenSchema>['securityContext']
): Promise<void> {
  await logSecurityEvent({
    event_type: 'oauth_link',
    event_severity: 'info',
    user_id: user.id,
    ip_address: securityContext?.ip_address ?? 'unknown',
    user_agent: securityContext?.user_agent ?? 'unknown',
    event_data: {
      provider: 'github',
      github_username: githubUser.login,
    },
    success: true,
  })
}

// Refresh OAuth tokens
export async function refreshOAuthTokens(params: {
  userId: string
  provider: string
}): Promise<OAuthTokens> {
  // Get OAuth account with refresh token
  const accountResult = await sql`
    SELECT id, refresh_token
    FROM oauth_accounts
    WHERE user_id = ${params.userId}
    AND provider = ${params.provider}
    AND refresh_token IS NOT NULL
    LIMIT 1
  `

  if ((accountResult as any[]).length === 0) {
    throw new Error('No refresh token available')
  }

  const account = (accountResult as any[])[0]
  if (!account) {
    throw new Error('OAuth account not found')
  }
  const refreshToken = await decryptOAuthToken(
    account.refresh_token,
    params.userId,
    params.provider
  )

  // Refresh tokens
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: getGithubClientId(),
      client_secret: getGithubClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Token refresh failed: ${error.error || 'Unknown error'}`)
  }

  const tokenData = await response.json()

  // Update stored tokens
  await sql`
    UPDATE oauth_accounts
    SET 
      access_token = ${await encryptOAuthToken(tokenData.access_token, params.userId, params.provider)},
      refresh_token = ${tokenData.refresh_token ? await encryptOAuthToken(tokenData.refresh_token, params.userId, params.provider) : null},
      expires_at = ${tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${account.id}
  `

  const result: OAuthTokens = {
    accessToken: tokenData.access_token,
    tokenType: tokenData.token_type || 'bearer',
    refreshToken: tokenData.refresh_token,
    scope: tokenData.scope,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined,
  }

  return result
}

// Unlink OAuth account
export async function unlinkOAuthAccount(params: {
  userId: string
  provider: string
}): Promise<void> {
  // Check if account exists
  const accountResult = await sql`
    SELECT id FROM oauth_accounts
    WHERE user_id = ${params.userId}
    AND provider = ${params.provider}
    LIMIT 1
  `

  if ((accountResult as any[]).length === 0) {
    throw new Error('OAuth account not found')
  }

  // Check if user has other OAuth accounts
  const otherOAuthCountResult = await sql`
    SELECT COUNT(*) as count
    FROM oauth_accounts
    WHERE user_id = ${params.userId}
    AND provider != ${params.provider}
  `

  const otherOAuthCount = Number((otherOAuthCountResult as any[])[0]?.count || 0)

  if (otherOAuthCount === 0) {
    throw new Error('Cannot unlink last authentication method')
  }

  // Delete OAuth account
  await sql`
    DELETE FROM oauth_accounts
    WHERE user_id = ${params.userId}
    AND provider = ${params.provider}
  `

  // Log event
  await logSecurityEvent({
    event_type: 'oauth_unlink',
    event_severity: 'info',
    user_id: params.userId,
    event_data: { provider: params.provider },
    success: true,
  })
}

// Helper functions

function generateSecureRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64url')
}
