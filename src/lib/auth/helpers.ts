/**
 * Multi-provider auth helper functions with backward compatibility
 */

import { auth } from '@/lib/auth'
import { sql } from '@/lib/db/config'
import type { User } from '@/types/auth'
import { headers } from 'next/headers'
import { z } from 'zod'

// Validation schemas for helper functions
const HasOAuthScopeSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  scope: z.string().min(1, 'Scope cannot be empty'),
  provider: z.string().min(1, 'Provider cannot be empty').default('github'),
})

const GetOAuthAccessTokenSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const GetUserProvidersSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
})

const GetPrimaryProviderSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
})

const LinkOAuthAccountSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
  tokens: z.object({
    provider_account_id: z.string().min(1, 'Provider account ID cannot be empty'),
    access_token: z.string().min(1, 'Access token cannot be empty'),
    refresh_token: z.string().optional(),
    expires_at: z.date().optional(),
    token_type: z.string().optional(),
    scope: z.string().optional(),
  }),
})

const UnlinkOAuthAccountSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const SetPrimaryProviderSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const CanUnlinkProviderSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const LogSecurityEventSchema = z.object({
  event: z.object({
    event_type: z.string().min(1, 'Event type cannot be empty'),
    event_severity: z.enum(['info', 'warning', 'error', 'critical']),
    user_id: z.string().uuid('User ID must be a valid UUID').optional(),
    event_data: z.record(z.unknown()).optional(),
    success: z.boolean(),
    error_message: z.string().optional(),
  }),
})

/**
 * Get the current authenticated user from the session
 * Provider-agnostic - works with any linked OAuth provider
 * Use this in Server Components
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth()

  if (!session?.user?.id) {
    return null
  }

  try {
    const userResult = await sql`
      SELECT * FROM users
      WHERE id = ${session.user.id}
      LIMIT 1
    `

    if ((userResult as any[]).length === 0) {
      return null
    }

    return (userResult as any[])[0] as User
  } catch (_error) {
    return null
  }
}

/**
 * Require authentication for a page or API route
 * Throws an error if user is not authenticated
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

/**
 * Check if user has specific OAuth scope for a provider
 */
export async function hasOAuthScope(
  userId: string,
  scope: string,
  provider = 'github'
): Promise<boolean> {
  try {
    // Validate input parameters
    const validated = HasOAuthScopeSchema.parse({ userId, scope, provider })

    const result = await sql`
      SELECT scope FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND provider = ${validated.provider}
      LIMIT 1
    `

    if ((result as any[]).length === 0) {
      return false
    }

    const scopes = (result as any[])[0]?.scope?.split(' ') || []
    return scopes.includes(validated.scope)
  } catch (_error) {
    return false
  }
}

/**
 * Get OAuth access token for a specific provider
 * Replaces provider-specific token functions
 */
export async function getOAuthAccessToken(
  userId: string,
  provider: string
): Promise<string | null> {
  try {
    // Validate input parameters
    const validated = GetOAuthAccessTokenSchema.parse({ userId, provider })

    const result = await sql`
      SELECT access_token FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND provider = ${validated.provider}
      LIMIT 1
    `

    if ((result as any[]).length === 0) {
      return null
    }

    return (result as any[])[0]?.access_token
  } catch (_error) {
    return null
  }
}

/**
 * Get GitHub access token for the current user
 * @deprecated Use getOAuthAccessToken(userId, 'github') instead
 */
export async function getGitHubAccessToken(userId: string): Promise<string | null> {
  return getOAuthAccessToken(userId, 'github')
}

/**
 * Get all linked OAuth providers for a user
 */
export async function getUserProviders(userId: string): Promise<string[]> {
  try {
    // Validate input parameter
    const validated = GetUserProvidersSchema.parse({ userId })

    const result = await sql`
      SELECT DISTINCT provider FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      ORDER BY provider
    `

    return (result as any[]).map((row: any) => row.provider)
  } catch (_error) {
    return []
  }
}

/**
 * Get the primary OAuth provider for a user
 * Uses is_primary column or falls back to the first linked provider
 */
export async function getPrimaryProvider(userId: string): Promise<string | null> {
  try {
    // Validate input parameter
    const validated = GetPrimaryProviderSchema.parse({ userId })

    // Try to find explicitly marked primary provider
    const primaryResult = await sql`
      SELECT provider FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND is_primary = true
      LIMIT 1
    `

    if ((primaryResult as any[]).length > 0) {
      return (primaryResult as any[])[0]?.provider
    }

    // Fall back to the first linked provider (by creation date)
    const fallbackResult = await sql`
      SELECT provider FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      ORDER BY created_at ASC
      LIMIT 1
    `

    return (fallbackResult as any[]).length > 0 ? (fallbackResult as any[])[0]?.provider : null
  } catch (_error) {
    return null
  }
}

/**
 * Link OAuth account to a user
 */
export async function linkOAuthAccount(
  userId: string,
  provider: string,
  tokens: {
    provider_account_id: string
    access_token: string
    refresh_token?: string
    expires_at?: Date
    token_type?: string
    scope?: string
  }
): Promise<void> {
  try {
    // Validate input parameters
    const validated = LinkOAuthAccountSchema.parse({ userId, provider, tokens })

    await sql`
      INSERT INTO oauth_accounts (
        user_id, provider, provider_account_id,
        access_token, refresh_token, expires_at,
        token_type, scope, is_primary, created_at, updated_at
      )
      VALUES (
        ${validated.userId},
        ${validated.provider},
        ${validated.tokens.provider_account_id},
        ${validated.tokens.access_token},
        ${validated.tokens.refresh_token || null},
        ${validated.tokens.expires_at || null},
        ${validated.tokens.token_type || 'bearer'},
        ${validated.tokens.scope || null},
        false, -- New accounts are not primary by default
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (provider, provider_account_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        updated_at = CURRENT_TIMESTAMP
    `

    // Log the account linking event
    await logSecurityEvent({
      event_type: 'oauth_link',
      event_severity: 'info',
      user_id: validated.userId,
      event_data: {
        provider: validated.provider,
        provider_account_id: validated.tokens.provider_account_id,
      },
      success: true,
    })
  } catch (_error) {
    throw new Error(`Failed to link ${provider} account`)
  }
}

/**
 * Unlink OAuth account from a user
 */
export async function unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
  // Validate input parameters
  const validated = UnlinkOAuthAccountSchema.parse({ userId, provider })

  // Check if this is the only provider
  const canUnlink = await canUnlinkProvider(validated.userId, validated.provider)
  if (!canUnlink) {
    throw new Error('Cannot unlink the only authentication method')
  }

  const result = await sql`
      DELETE FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND provider = ${validated.provider}
      RETURNING provider_account_id
    `

  if ((result as any[]).length === 0) {
    throw new Error('OAuth account not found')
  }

  // Log the account unlinking event
  await logSecurityEvent({
    event_type: 'oauth_unlink',
    event_severity: 'info',
    user_id: validated.userId,
    event_data: {
      provider: validated.provider,
      provider_account_id: (result as any[])[0]?.provider_account_id,
    },
    success: true,
  })
}

/**
 * Set primary OAuth provider for a user
 */
export async function setPrimaryProvider(userId: string, provider: string): Promise<void> {
  try {
    // Validate input parameters
    const validated = SetPrimaryProviderSchema.parse({ userId, provider })

    // Verify the user has this provider linked
    const providerExists = await sql`
      SELECT id FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND provider = ${validated.provider}
      LIMIT 1
    `

    if ((providerExists as any[]).length === 0) {
      throw new Error(`${validated.provider} account not linked to user`)
    }
    // Unset current primary
    await sql`
        UPDATE oauth_accounts
        SET is_primary = false
        WHERE user_id = ${validated.userId}
      `

    // Set new primary
    await sql`
        UPDATE oauth_accounts
        SET is_primary = true
        WHERE user_id = ${validated.userId}
        AND provider = ${validated.provider}
      `

    // Log the primary provider change
    await logSecurityEvent({
      event_type: 'config_change',
      event_severity: 'info',
      user_id: validated.userId,
      event_data: { action: 'set_primary_provider', provider: validated.provider },
      success: true,
    })
  } catch (_error) {
    throw new Error(`Failed to set ${provider} as primary provider`)
  }
}

/**
 * Check if a provider can be unlinked (user has other auth methods)
 */
export async function canUnlinkProvider(userId: string, provider: string): Promise<boolean> {
  try {
    // Validate input parameters
    const validated = CanUnlinkProviderSchema.parse({ userId, provider })

    const otherProvidersResult = await sql`
      SELECT COUNT(*) as count
      FROM oauth_accounts
      WHERE user_id = ${validated.userId}
      AND provider != ${validated.provider}
    `

    const otherProvidersCount = Number((otherProvidersResult as any[])[0]?.count || 0)
    return otherProvidersCount > 0
  } catch (_error) {
    return false
  }
}

/**
 * Log security event for audit trail
 */
export async function logSecurityEvent(event: {
  event_type: string
  event_severity: 'info' | 'warning' | 'error' | 'critical'
  user_id?: string
  event_data?: Record<string, unknown>
  success: boolean
  error_message?: string
}): Promise<void> {
  try {
    // Validate input parameters
    const validated = LogSecurityEventSchema.parse({ event })

    const headersList = await headers()
    const ip_address = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || null
    const user_agent = headersList.get('user-agent') || null

    await sql`
      INSERT INTO security_audit_logs (
        event_type, event_severity, user_id, ip_address,
        user_agent, event_data, success, error_message, created_at
      )
      VALUES (
        ${validated.event.event_type},
        ${validated.event.event_severity},
        ${validated.event.user_id || null},
        ${ip_address},
        ${user_agent},
        ${validated.event.event_data || null},
        ${validated.event.success},
        ${validated.event.error_message || null},
        CURRENT_TIMESTAMP
      )
    `
  } catch (_error) {
    // Security audit log insertion failed - event not recorded
  }
}
