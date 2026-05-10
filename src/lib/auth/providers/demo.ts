/**
 * Demo authentication providers for development environment only
 *
 * SECURITY: These providers are strictly for development use and should never
 * be included in production builds. They use NextAuth.js provider factories with
 * demo credentials so local and E2E auth flows exercise the same URL generation
 * path as production without requiring real secrets.
 */

import type { AuthOptions } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

type Provider = AuthOptions['providers'][number]

/**
 * Demo GitHub provider that uses NextAuth's native GitHub OAuth configuration.
 */
export const GitHubDemoProvider: Provider = GitHub({
  clientId: process.env.GITHUB_CLIENT_ID || 'demo-github-client-id',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || 'demo-github-client-secret',
  authorization: {
    params: { scope: 'read:user user:email' },
  },
})

/**
 * Demo Google provider that uses NextAuth's native Google OAuth configuration.
 */
export const GoogleDemoProvider: Provider = Google({
  clientId: process.env.GOOGLE_CLIENT_ID || 'demo-google-client-id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'demo-google-client-secret',
  authorization: {
    params: { scope: 'openid email profile' },
  },
})

/**
 * Get all demo providers
 * Only available in development environment
 */
export function getDemoProviders(): Provider[] {
  if (process.env.NODE_ENV !== 'development') {
    return []
  }

  return [GitHubDemoProvider, GoogleDemoProvider]
}
