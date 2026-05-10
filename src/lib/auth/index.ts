/**
 * Simplified NextAuth.js configuration for development testing
 * This version works without database connectivity or OAuth credentials
 */

import NextAuth, { type AuthOptions, getServerSession, type Session, type User } from 'next-auth'
import { getProviders } from './providers/index'

// NextAuth.js TypeScript declarations
// Session interface is already defined in src/types/next-auth.d.ts

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    provider?: string
  }
}

// Demo GitHub provider has been moved to ./providers/demo.ts

// Demo Google provider has been moved to ./providers/demo.ts

const authConfig: AuthOptions = {
  providers: getProviders(),

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, account, profile: _profile, user: _user }) {
      // In development, simulate successful OAuth flow
      if (process.env.NODE_ENV === 'development' && account) {
        // Create demo user data based on provider
        const demoUser =
          account.provider === 'github'
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
          ...session.user,
          id: token.sub,
          name: token.name || 'Demo User',
          email: token.email || 'demo@example.com',
          emailVerified: token.email_verified ? new Date(token.email_verified as string) : null,
          image: token.picture || null,
          login: undefined,
          githubId: undefined,
          githubUsername: undefined,
          connectedProviders: [token.provider || 'demo'],
          primaryProvider: token.provider || 'demo',
        } as User
        // Store additional session data
        ;(session as Session).accessToken = token.accessToken
      }
      return session
    },

    async signIn({ account: _account, profile: _profile, user: _user }) {
      // Allow all sign-ins in development
      if (process.env.NODE_ENV === 'development') {
        return true
      }

      // In production, implement proper validation
      // For now, allow all sign-ins but this should be customized
      // based on your specific requirements
      return true
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

// NextAuth.js v4 returns a single route handler for App Router GET and POST.
const handler = NextAuth(authConfig)

export const handlers = {
  GET: handler,
  POST: handler,
}

export const auth = () => getServerSession(authConfig)

export { authConfig }

// Export the handlers individually for easier use
export const GET = handlers.GET
export const POST = handlers.POST
