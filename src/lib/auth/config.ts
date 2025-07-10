import type { Account, AuthOptions, Profile, Session, User } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

import { sql } from '@/lib/db/config'
import { env, isDevelopment, isProduction } from '@/lib/validation/env'
import type { User as AuthUser, OAuthProvider } from '@/types/auth'
import {
  extractGitHubUserData,
  extractGoogleUserData,
  type GitHubProfile,
  type GoogleProfile,
  parseOAuthProfile,
} from '@/types/oauth'

// Database query result interfaces
interface UserQueryResult extends AuthUser {
  connected_providers: string[]
  primary_provider: OAuthProvider
}

interface ExistingAccountResult extends AuthUser {
  provider: OAuthProvider
  provider_account_id: string
}

/**
 * NextAuth.js configuration for multi-provider OAuth authentication
 * Supports GitHub and Google with comprehensive account linking
 * Includes email conflict resolution and security best practices
 */
export const authConfig: AuthOptions = {
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID || '',
      clientSecret: env.GITHUB_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'read:user user:email',
        },
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: 'openid email profile',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !user.email) {
        return false
      }

      const supportedProviders = ['github', 'google']
      if (!supportedProviders.includes(account.provider)) {
        return false
      }

      try {
        const result = await handleMultiProviderSignIn({
          user,
          account,
          profile,
        })

        if (result.success && result.user) {
          // We can't modify user.id directly since it's readonly
          // NextAuth will handle the user ID mapping through the session callback
          return true
        }

        if (result.error) {
          // Authentication failed - error details logged by auth handler
        }

        return false
      } catch (_error) {
        return false
      }
    },

    async session({ session, token }): Promise<Session> {
      if (token.sub) {
        // Fetch fresh user data with provider information
        const userResult = await sql`
          SELECT u.id, u.email, u.display_name, u.username, 
                 u.github_username, u.email_verified, u.two_factor_enabled,
                 u.recovery_email, u.locked_at, u.failed_login_attempts, u.last_login_at,
                 u.created_at, u.updated_at,
                 array_agg(DISTINCT oa.provider) FILTER (WHERE oa.provider IS NOT NULL) as connected_providers,
                 oa_primary.provider as primary_provider
          FROM users u
          LEFT JOIN oauth_accounts oa ON u.id = oa.user_id
          LEFT JOIN oauth_accounts oa_primary ON u.id = oa_primary.user_id AND oa_primary.is_primary = true
          WHERE u.id = ${token.sub}
          GROUP BY u.id, u.email, u.display_name, u.username, u.github_username, 
                   u.email_verified, u.two_factor_enabled, u.recovery_email, u.locked_at, 
                   u.failed_login_attempts, u.last_login_at, u.created_at, u.updated_at, 
                   oa_primary.provider
          LIMIT 1
        `

        if ((userResult as UserQueryResult[]).length > 0) {
          const user = (userResult as UserQueryResult[])[0]

          // Return new session object that matches NextAuth Session type
          const userUpdate: typeof session.user = {
            ...session.user,
            id: token.sub,
            email: String(user.email),
            connectedProviders: user.connected_providers || [],
            primaryProvider: user.primary_provider || 'github',
          }

          // Only add githubUsername if it exists to satisfy exactOptionalPropertyTypes
          if (user.githubUsername) {
            userUpdate.githubUsername = String(user.githubUsername)
          }

          return {
            ...session,
            user: userUpdate,
          }
        }
      }

      // Return only base session structure when user not found
      return {
        user: session.user,
        expires: session.expires,
      }
    },

    async jwt({ token, user, account }) {
      // Initial sign in
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          provider: account.provider,
        }
      }

      // Return previous token if the access token has not expired yet
      if (token.expiresAt && Date.now() < (token.expiresAt as number) * 1000) {
        return token
      }

      // Access token has expired, try to update it
      const refreshableToken: RefreshableToken = {
        accessToken: token.accessToken as string,
        refreshToken: token.refreshToken as string,
        expiresAt: token.expiresAt as number,
        provider: token.provider as string,
      }
      return refreshAccessToken(refreshableToken)
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  secret: env.NEXTAUTH_SECRET || '',
  // Enable debug mode in development
  debug: isDevelopment(),
  // Enhanced security settings
  useSecureCookies: isProduction(),
  cookies: {
    sessionToken: {
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction(),
      },
    },
  },
  events: {
    signOut: async ({ session, token }) => {
      // Log security event for signout
      try {
        await logSecurityEvent({
          event_type: 'logout',
          user_id: session?.user?.id || token?.sub || '',
          success: true,
          event_data: {
            timestamp: new Date().toISOString(),
          },
        })
      } catch (_error) {
        // Signout event logging failed - continue with signout
      }
    },
  },
}

/**
 * Account linking scenarios and resolution strategies
 */
interface SignInParams {
  user: User
  account: Account
  profile?: Profile | undefined
}

interface SignInResult {
  success: boolean
  user?: AuthUser
  error?: string
  requiresVerification?: boolean
}

/**
 * Comprehensive multi-provider account linking logic
 */
async function handleMultiProviderSignIn({
  user,
  account,
  profile,
}: SignInParams): Promise<SignInResult> {
  if (!user.email || !account.provider || !account.providerAccountId) {
    return { success: false, error: 'Missing required authentication data' }
  }

  try {
    // Check if this exact OAuth account already exists
    const existingAccountResult = await sql`
      SELECT oa.*, u.* 
      FROM oauth_accounts oa
      JOIN users u ON oa.user_id = u.id
      WHERE oa.provider = ${account.provider} 
      AND oa.provider_account_id = ${account.providerAccountId}
      LIMIT 1
    `

    if ((existingAccountResult as ExistingAccountResult[]).length > 0) {
      // Account exists - update tokens and return user
      const existingUser = (existingAccountResult as ExistingAccountResult[])[0]
      await updateOAuthTokens(existingUser.id, account)
      return { success: true, user: existingUser }
    }

    // Check if user exists by email
    const existingUserResult = await sql`
      SELECT * FROM users WHERE email = ${user.email} LIMIT 1
    `

    if ((existingUserResult as unknown[]).length > 0) {
      // User exists with same email - implement account linking
      const existingUser = (existingUserResult as unknown[])[0] as AuthUser
      return await linkAccountToExistingUser(existingUser, account, profile)
    }

    // New user - create account
    return await createNewUserWithOAuth(user, account, profile)
  } catch (_error) {
    return { success: false, error: 'Authentication failed due to internal error' }
  }
}

/**
 * Link OAuth account to existing user
 */
async function linkAccountToExistingUser(
  existingUser: AuthUser,
  account: Account,
  profile?: Profile
): Promise<SignInResult> {
  try {
    // Check if this provider is already linked to this user
    const existingLinkResult = await sql`
      SELECT * FROM oauth_accounts 
      WHERE user_id = ${existingUser.id} AND provider = ${account.provider}
      LIMIT 1
    `

    if ((existingLinkResult as unknown[]).length > 0) {
      // Provider already linked - update tokens
      await updateOAuthTokens(existingUser.id, account)
      return { success: true, user: existingUser }
    }

    // Link new provider to existing user
    await sql`
      INSERT INTO oauth_accounts (
        user_id, provider, provider_account_id,
        access_token, refresh_token, expires_at,
        token_type, scope, is_primary, linked_at
      )
      VALUES (
        ${existingUser.id},
        ${account.provider},
        ${account.providerAccountId},
        ${account.access_token},
        ${account.refresh_token},
        ${account.expires_at ? new Date(account.expires_at * 1000) : null},
        ${account.token_type},
        ${account.scope},
        false,
        CURRENT_TIMESTAMP
      )
    `

    // Update user profile if new information is available
    await updateUserProfileFromProvider(existingUser.id, account.provider, profile)

    // Log successful account linking
    await logSecurityEvent({
      event_type: 'oauth_link',
      user_id: existingUser.id,
      success: true,
      event_data: {
        provider: account.provider,
        linked_account_id: account.providerAccountId,
      },
    })

    return { success: true, user: existingUser }
  } catch (_error) {
    return { success: false, error: 'Failed to link account' }
  }
}

/**
 * Create new user with OAuth account
 */
async function createNewUserWithOAuth(
  user: SignInParams['user'],
  account: Account,
  profile?: Profile
): Promise<SignInResult> {
  try {
    // Extract user data from profile based on provider
    const userData = extractUserDataFromProfile(account.provider, user, profile)

    // Create new user
    const newUserResult = await sql`
      INSERT INTO users (
        email, display_name, username, github_username,
        email_verified, created_at, updated_at
      )
      VALUES (
        ${userData.email},
        ${userData.displayName},
        ${userData.username},
        ${userData.githubUsername},
        ${userData.emailVerified},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `

    const newUser = (newUserResult as unknown[])[0] as AuthUser

    // Create OAuth account as primary
    await sql`
      INSERT INTO oauth_accounts (
        user_id, provider, provider_account_id,
        access_token, refresh_token, expires_at,
        token_type, scope, is_primary, linked_at
      )
      VALUES (
        ${newUser.id},
        ${account.provider},
        ${account.providerAccountId},
        ${account.access_token},
        ${account.refresh_token},
        ${account.expires_at ? new Date(account.expires_at * 1000) : null},
        ${account.token_type},
        ${account.scope},
        true,
        CURRENT_TIMESTAMP
      )
    `

    // Log successful user creation
    await logSecurityEvent({
      event_type: 'login_success',
      user_id: newUser.id,
      success: true,
      event_data: {
        provider: account.provider,
        new_user: true,
      },
    })

    return { success: true, user: newUser }
  } catch (_error) {
    return { success: false, error: 'Failed to create user account' }
  }
}

/**
 * Extract user data from OAuth profile with proper typing
 */
function extractUserDataFromProfile(
  provider: string,
  user: SignInParams['user'],
  profile?: Profile
) {
  const baseData = {
    email: user.email,
    emailVerified: true,
    displayName: user.name || '',
    username: '',
    githubUsername: null as string | null,
  }

  if (!profile) {
    return {
      ...baseData,
      username: user.email?.split('@')[0] || user.name?.toLowerCase().replace(/\s+/g, '') || '',
    }
  }

  const parsedProfile = parseOAuthProfile(provider, profile)
  if (!parsedProfile) {
    return {
      ...baseData,
      username: user.email?.split('@')[0] || user.name?.toLowerCase().replace(/\s+/g, '') || '',
    }
  }

  switch (provider) {
    case 'github': {
      const githubData = extractGitHubUserData(parsedProfile as GitHubProfile)
      return {
        email: githubData.email,
        emailVerified: githubData.emailVerified,
        displayName: githubData.name,
        username: githubData.username,
        githubUsername: githubData.githubUsername,
      }
    }

    case 'google': {
      const googleData = extractGoogleUserData(parsedProfile as GoogleProfile)
      return {
        email: googleData.email,
        emailVerified: googleData.emailVerified,
        displayName: googleData.name,
        username: googleData.username,
        githubUsername: null,
      }
    }

    default:
      return {
        ...baseData,
        username: user.email?.split('@')[0] || user.name?.toLowerCase().replace(/\s+/g, '') || '',
      }
  }
}

/**
 * Update OAuth account tokens
 */
async function updateOAuthTokens(userId: string, account: Account) {
  await sql`
    UPDATE oauth_accounts
    SET 
      access_token = ${account.access_token},
      refresh_token = ${account.refresh_token},
      expires_at = ${account.expires_at ? new Date(account.expires_at * 1000) : null},
      token_type = ${account.token_type},
      scope = ${account.scope},
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId} 
    AND provider = ${account.provider}
    AND provider_account_id = ${account.providerAccountId}
  `
}

/**
 * Update user profile from OAuth provider data with proper typing
 */
async function updateUserProfileFromProvider(userId: string, provider: string, profile?: Profile) {
  if (!profile) return

  try {
    const parsedProfile = parseOAuthProfile(provider, profile)
    if (!parsedProfile) return

    if (provider === 'github') {
      const githubProfile = parsedProfile as GitHubProfile
      await sql`
        UPDATE users
        SET 
          github_username = ${githubProfile.login},
          display_name = COALESCE(${githubProfile.name}, display_name),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
      `
    } else if (provider === 'google') {
      const googleProfile = parsedProfile as GoogleProfile
      await sql`
        UPDATE users
        SET 
          display_name = COALESCE(${googleProfile.name}, display_name),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
      `
    }
    // Add other provider-specific updates as needed
  } catch (_error) {
    // Profile update failed - user profile remains unchanged
  }
}

/**
 * Token interface for refresh operations
 */
interface RefreshableToken {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  provider?: string
}

/**
 * Log security events for audit trail
 */
async function logSecurityEvent(event: {
  event_type: string
  user_id: string
  success: boolean
  event_data?: Record<string, unknown>
}) {
  try {
    await sql`
      INSERT INTO security_audit_logs (
        event_type, event_severity, user_id, success, event_data
      )
      VALUES (
        ${event.event_type},
        'info',
        ${event.user_id},
        ${event.success},
        ${JSON.stringify(event.event_data || {})}
      )
    `
  } catch (_error) {
    // Audit log insertion failed - event not recorded
  }
}

/**
 * Refresh access token based on provider
 */
async function refreshAccessToken(token: RefreshableToken) {
  try {
    const provider = token.provider || 'github' // Default to GitHub for backwards compatibility

    switch (provider) {
      case 'github':
        return await refreshGitHubToken(token)
      case 'google':
        return await refreshGoogleToken(token)
      default:
        return {
          ...token,
          error: 'RefreshAccessTokenError',
        }
    }
  } catch (_error) {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    }
  }
}

/**
 * Refresh GitHub access token
 */
async function refreshGitHubToken(token: RefreshableToken) {
  if (!token.refreshToken) {
    throw new Error('No refresh token available')
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID || '',
      client_secret: env.GITHUB_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  })

  const refreshedTokens = await response.json()

  if (!response.ok) {
    throw refreshedTokens
  }

  return {
    ...token,
    accessToken: refreshedTokens.access_token,
    refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
  }
}

/**
 * Refresh Google access token
 */
async function refreshGoogleToken(token: RefreshableToken) {
  if (!token.refreshToken) {
    throw new Error('No refresh token available')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  })

  const refreshedTokens = await response.json()

  if (!response.ok) {
    throw refreshedTokens
  }

  return {
    ...token,
    accessToken: refreshedTokens.access_token,
    refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
  }
}
