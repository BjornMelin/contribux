/**
 * Demo authentication providers for development environment only
 * 
 * SECURITY: These providers are strictly for development use and should never
 * be included in production builds. They use mock OAuth endpoints and simulate
 * authentication flows without actual OAuth verification.
 */

import type { AuthOptions } from 'next-auth'
type Provider = AuthOptions['providers'][number]

/**
 * Demo GitHub provider that simulates OAuth flow
 * Uses mock endpoints and predefined user data
 */
export const GitHubDemoProvider: Provider = {
  id: 'github',
  name: 'GitHub',
  type: 'oauth' as const,
  // Mock OAuth endpoints - these don't perform actual OAuth
  authorization: { 
    url: 'javascript:void(0)', 
    params: { scope: 'read:user user:email' } 
  },
  token: 'javascript:void(0)',
  userinfo: 'javascript:void(0)',
  clientId: 'demo-github-client-id',
  clientSecret: 'demo-github-client-secret',
  profile(_profile: Record<string, unknown>) {
    return {
      id: 'demo-github-123',
      name: 'Demo GitHub User',
      email: 'demo@github.com',
      image: 'https://github.com/github.png',
      emailVerified: new Date(),
    }
  },
}

/**
 * Demo Google provider that simulates OAuth flow
 * Uses mock endpoints and predefined user data
 */
export const GoogleDemoProvider: Provider = {
  id: 'google',
  name: 'Google',
  type: 'oauth' as const,
  // Mock OAuth endpoints - these don't perform actual OAuth
  authorization: { 
    url: 'javascript:void(0)', 
    params: { scope: 'openid email profile' } 
  },
  token: 'javascript:void(0)',
  userinfo: 'javascript:void(0)',
  clientId: 'demo-google-client-id',
  clientSecret: 'demo-google-client-secret',
  profile(_profile: Record<string, unknown>) {
    return {
      id: 'demo-google-456',
      name: 'Demo Google User',
      email: 'demo@google.com',
      image: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
      emailVerified: new Date(),
    }
  },
}

/**
 * Get all demo providers
 * Only available in development environment
 */
export function getDemoProviders(): Provider[] {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('Demo providers requested in non-development environment')
    return []
  }
  
  return [GitHubDemoProvider, GoogleDemoProvider]
}