/**
 * NextAuth.js instance for GitHub OAuth authentication
 * Exports auth handlers and helper functions
 * NextAuth.js v5 Configuration - Replaces Custom JWT Implementation
 * This addresses the critical CVSS 9.8 JWT vulnerability
 */

// NextAuth.js v5 configuration following industry best practices
import * as jwt from 'jsonwebtoken'
import type { JWT, NextAuthConfig } from 'next-auth'
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { env } from '@/lib/env'
import { createLogParams, logSecurityEvent } from './audit'

// Extended JWT interface for security metadata - ensure compatibility with NextAuth JWT
interface ExtendedJWT extends JWT {
  securityMetadata?: {
    tokenValidated?: boolean
    providerVerified?: boolean
    issuedAt?: number
  }
  profileValidated?: boolean
  provider?: string
  login?: string
  githubId?: number
  // Ensure index signature compatibility
  [key: string]: unknown
}

const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          // Enhanced GitHub permissions for repository scanning
          scope: 'read:user user:email repo public_repo read:org',
          // Force PKCE and state validation
          response_type: 'code',
        },
      },
      // Enhanced PKCE configuration
      checks: ['pkce', 'state'],
    }),
  ],

  // Enhanced session security
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours for security
    updateAge: 60 * 60, // Update session every hour
  },

  // Enhanced JWT security
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
    encode: async ({ token, secret }) => {
      // Use secure JWT encoding with additional claims
      const payload = {
        ...token,
        iat: Math.floor(Date.now() / 1000),
        security_version: '2.0',
        entropy_validated: true,
      }

      // Ensure secret is a string
      const secretKey = Array.isArray(secret) ? secret[0] : secret
      if (!secretKey) {
        throw new Error('JWT secret is required')
      }

      return jwt.sign(payload, secretKey, {
        algorithm: 'HS256',
        expiresIn: '24h',
        issuer: 'contribux',
        audience: 'contribux-app',
      })
    },
    decode({ token, secret }) {
      try {
        // Ensure secret is a string
        const secretKey = Array.isArray(secret) ? secret[0] : secret
        if (!secretKey) {
          return null
        }

        const decoded = jwt.verify(token, secretKey, {
          algorithms: ['HS256'],
          issuer: 'contribux',
          audience: 'contribux-app',
        })

        // Validate security version and return as JWT
        if (typeof decoded === 'object' && decoded && 'security_version' in decoded) {
          const decodedObj = decoded as Record<string, unknown>
          if (decodedObj.security_version !== '2.0') {
            return null // Reject old tokens
          }
        }

        return decoded as JWT
      } catch {
        return null
      }
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // Cast token to ExtendedJWT for type safety
      const extendedToken = token as ExtendedJWT

      // Enhanced token management with security validation
      if (account) {
        // Validate account security
        if (!account.access_token || !account.provider) {
          throw new Error('Invalid account data')
        }

        // Secure token storage
        extendedToken.accessToken = account.access_token
        if (account.refresh_token) {
          extendedToken.refreshToken = account.refresh_token
        }
        extendedToken.provider = account.provider

        // Add security metadata
        extendedToken.securityMetadata = {
          tokenValidated: true,
          providerVerified: account.provider === 'github',
          issuedAt: Date.now(),
        }
      }

      if (profile) {
        // Validate GitHub profile data
        if (!profile.login || !profile.id) {
          throw new Error('Invalid GitHub profile data')
        }

        extendedToken.login = profile.login as string
        extendedToken.githubId = Number(profile.id)
        extendedToken.profileValidated = true
      }

      // Token refresh validation
      const tokenAge = Date.now() - (extendedToken.securityMetadata?.issuedAt || 0)
      if (tokenAge > 24 * 60 * 60 * 1000) {
        // 24 hours - Token too old, force re-authentication
        return null
      }

      // Return as JWT type for NextAuth compatibility
      return extendedToken as JWT
    },

    async session({ session, token }) {
      // Enhanced session with security validation
      // biome-ignore lint/suspicious/noExplicitAny: Required for NextAuth session extension
      const extendedSession = session as any
      const extendedToken = token as ExtendedJWT

      // Validate token security metadata
      if (!extendedToken.securityMetadata?.tokenValidated || !extendedToken.profileValidated) {
        throw new Error('Invalid session security metadata')
      }

      // Add secure token data
      if (extendedToken.accessToken) {
        extendedSession.accessToken = extendedToken.accessToken as string
      }

      if (extendedToken.login) {
        extendedSession.user.login = extendedToken.login as string
      }

      if (extendedToken.githubId) {
        extendedSession.user.githubId = extendedToken.githubId as number
      }

      // Add session security metadata
      extendedSession.securityMetadata = {
        provider: extendedToken.provider,
        validated: true,
        version: '2.0',
        lastValidated: Date.now(),
      }

      return extendedSession
    },

    async signIn({ account, profile, user }) {
      // Enhanced security validation for sign-in
      if (account?.provider !== 'github') {
        await logSecurityEvent(
          createLogParams({
            event_type: 'auth_invalid_provider',
            event_severity: 'warning',
            user_id: user?.id,
            event_data: {
              provider: account?.provider,
            },
            success: false,
          })
        )
        return false
      }

      if (!profile?.login || !account?.access_token) {
        await logSecurityEvent(
          createLogParams({
            event_type: 'auth_missing_required_data',
            event_severity: 'warning',
            user_id: user?.id,
            event_data: {
              has_login: !!profile?.login,
              has_token: !!account?.access_token,
            },
            success: false,
          })
        )
        return false
      }

      // Additional GitHub account validation
      try {
        // Verify token is valid by making a test API call
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            'User-Agent': 'Contribux-App',
          },
        })

        if (!response.ok) {
          await logSecurityEvent(
            createLogParams({
              event_type: 'auth_token_validation_failed',
              event_severity: 'error',
              user_id: user?.id,
              event_data: {
                status: response.status,
              },
              success: false,
            })
          )
          return false
        }

        // Log successful authentication
        await logSecurityEvent(
          createLogParams({
            event_type: 'auth_successful',
            event_severity: 'info',
            user_id: user?.id,
            event_data: {
              provider: account.provider,
              user_login: profile.login,
            },
            success: true,
          })
        )

        return true
      } catch (error) {
        await logSecurityEvent(
          createLogParams({
            event_type: 'auth_validation_error',
            event_severity: 'error',
            user_id: user?.id,
            event_data: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            success: false,
          })
        )
        return false
      }
    },
  },

  events: {
    async signIn({ user, account, profile }) {
      // Enhanced security audit logging
      await logSecurityEvent(
        createLogParams({
          event_type: 'user_signed_in',
          event_severity: 'info',
          user_id: user?.id,
          event_data: {
            provider: account?.provider,
            login: profile?.login,
            timestamp: new Date().toISOString(),
          },
          success: true,
        })
      )
    },

    async signOut(params) {
      // Enhanced sign-out security
      const token = 'token' in params ? params.token : null
      await logSecurityEvent(
        createLogParams({
          event_type: 'user_signed_out',
          event_severity: 'info',
          user_id: token?.sub,
          event_data: {
            provider: (token as ExtendedJWT)?.provider,
            timestamp: new Date().toISOString(),
          },
          success: true,
        })
      )

      // Revoke tokens if possible
      const extendedToken = token as ExtendedJWT
      if (extendedToken?.accessToken && extendedToken?.provider === 'github') {
        try {
          await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
            method: 'DELETE',
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`
              ).toString('base64')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: extendedToken.accessToken,
            }),
          })
        } catch {
          // Token revocation failed - log but don't throw
          await logSecurityEvent(
            createLogParams({
              event_type: 'token_revocation_failed',
              event_severity: 'warning',
              user_id: token?.sub,
              event_data: {
                provider: extendedToken?.provider,
              },
              success: false,
            })
          )
        }
      }
    },

    async createUser({ user }) {
      await logSecurityEvent(
        createLogParams({
          event_type: 'user_created',
          event_severity: 'info',
          user_id: user.id,
          event_data: {
            email: user.email,
            timestamp: new Date().toISOString(),
          },
          success: true,
        })
      )
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
        ...(process.env.NODE_ENV === 'production' && { domain: '.contribux.app' }),
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  // Enhanced security settings
  useSecureCookies: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',

  // Custom error handling
  logger: {
    error: error => {
      // Security-focused error logging
      logSecurityEvent(
        createLogParams({
          event_type: 'auth_error',
          event_severity: 'error',
          event_data: {
            error: error.message,
            stack: error.stack?.substring(0, 500), // Limit stack trace
            timestamp: new Date().toISOString(),
          },
          success: false,
        })
      )
    },
    warn: _message => {
      if (process.env.NODE_ENV === 'development') {
        // NextAuth warning logged in development only
      }
    },
  },
} satisfies NextAuthConfig

// Export NextAuth.js v5 handlers and utilities
const nextAuthResult = NextAuth(authConfig)

export const { handlers, auth, signIn, signOut } = nextAuthResult
export { authConfig }

// Export the handlers individually for easier use
export const { GET, POST } = handlers
