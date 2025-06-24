/**
 * Multi-provider auth helper functions with backward compatibility
 */

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db/config'
import type { User } from '@/types/auth'

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

    if (userResult.length === 0) {
      return null
    }

    return userResult[0] as User
  } catch (error) {
    console.error('Failed to get current user:', error)
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
    const result = await sql`
      SELECT scope FROM oauth_accounts
      WHERE user_id = ${userId}
      AND provider = ${provider}
      LIMIT 1
    `

    if (result.length === 0) {
      return false
    }

    const scopes = result[0].scope?.split(' ') || []
    return scopes.includes(scope)
  } catch (error) {
    console.error('Failed to check OAuth scope:', error)
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
    const result = await sql`
      SELECT access_token FROM oauth_accounts
      WHERE user_id = ${userId}
      AND provider = ${provider}
      LIMIT 1
    `

    if (result.length === 0) {
      return null
    }

    return result[0].access_token
  } catch (error) {
    console.error(`Failed to get ${provider} access token:`, error)
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
    const result = await sql`
      SELECT DISTINCT provider FROM oauth_accounts
      WHERE user_id = ${userId}
      ORDER BY provider
    `

    return result.map(row => row.provider)
  } catch (error) {
    console.error('Failed to get user providers:', error)
    return []
  }
}

/**
 * Get the primary OAuth provider for a user
 * Uses is_primary column or falls back to the first linked provider
 */
export async function getPrimaryProvider(userId: string): Promise<string | null> {
  try {
    // Try to find explicitly marked primary provider
    const primaryResult = await sql`
      SELECT provider FROM oauth_accounts
      WHERE user_id = ${userId}
      AND is_primary = true
      LIMIT 1
    `

    if (primaryResult.length > 0) {
      return primaryResult[0].provider
    }

    // Fall back to the first linked provider (by creation date)
    const fallbackResult = await sql`
      SELECT provider FROM oauth_accounts
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT 1
    `

    return fallbackResult.length > 0 ? fallbackResult[0].provider : null
  } catch (error) {
    console.error('Failed to get primary provider:', error)
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
    await sql`
      INSERT INTO oauth_accounts (
        user_id, provider, provider_account_id,
        access_token, refresh_token, expires_at,
        token_type, scope, is_primary, created_at, updated_at
      )
      VALUES (
        ${userId},
        ${provider},
        ${tokens.provider_account_id},
        ${tokens.access_token},
        ${tokens.refresh_token || null},
        ${tokens.expires_at || null},
        ${tokens.token_type || 'bearer'},
        ${tokens.scope || null},
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
      user_id: userId,
      event_data: { provider, provider_account_id: tokens.provider_account_id },
      success: true,
    })
  } catch (error) {
    console.error('Failed to link OAuth account:', error)
    throw new Error(`Failed to link ${provider} account`)
  }
}

/**
 * Unlink OAuth account from a user
 */
export async function unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
  try {
    // Check if this is the only provider
    const canUnlink = await canUnlinkProvider(userId, provider)
    if (!canUnlink) {
      throw new Error('Cannot unlink the only authentication method')
    }

    const result = await sql`
      DELETE FROM oauth_accounts
      WHERE user_id = ${userId}
      AND provider = ${provider}
      RETURNING provider_account_id
    `

    if (result.length === 0) {
      throw new Error('OAuth account not found')
    }

    // Log the account unlinking event
    await logSecurityEvent({
      event_type: 'oauth_unlink',
      event_severity: 'info',
      user_id: userId,
      event_data: { provider, provider_account_id: result[0].provider_account_id },
      success: true,
    })
  } catch (error) {
    console.error('Failed to unlink OAuth account:', error)
    throw error
  }
}

/**
 * Set primary OAuth provider for a user
 */
export async function setPrimaryProvider(userId: string, provider: string): Promise<void> {
  try {
    // Verify the user has this provider linked
    const providerExists = await sql`
      SELECT id FROM oauth_accounts
      WHERE user_id = ${userId}
      AND provider = ${provider}
      LIMIT 1
    `

    if (providerExists.length === 0) {
      throw new Error(`${provider} account not linked to user`)
    }

    // Use transaction to ensure consistency
    await sql.begin(async sql => {
      // Unset current primary
      await sql`
        UPDATE oauth_accounts
        SET is_primary = false
        WHERE user_id = ${userId}
      `

      // Set new primary
      await sql`
        UPDATE oauth_accounts
        SET is_primary = true
        WHERE user_id = ${userId}
        AND provider = ${provider}
      `
    })

    // Log the primary provider change
    await logSecurityEvent({
      event_type: 'config_change',
      event_severity: 'info',
      user_id: userId,
      event_data: { action: 'set_primary_provider', provider },
      success: true,
    })
  } catch (error) {
    console.error('Failed to set primary provider:', error)
    throw new Error(`Failed to set ${provider} as primary provider`)
  }
}

/**
 * Check if a provider can be unlinked (user has other auth methods)
 */
export async function canUnlinkProvider(userId: string, provider: string): Promise<boolean> {
  try {
    const otherProvidersResult = await sql`
      SELECT COUNT(*) as count
      FROM oauth_accounts
      WHERE user_id = ${userId}
      AND provider != ${provider}
    `

    const otherProvidersCount = Number(otherProvidersResult[0]?.count || 0)
    return otherProvidersCount > 0
  } catch (error) {
    console.error('Failed to check if provider can be unlinked:', error)
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
    const headersList = await headers()
    const ip_address = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || null
    const user_agent = headersList.get('user-agent') || null

    await sql`
      INSERT INTO security_audit_logs (
        event_type, event_severity, user_id, ip_address,
        user_agent, event_data, success, error_message, created_at
      )
      VALUES (
        ${event.event_type},
        ${event.event_severity},
        ${event.user_id || null},
        ${ip_address},
        ${user_agent},
        ${event.event_data || null},
        ${event.success},
        ${event.error_message || null},
        CURRENT_TIMESTAMP
      )
    `
  } catch (error) {
    console.error('Failed to log security event:', error)
  }
}
