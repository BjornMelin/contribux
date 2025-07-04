/**
 * Simple Crypto Utilities for Portfolio Application
 * Basic cryptographic functions following KISS principles
 */

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32): string {
  // Use Web Crypto API available in both browser and Edge Runtime
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // Convert to base64url without using Buffer (not available in Edge Runtime)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Create a secure hash
 */
export async function createSecureHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  // Convert ArrayBuffer to hex string without using Buffer
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
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

  // Use Web Crypto API available in both browser and Edge Runtime
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)

  let result = ''
  for (let i = 0; i < length; i++) {
    const byte = randomBytes[i]
    if (byte !== undefined) {
      const index = byte % chars.length
      result += chars.charAt(index)
    }
  }
  return result
}
