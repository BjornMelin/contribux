import { z } from 'zod'
import { oauthConfig } from '@/lib/config/oauth'
import { sql } from '@/lib/db/config'
import { env } from '@/lib/validation/env'
import type { OAuthCallbackParams, OAuthTokens, User } from '@/types/auth'
import { decryptOAuthToken, encryptOAuthToken } from './crypto'
import { generatePKCEChallenge } from './pkce'

// OAuth configuration
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_URL = 'https://api.github.com'

// Environment configuration with validation
const getGithubClientId = () => env.GITHUB_CLIENT_ID || 'test-client-id'
const getGithubClientSecret = () => env.GITHUB_CLIENT_SECRET || 'test-client-secret'
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

  // Validate redirect URI
  if (!ALLOWED_REDIRECT_URIS.includes(validated.redirectUri)) {
    throw new Error('Invalid redirect URI')
  }

  // Generate PKCE challenge
  const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

  // Generate state
  const state = generateSecureRandomString()

  // Store OAuth state
  await sql`
    INSERT INTO oauth_states (
      state, code_verifier, provider, redirect_uri, 
      user_id, created_at, expires_at
    )
    VALUES (
      ${state},
      ${codeVerifier},
      ${validated.provider},
      ${validated.redirectUri},
      ${validated.userId || null},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '${oauthConfig.stateExpiry / 1000} seconds'
    )
  `

  // Build authorization URL
  const url = new URL(GITHUB_AUTH_URL)
  url.searchParams.set('client_id', getGithubClientId())
  url.searchParams.set('redirect_uri', validated.redirectUri)
  url.searchParams.set('scope', validated.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  if (validated.allowSignup !== undefined) {
    url.searchParams.set('allow_signup', validated.allowSignup.toString())
  }

  return {
    url: url.toString(),
    state,
    codeVerifier,
  }
}

// Validate OAuth callback
export async function validateOAuthCallback(params: OAuthCallbackParams): Promise<{
  valid: boolean
  code?: string
  codeVerifier?: string
  provider?: string
  userId?: string
}> {
  const validated = ValidateCallbackSchema.parse(params)

  // Check for OAuth errors
  if (validated.error) {
    throw new Error(
      `OAuth error: ${validated.error} - ${validated.error_description || 'Unknown error'}`
    )
  }

  // Retrieve and validate state
  const stateResult = await sql`
    SELECT state, code_verifier, provider, redirect_uri, user_id, created_at
    FROM oauth_states
    WHERE state = ${validated.state}
    AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `

  if (stateResult.length === 0) {
    throw new Error('Invalid OAuth state')
  }

  const stateData = stateResult[0]
  if (!stateData) {
    throw new Error('Invalid OAuth state data')
  }

  // Check if state is expired
  const stateAge = Date.now() - new Date(stateData.created_at).getTime()
  if (stateAge > oauthConfig.stateExpiry) {
    throw new Error('OAuth state expired')
  }

  // Delete used state
  await sql`
    DELETE FROM oauth_states
    WHERE state = ${validated.state}
  `

  const result: {
    valid: boolean
    code?: string
    codeVerifier?: string
    provider?: string
    userId?: string
  } = {
    valid: true,
  }

  if (validated.code !== undefined) result.code = validated.code
  if (stateData.code_verifier !== undefined) result.codeVerifier = stateData.code_verifier
  if (stateData.provider !== undefined) result.provider = stateData.provider
  if (stateData.user_id !== undefined) result.userId = stateData.user_id

  return result
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

  if (userResult.length === 0) {
    return await createNewUser(githubUser)
  }

  const existingUser = userResult[0]
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

  const newUser = newUserResult[0]
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
    ip_address: securityContext?.ip_address ?? null,
    user_agent: securityContext?.user_agent ?? null,
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

  if (accountResult.length === 0) {
    throw new Error('No refresh token available')
  }

  const account = accountResult[0]
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

  if (accountResult.length === 0) {
    throw new Error('OAuth account not found')
  }

  // Check if user has other OAuth accounts
  const otherOAuthCountResult = await sql`
    SELECT COUNT(*) as count
    FROM oauth_accounts
    WHERE user_id = ${params.userId}
    AND provider != ${params.provider}
  `

  const otherOAuthCount = Number(otherOAuthCountResult[0]?.count || 0)

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

function generateSecureRandomString(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64url')
}

async function logSecurityEvent(event: {
  event_type: string
  event_severity: string
  user_id?: string
  ip_address?: string | null
  user_agent?: string | null
  event_data?: Record<string, unknown>
  success: boolean
  error_message?: string
}): Promise<void> {
  await sql`
    INSERT INTO security_audit_logs (
      event_type, event_severity, user_id, ip_address,
      user_agent, event_data, success, error_message, created_at
    )
    VALUES (
      ${event.event_type},
      ${event.event_severity},
      ${event.user_id || null},
      ${event.ip_address || null},
      ${event.user_agent || null},
      ${event.event_data || null},
      ${event.success},
      ${event.error_message || null},
      CURRENT_TIMESTAMP
    )
  `
}
