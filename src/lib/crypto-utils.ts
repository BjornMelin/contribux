/**
 * Cross-Runtime Crypto Utilities
 * Provides crypto functions compatible with both Node.js and Edge Runtime
 * Prioritizes Web Crypto API for Edge Runtime compatibility
 */

// Text encoder/decoder for string/buffer conversions
const encoder = new TextEncoder()
const _decoder = new TextDecoder()

/**
 * Convert hex string to Uint8Array
 */
function _hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert Uint8Array to base64url string (for tokens)
 */
function uint8ArrayToBase64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Legacy hashing function - use createSecureHash from @/lib/security/crypto instead
 * @deprecated Use createSecureHash from advanced crypto implementation
 */
export async function createSHA256Hash(data: string): Promise<string> {
  const dataBytes = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes)
  const hashArray = new Uint8Array(hashBuffer)
  return uint8ArrayToHex(hashArray)
}

/**
 * Generates cryptographically secure random bytes
 * Edge Runtime compatible alternative to randomBytes()
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Generates a random token as base64url string
 * Edge Runtime compatible alternative to randomBytes().toString('base64url')
 */
export function generateRandomToken(length = 32): string {
  const bytes = getRandomBytes(length)
  return uint8ArrayToBase64url(bytes)
}

/**
 * Legacy timing-safe comparison - use timing-safe functions from @/lib/security/crypto instead
 * @deprecated Use verifyHMAC or appropriate timing-safe functions from advanced crypto
 */
export async function timingSafeEqual(a: string | Buffer, b: string | Buffer): Promise<boolean> {
  // Convert inputs to Uint8Array
  const aBytes = typeof a === 'string' ? encoder.encode(a) : new Uint8Array(a)
  const bBytes = typeof b === 'string' ? encoder.encode(b) : new Uint8Array(b)

  // If lengths don't match, they can't be equal
  if (aBytes.length !== bBytes.length) {
    return false
  }

  // Use HMAC verification for timing-safe comparison
  // Generate a random key for this comparison
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

  // Create HMACs of both values
  const hmacA = await crypto.subtle.sign('HMAC', key, aBytes)
  const hmacB = await crypto.subtle.sign('HMAC', key, bBytes)

  // Compare the HMACs (this is timing-safe in Web Crypto)
  const hmacABytes = new Uint8Array(hmacA)
  const hmacBBytes = new Uint8Array(hmacB)

  // Manual comparison to ensure constant time
  let result = 0
  for (let i = 0; i < hmacABytes.length; i++) {
    result |= (hmacABytes[i] || 0) ^ (hmacBBytes[i] || 0)
  }

  return result === 0
}

/**
 * Runtime detection utility - Edge Runtime compatible
 * Simplified for Edge Runtime compatibility by avoiding Node.js API checks
 */
export function isEdgeRuntime(): boolean {
  // Simplified runtime detection that works in all environments
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined'
  )
}

/**
 * Runtime detection utility - simplified for Edge Runtime compatibility
 */
export function isNodeRuntime(): boolean {
  // Always assume we can use Web Crypto API for simplicity
  return false
}

/**
 * @deprecated Use verifyHMAC or appropriate timing-safe functions from @/lib/security/crypto
 * Legacy adaptive timing-safe comparison
 */
export async function adaptiveTimingSafeEqual(
  a: string | Buffer,
  b: string | Buffer
): Promise<boolean> {
  return await timingSafeEqual(a, b)
}

/**
 * @deprecated Use createSecureHash from @/lib/security/crypto instead
 * Legacy adaptive hash creation
 */
export async function adaptiveCreateHash(data: string): Promise<string> {
  return await createSHA256Hash(data)
}

/**
 * Generate a UUID using Web Crypto API
 * Edge Runtime compatible
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Legacy compatibility exports
 * These maintain the same interface as node:crypto for easy migration
 */

// Export a crypto object that mimics node:crypto but uses Web Crypto
export const webCrypto = {
  randomUUID: generateUUID,
  getRandomValues: (array: Uint8Array) => crypto.getRandomValues(array),
  subtle: crypto.subtle,
}

// Base64url encoding/decoding utilities
export const base64url = {
  encode: uint8ArrayToBase64url,
  decode: (str: string): Uint8Array => {
    const base64 = str
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  },
}
