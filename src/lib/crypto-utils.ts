/**
 * Cross-Runtime Crypto Utilities - OPTIMIZED
 * Leverages modern Web Crypto API and jose library for enhanced security
 * Edge Runtime optimized with library-maintained implementations
 *
 * @deprecated Custom crypto implementations - prefer jose library where possible
 * Consider migrating to jose/base64url, jose/encrypt, jose/sign for better security
 */

import { base64url } from 'jose'

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
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert Uint8Array to base64url string (for tokens)
 * @deprecated Use jose/base64url.encode instead for better security and maintenance
 */
function uint8ArrayToBase64url(bytes: Uint8Array): string {
  // Use jose library for better security and standards compliance
  return base64url.encode(bytes)
}

/**
 * Legacy hashing function - use createSecureHash from @/lib/security/crypto-simple instead
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
 * Legacy timing-safe comparison - use timing-safe functions from @/lib/security/crypto-simple instead
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

// Base64url encoding/decoding utilities - OPTIMIZED with jose library
export const base64urlUtils = {
  encode: (bytes: Uint8Array): string => base64url.encode(bytes),
  decode: (str: string): Uint8Array => base64url.decode(str),
}

// Legacy export for backward compatibility
export { base64url } from 'jose'

/**
 * Edge Runtime compatible HMAC operations
 */
export async function createHmac(
  algorithm: string,
  secret: string | Uint8Array
): Promise<{
  update: (data: string | Uint8Array) => void
  digest: (encoding?: 'hex' | 'base64' | 'base64url') => Promise<string>
}> {
  // Convert algorithm name to Web Crypto format
  const algoMap: Record<string, string> = {
    sha256: 'SHA-256',
    sha1: 'SHA-1',
    sha512: 'SHA-512',
  }

  const webCryptoAlgo = algoMap[algorithm.toLowerCase()] || 'SHA-256'

  // Convert secret to CryptoKey
  const secretBytes = typeof secret === 'string' ? encoder.encode(secret) : secret
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: webCryptoAlgo },
    false,
    ['sign']
  )

  let dataToSign = new Uint8Array(0)

  return {
    update: (data: string | Uint8Array) => {
      const dataBytes = typeof data === 'string' ? encoder.encode(data) : data
      const combined = new Uint8Array(dataToSign.length + dataBytes.length)
      combined.set(dataToSign)
      combined.set(dataBytes, dataToSign.length)
      dataToSign = combined
    },
    digest: async (encoding: 'hex' | 'base64' | 'base64url' = 'hex') => {
      const signature = await crypto.subtle.sign('HMAC', key, dataToSign)
      const signatureBytes = new Uint8Array(signature)

      switch (encoding) {
        case 'hex':
          return uint8ArrayToHex(signatureBytes)
        case 'base64':
          return btoa(String.fromCharCode(...signatureBytes))
        case 'base64url':
          return uint8ArrayToBase64url(signatureBytes)
        default:
          return uint8ArrayToHex(signatureBytes)
      }
    },
  }
}

/**
 * Edge Runtime compatible Hash operations
 */
export async function createHash(algorithm: string): Promise<{
  update: (data: string | Uint8Array) => void
  digest: (encoding?: 'hex' | 'base64' | 'base64url') => Promise<string>
}> {
  // Convert algorithm name to Web Crypto format
  const algoMap: Record<string, string> = {
    sha256: 'SHA-256',
    sha1: 'SHA-1',
    sha512: 'SHA-512',
    md5: 'SHA-256', // MD5 not supported in Web Crypto, fallback to SHA-256
  }

  const webCryptoAlgo = algoMap[algorithm.toLowerCase()] || 'SHA-256'

  let dataToHash = new Uint8Array(0)

  return {
    update: (data: string | Uint8Array) => {
      const dataBytes = typeof data === 'string' ? encoder.encode(data) : data
      const combined = new Uint8Array(dataToHash.length + dataBytes.length)
      combined.set(dataToHash)
      combined.set(dataBytes, dataToHash.length)
      dataToHash = combined
    },
    digest: async (encoding: 'hex' | 'base64' | 'base64url' = 'hex') => {
      const hashBuffer = await crypto.subtle.digest(webCryptoAlgo, dataToHash)
      const hashBytes = new Uint8Array(hashBuffer)

      switch (encoding) {
        case 'hex':
          return uint8ArrayToHex(hashBytes)
        case 'base64':
          return btoa(String.fromCharCode(...hashBytes))
        case 'base64url':
          return uint8ArrayToBase64url(hashBytes)
        default:
          return uint8ArrayToHex(hashBytes)
      }
    },
  }
}

/**
 * Edge Runtime compatible random bytes generation (hex encoded)
 */
export function randomBytes(size: number): { toString: (encoding: string) => string } {
  const bytes = getRandomBytes(size)
  return {
    toString: (encoding: string) => {
      if (encoding === 'hex') {
        return uint8ArrayToHex(bytes)
      }
      if (encoding === 'base64') {
        return btoa(String.fromCharCode(...bytes))
      }
      if (encoding === 'base64url') {
        return uint8ArrayToBase64url(bytes)
      }
      // Default to hex for compatibility
      return uint8ArrayToHex(bytes)
    },
  }
}

/**
 * Edge Runtime compatible UUID generation
 */
export function randomUUID(): string {
  return generateUUID()
}

/**
 * Synchronous timing-safe equal for compatibility with node:crypto API
 */
export function timingSafeEqualSync(a: string | Buffer, b: string | Buffer): boolean {
  // Convert inputs to Uint8Array for consistent comparison
  const aBytes = typeof a === 'string' ? encoder.encode(a) : new Uint8Array(a)
  const bBytes = typeof b === 'string' ? encoder.encode(b) : new Uint8Array(b)

  // If lengths don't match, they can't be equal
  if (aBytes.length !== bBytes.length) {
    return false
  }

  // Constant-time comparison
  let result = 0
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i]
  }

  return result === 0
}
