/**
 * Simple Crypto Utilities for Portfolio Application
 * Basic cryptographic functions following KISS principles
 */

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32): string {
  const crypto = globalThis.crypto || require('node:crypto')
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

/**
 * Create a secure hash
 */
export async function createSecureHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Buffer.from(buffer).toString('hex')
}

/**
 * Verify hash using constant-time comparison to prevent timing attacks
 */
export async function verifyHash(data: string, hash: string): Promise<boolean> {
  const dataHash = await createSecureHash(data)

  // Constant-time comparison to prevent timing attacks
  if (dataHash.length !== hash.length) {
    return false
  }

  let isEqual = true
  for (let i = 0; i < dataHash.length; i++) {
    if (dataHash.charCodeAt(i) !== hash.charCodeAt(i)) {
      isEqual = false
    }
  }

  return isEqual
}

/**
 * Generate a cryptographically secure random string for nonces, challenges, etc.
 * Uses Web Crypto API instead of insecure Math.random()
 */
export function generateRandomString(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const crypto = globalThis.crypto || require('node:crypto')
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)

  let result = ''
  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % chars.length
    result += chars.charAt(index)
  }
  return result
}
