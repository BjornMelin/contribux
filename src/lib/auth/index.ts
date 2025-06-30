/**
 * NextAuth.js instance for GitHub OAuth authentication
 * Exports auth handlers and helper functions
 * NextAuth.js v5 Configuration - Replaces Custom JWT Implementation
 * This addresses the critical CVSS 9.8 JWT vulnerability
 */

import type { NextAuthConfig } from 'next-auth'
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { env } from '@/lib/env'

// NextAuth.js v5 configuration following industry best practices
const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          // Request necessary GitHub permissions for repository scanning
          scope: 'read:user user:email repo public_repo read:org',
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours for security
  },

  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and user info
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.provider = account.provider
      }

      if (profile) {
        token.login = profile.login
        token.githubId = profile.id
      }

      return token
    },

    async session({ session, token }) {
      // Send properties to the client
      // biome-ignore lint/suspicious/noExplicitAny: Required for NextAuth session extension
      const extendedSession = session as any

      if (token.accessToken) {
        extendedSession.accessToken = token.accessToken as string
      }

      if (token.login) {
        extendedSession.user.login = token.login as string
      }

      if (token.githubId) {
        extendedSession.user.githubId = token.githubId as number
      }

      return extendedSession
    },

    async signIn({ account, profile }) {
      // Enhanced security: validate GitHub account
      if (account?.provider === 'github' && profile?.login) {
        // Successful GitHub authentication - logging would be handled by external monitoring
        return true
      }

      return false // Reject if not from GitHub or missing required data
    },
  },

  events: {
    async signIn() {
      // Security audit logging would be handled by external monitoring system (e.g., Sentry)
      // This ensures proper authentication tracking without console pollution
    },

    async signOut() {
      // Security audit logging would be handled by external monitoring system
    },
  },

  // Enhanced security configuration
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
} satisfies NextAuthConfig

// Export NextAuth.js v5 handlers and utilities
const nextAuthResult = NextAuth(authConfig)

export const { handlers, auth, signIn, signOut } = nextAuthResult
export { authConfig }

// Export the handlers individually for easier use
export const { GET, POST } = handlers
