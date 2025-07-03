/**
 * Simplified NextAuth.js configuration for development testing
 * This version works without database connectivity or OAuth credentials
 */

import NextAuth, { type AuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

// Create demo GitHub provider for development testing
const GitHubDemoProvider = {
  id: 'github',
  name: 'GitHub',
  type: 'oauth' as const,
  // Mock OAuth endpoints that will work for development
  authorization: { url: 'javascript:void(0)', params: { scope: 'read:user user:email' } },
  token: 'javascript:void(0)',
  userinfo: 'javascript:void(0)',
  clientId: 'demo-github-client-id',
  clientSecret: 'demo-github-client-secret',
  profile(profile: any) {
    return {
      id: 'demo-github-123',
      name: 'Demo GitHub User',
      email: 'demo@github.com',
      image: 'https://github.com/github.png',
    }
  },
}

// Create demo Google provider for development testing
const GoogleDemoProvider = {
  id: 'google',
  name: 'Google',
  type: 'oauth' as const,
  // Mock OAuth endpoints that will work for development
  authorization: { url: 'javascript:void(0)', params: { scope: 'openid email profile' } },
  token: 'javascript:void(0)',
  userinfo: 'javascript:void(0)',
  clientId: 'demo-google-client-id',
  clientSecret: 'demo-google-client-secret',
  profile(profile: any) {
    return {
      id: 'demo-google-456',
      name: 'Demo Google User',
      email: 'demo@google.com',
      image: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    }
  },
}

const authConfig: AuthOptions = {
  providers: [
    // In development, use demo providers that simulate GitHub and Google
    ...(process.env.NODE_ENV === 'development' ? [GitHubDemoProvider, GoogleDemoProvider] : []),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, account, profile, user }) {
      // In development, simulate successful OAuth flow
      if (process.env.NODE_ENV === 'development' && account) {
        // Create demo user data based on provider
        const demoUser = account.provider === 'github' 
          ? {
              id: 'demo-github-123',
              name: 'Demo GitHub User',
              email: 'demo@github.com',
              image: 'https://github.com/github.png',
            }
          : {
              id: 'demo-google-456', 
              name: 'Demo Google User',
              email: 'demo@google.com',
              image: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
            }

        token.sub = demoUser.id
        token.name = demoUser.name
        token.email = demoUser.email
        token.picture = demoUser.image
        token.accessToken = 'demo-access-token'
        token.provider = account.provider
      }
      return token
    },

    async session({ session, token }) {
      // Create session from token
      if (token.sub) {
        session.user = {
          id: token.sub,
          name: token.name || 'Demo User',
          email: token.email || 'demo@example.com',
          image: token.picture || null,
        }
        ;(session as any).accessToken = token.accessToken
        ;(session as any).provider = token.provider
      }
      return session
    },

    async signIn({ account, profile, user }) {
      // Allow all sign-ins in development
      if (process.env.NODE_ENV === 'development') {
        return true
      }
      
      // In production, implement proper validation
      return false
    },
  },

  // Basic security settings
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  debug: process.env.NODE_ENV === 'development',
}

// Export NextAuth.js v5 handlers and utilities
const nextAuthResult = NextAuth(authConfig)

// Safely export handlers with fallback
export const handlers = nextAuthResult.handlers
export const auth = nextAuthResult.auth
export const signIn = nextAuthResult.signIn
export const signOut = nextAuthResult.signOut
export { authConfig }

// Export the handlers individually for easier use
export const GET = handlers?.GET
export const POST = handlers?.POST
