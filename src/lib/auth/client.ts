/**
 * NextAuth Client Configuration
 * Custom client setup to handle environment variable issues
 */

'use client'

// Polyfill for NEXTAUTH_URL on client side
if (typeof window !== 'undefined' && !process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = window.location.origin
}

export {}