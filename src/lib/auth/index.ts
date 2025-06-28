import NextAuth from 'next-auth'
import { authConfig } from './config'

/**
 * NextAuth.js instance for GitHub OAuth authentication
 * Exports auth handlers and helper functions
 */
export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)

// Export the handlers individually for easier use
export const { GET, POST } = handlers
