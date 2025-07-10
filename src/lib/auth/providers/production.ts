/**
 * Production authentication providers
 *
 * SECURITY: These providers are configured for production use with proper
 * OAuth endpoints and environment variable configuration following NextAuth.js
 * best practices.
 */

import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import type { AuthOptions } from 'next-auth'
type Provider = AuthOptions['providers'][number]

/**
 * Get production-ready GitHub provider
 * Requires AUTH_GITHUB_ID and AUTH_GITHUB_SECRET environment variables
 */
function getGitHubProvider(): Provider | null {
  const clientId = process.env.AUTH_GITHUB_ID
  const clientSecret = process.env.AUTH_GITHUB_SECRET

  if (!clientId || !clientSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('GitHub OAuth credentials not configured for production')
    }
    return null
  }

  return GitHub({
    clientId,
    clientSecret,
    authorization: {
      params: {
        scope: 'read:user user:email',
      },
    },
  })
}

/**
 * Get production-ready Google provider
 * Requires AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET environment variables
 */
function getGoogleProvider(): Provider | null {
  const clientId = process.env.AUTH_GOOGLE_ID
  const clientSecret = process.env.AUTH_GOOGLE_SECRET

  if (!clientId || !clientSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Google OAuth credentials not configured for production')
    }
    return null
  }

  return Google({
    clientId,
    clientSecret,
    authorization: {
      params: {
        scope: 'openid email profile',
      },
    },
  })
}

/**
 * Get all configured production providers
 * Only returns providers that have valid environment variables
 */
export function getProductionProviders(): Provider[] {
  const providers: Provider[] = []

  // Only include providers that are properly configured
  const githubProvider = getGitHubProvider()
  if (githubProvider) {
    providers.push(githubProvider)
  }

  const googleProvider = getGoogleProvider()
  if (googleProvider) {
    providers.push(googleProvider)
  }

  // Log warning if no providers are configured in production
  if (providers.length === 0 && process.env.NODE_ENV === 'production') {
    console.warn('No production OAuth providers configured')
  }

  return providers
}

/**
 * Validate that required environment variables are set for production
 */
export function validateProductionConfig(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  const required = ['AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error(`Missing required environment variables for production: ${missing.join(', ')}`)
    return false
  }

  return true
}
