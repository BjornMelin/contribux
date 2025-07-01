/**
 * Enhanced Web Crypto API Implementation with Zero-Trust Principles
 * Implements client-side encryption, secure key management, key derivation,
 * digital signatures, and cryptographic operations for zero-trust architecture
 */

import { z } from 'zod'

// Note: This module provides enhanced crypto functions
// For basic auth crypto functions, import from '@/lib/auth/crypto' directly

// Enhanced crypto configuration
export const ENHANCED_CRYPTO_CONFIG = {
  // Key derivation
  pbkdf2: {
    iterations: 100000, // NIST recommended minimum
    saltLength: 32, // 256 bits
    keyLength: 32, // 256 bits
    algorithm: 'PBKDF2' as const,
    hash: 'SHA-256' as const,
  },
  // Digital signatures
  signature: {
    algorithm: 'ECDSA' as const,
    curve: 'P-256' as const,
    hash: 'SHA-256' as const,
  },
  // Key exchange
  keyExchange: {
    algorithm: 'ECDH' as const,
    curve: 'P-256' as const,
  },
  // Hashing
  hashing: {
    algorithm: 'SHA-256' as const,
    hmacKeyLength: 32, // 256 bits
  },
  // Random generation
  random: {
    tokenLength: 32, // 256 bits
    sessionIdLength: 16, // 128 bits
    nonceLength: 12, // 96 bits for AES-GCM
  },
} as const

// Zero-trust security schemas
export const SecurityTokenSchema = z.object({
  value: z.string(),
  algorithm: z.string(),
  expiresAt: z.number(),
  issuedAt: z.number(),
  fingerprint: z.string(),
})

export const KeyMetadataSchema = z.object({
  keyId: z.string(),
  algorithm: z.string(),
  usage: z.array(z.string()),
  createdAt: z.number(),
  expiresAt: z.number().optional(),
  rotationPeriod: z.number().optional(),
})

export const DigitalSignatureSchema = z.object({
  signature: z.string(), // Base64 encoded
  algorithm: z.string(),
  keyId: z.string(),
  timestamp: z.number(),
  publicKey: z.string(), // Base64 encoded public key
})

// Type definitions
export type SecurityToken = z.infer<typeof SecurityTokenSchema>
export type KeyMetadata = z.infer<typeof KeyMetadataSchema>
export type DigitalSignature = z.infer<typeof DigitalSignatureSchema>

export interface SecureKeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
  keyId: string
  metadata: KeyMetadata
}

export interface DerivedKeyInfo {
  key: CryptoKey
  salt: Uint8Array
  iterations: number
  algorithm: string
}

export interface SecureExchange {
  encryptedData: string
  keyExchangeData: string
  signature: DigitalSignature
  metadata: {
    algorithm: string
    timestamp: number
    participantId: string
  }
}

// Key generation and management

/**
 * Generate a secure ECDSA key pair for digital signatures
 */
export async function generateSignatureKeyPair(): Promise<SecureKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: ENHANCED_CRYPTO_CONFIG.signature.algorithm,
      namedCurve: ENHANCED_CRYPTO_CONFIG.signature.curve,
    },
    true, // extractable
    ['sign', 'verify']
  )

  const keyId = await generateSecureKeyId(keyPair.publicKey)

  const metadata: KeyMetadata = {
    keyId,
    algorithm: ENHANCED_CRYPTO_CONFIG.signature.algorithm,
    usage: ['sign', 'verify'],
    createdAt: Date.now(),
    rotationPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
  }

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    keyId,
    metadata,
  }
}

/**
 * Generate a secure ECDH key pair for key exchange
 */
export async function generateKeyExchangePair(): Promise<SecureKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: ENHANCED_CRYPTO_CONFIG.keyExchange.algorithm,
      namedCurve: ENHANCED_CRYPTO_CONFIG.keyExchange.curve,
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  )

  const keyId = await generateSecureKeyId(keyPair.publicKey)

  const metadata: KeyMetadata = {
    keyId,
    algorithm: ENHANCED_CRYPTO_CONFIG.keyExchange.algorithm,
    usage: ['deriveKey', 'deriveBits'],
    createdAt: Date.now(),
    rotationPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  }

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    keyId,
    metadata,
  }
}

// Key derivation functions

/**
 * Derive a key from a password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array,
  iterations?: number
): Promise<DerivedKeyInfo> {
  const actualSalt =
    salt || crypto.getRandomValues(new Uint8Array(ENHANCED_CRYPTO_CONFIG.pbkdf2.saltLength))
  const actualIterations = iterations || ENHANCED_CRYPTO_CONFIG.pbkdf2.iterations

  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  // Derive AES-GCM key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: ENHANCED_CRYPTO_CONFIG.pbkdf2.algorithm,
      salt: actualSalt,
      iterations: actualIterations,
      hash: ENHANCED_CRYPTO_CONFIG.pbkdf2.hash,
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: ENHANCED_CRYPTO_CONFIG.pbkdf2.keyLength * 8,
    },
    true,
    ['encrypt', 'decrypt']
  )

  return {
    key: derivedKey,
    salt: actualSalt,
    iterations: actualIterations,
    algorithm: ENHANCED_CRYPTO_CONFIG.pbkdf2.algorithm,
  }
}

/**
 * Derive a shared secret using ECDH key exchange
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return await crypto.subtle.deriveKey(
    {
      name: ENHANCED_CRYPTO_CONFIG.keyExchange.algorithm,
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

// Digital signatures

/**
 * Create a digital signature for data integrity
 */
export async function createDigitalSignature(
  data: string | Uint8Array,
  privateKey: CryptoKey,
  keyId: string
): Promise<DigitalSignature> {
  const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data

  const signature = await crypto.subtle.sign(
    {
      name: ENHANCED_CRYPTO_CONFIG.signature.algorithm,
      hash: ENHANCED_CRYPTO_CONFIG.signature.hash,
    },
    privateKey,
    dataBuffer
  )

  // Export public key for verification
  const publicKey = await getCorrespondingPublicKey(privateKey)
  const exportedPublicKey = await crypto.subtle.exportKey('spki', publicKey)

  return {
    signature: base64Encode(new Uint8Array(signature)),
    algorithm: ENHANCED_CRYPTO_CONFIG.signature.algorithm,
    keyId,
    timestamp: Date.now(),
    publicKey: base64Encode(new Uint8Array(exportedPublicKey)),
  }
}

/**
 * Verify a digital signature
 */
export async function verifyDigitalSignature(
  data: string | Uint8Array,
  signature: DigitalSignature,
  maxAge?: number
): Promise<boolean> {
  try {
    // Check signature age if specified
    if (maxAge && Date.now() - signature.timestamp > maxAge) {
      return false
    }

    // Import public key
    const publicKeyBuffer = base64Decode(signature.publicKey)
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      {
        name: signature.algorithm,
        namedCurve: ENHANCED_CRYPTO_CONFIG.signature.curve,
      },
      false,
      ['verify']
    )

    // Verify signature
    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const signatureBuffer = base64Decode(signature.signature)

    return await crypto.subtle.verify(
      {
        name: signature.algorithm,
        hash: ENHANCED_CRYPTO_CONFIG.signature.hash,
      },
      publicKey,
      signatureBuffer,
      dataBuffer
    )
  } catch {
    return false
  }
}

// Secure random generation

/**
 * Generate cryptographically secure random token
 */
export function generateSecureToken(length?: number): string {
  const tokenLength = length || ENHANCED_CRYPTO_CONFIG.random.tokenLength
  const randomBytes = crypto.getRandomValues(new Uint8Array(tokenLength))
  const base64Token = base64Encode(randomBytes).replace(/[+/=]/g, '')

  // For CSP nonces, ensure exact length match
  if (length && length <= 24) {
    return base64Token.substring(0, length)
  }

  return base64Token
}

/**
 * Generate secure session ID
 */
export function generateSessionId(): string {
  const randomBytes = crypto.getRandomValues(
    new Uint8Array(ENHANCED_CRYPTO_CONFIG.random.sessionIdLength)
  )
  return base64Encode(randomBytes).replace(/[+/=]/g, '')
}

/**
 * Generate secure nonce for encryption
 */
export function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(ENHANCED_CRYPTO_CONFIG.random.nonceLength))
}

// Secure hashing

/**
 * Create HMAC for message authentication
 */
export async function createHMAC(message: string | Uint8Array, key: CryptoKey): Promise<string> {
  const messageBuffer = typeof message === 'string' ? new TextEncoder().encode(message) : message

  const signature = await crypto.subtle.sign('HMAC', key, messageBuffer)

  return base64Encode(new Uint8Array(signature))
}

/**
 * Verify HMAC signature using timing-safe comparison
 */
export async function verifyHMAC(
  message: string | Uint8Array,
  expectedHmac: string,
  key: CryptoKey
): Promise<boolean> {
  try {
    const computedHmac = await createHMAC(message, key)

    // Use Web Crypto API for timing-safe comparison
    return await timingSafeEqual(expectedHmac, computedHmac)
  } catch {
    return false
  }
}

/**
 * Timing-safe comparison using Web Crypto API
 * Protects against timing attacks by ensuring constant-time comparison
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  // Convert strings to Uint8Arrays
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)

  // If lengths are different, return false (but still do work to maintain timing)
  if (aBytes.length !== bBytes.length) {
    // Perform a dummy comparison to maintain timing
    const dummy = new Uint8Array(Math.max(aBytes.length, bBytes.length))
    dummy.fill(0)
    let _result = 0
    for (let i = 0; i < dummy.length; i++) {
      _result |= (dummy[i] ?? 0) ^ (i < aBytes.length ? (aBytes[i] ?? 0) : 0)
    }
    return false
  }

  // XOR all bytes and check if result is zero
  let result = 0
  for (let i = 0; i < aBytes.length; i++) {
    result |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }

  return result === 0
}

/**
 * Generate HMAC key
 */
export async function generateHMACKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'HMAC',
      hash: ENHANCED_CRYPTO_CONFIG.hashing.algorithm,
      length: ENHANCED_CRYPTO_CONFIG.hashing.hmacKeyLength * 8,
    },
    true,
    ['sign', 'verify']
  )
}

/**
 * Create secure hash
 */
export async function createSecureHash(data: string | Uint8Array): Promise<string> {
  const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const hashBuffer = await crypto.subtle.digest(
    ENHANCED_CRYPTO_CONFIG.hashing.algorithm,
    dataBuffer
  )
  return base64Encode(new Uint8Array(hashBuffer))
}

// Secure key exchange protocol

/**
 * Initialize secure key exchange
 */
export async function initiateKeyExchange(_participantId: string): Promise<{
  publicKey: string
  keyId: string
  exchangeToken: string
}> {
  const keyPair = await generateKeyExchangePair()
  const exchangeToken = generateSecureToken()

  // Export public key for transmission
  const exportedPublicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey)

  // Store private key securely (in production, use secure storage)
  await storeKeyPairSecurely(keyPair, exchangeToken)

  return {
    publicKey: base64Encode(new Uint8Array(exportedPublicKey)),
    keyId: keyPair.keyId,
    exchangeToken,
  }
}

/**
 * Complete secure key exchange
 */
export async function completeKeyExchange(
  theirPublicKeyData: string,
  ourExchangeToken: string,
  _participantId: string
): Promise<CryptoKey> {
  // Retrieve our private key
  const ourKeyPair = await retrieveKeyPairSecurely(ourExchangeToken)

  // Import their public key
  const theirPublicKeyBuffer = base64Decode(theirPublicKeyData)
  const theirPublicKey = await crypto.subtle.importKey(
    'spki',
    theirPublicKeyBuffer,
    {
      name: ENHANCED_CRYPTO_CONFIG.keyExchange.algorithm,
      namedCurve: ENHANCED_CRYPTO_CONFIG.keyExchange.curve,
    },
    false,
    []
  )

  // Derive shared secret
  const sharedSecret = await deriveSharedSecret(ourKeyPair.privateKey, theirPublicKey)

  // Clean up temporary keys
  await cleanupKeyExchange(ourExchangeToken)

  return sharedSecret
}

// Zero-trust security utilities

/**
 * Generate device fingerprint for zero-trust verification
 */
export async function generateDeviceFingerprint(
  userAgent: string,
  additionalData?: Record<string, unknown>
): Promise<string> {
  const fingerprintData = {
    userAgent,
    timestamp: Math.floor(Date.now() / (1000 * 60 * 60)), // Hour-based to allow some variance
    ...additionalData,
  }

  return await createSecureHash(JSON.stringify(fingerprintData))
}

/**
 * Create tamper-proof security token
 */
export async function createSecurityToken(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  keyId: string,
  expirationMs = 3600000 // 1 hour default
): Promise<SecurityToken> {
  const now = Date.now()
  const tokenData = {
    ...payload,
    issuedAt: now,
    expiresAt: now + expirationMs,
  }

  const dataString = JSON.stringify(tokenData)
  const signature = await createDigitalSignature(dataString, privateKey, keyId)
  const fingerprint = await createSecureHash(dataString)

  const token = {
    data: base64Encode(new TextEncoder().encode(dataString)),
    signature: signature.signature,
    keyId: signature.keyId,
    publicKey: signature.publicKey,
  }

  return {
    value: base64Encode(new TextEncoder().encode(JSON.stringify(token))),
    algorithm: ENHANCED_CRYPTO_CONFIG.signature.algorithm,
    expiresAt: tokenData.expiresAt,
    issuedAt: tokenData.issuedAt,
    fingerprint,
  }
}

/**
 * Verify security token integrity and authenticity
 */
export async function verifySecurityToken(
  token: SecurityToken,
  maxAge?: number
): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
  try {
    // Check expiration
    if (Date.now() > token.expiresAt) {
      return { valid: false }
    }

    // Check age if specified
    if (maxAge && Date.now() - token.issuedAt > maxAge) {
      return { valid: false }
    }

    // Decode token
    const tokenBuffer = base64Decode(token.value)
    const tokenString = new TextDecoder().decode(tokenBuffer)
    const tokenObj = JSON.parse(tokenString)

    // Verify signature
    const dataBuffer = base64Decode(tokenObj.data)
    const dataString = new TextDecoder().decode(dataBuffer)
    const payload = JSON.parse(dataString)

    const signature: DigitalSignature = {
      signature: tokenObj.signature,
      algorithm: token.algorithm,
      keyId: tokenObj.keyId,
      timestamp: token.issuedAt,
      publicKey: tokenObj.publicKey,
    }

    const isValid = await verifyDigitalSignature(dataString, signature, maxAge)

    if (!isValid) {
      return { valid: false }
    }

    // Verify fingerprint
    const computedFingerprint = await createSecureHash(dataString)
    if (computedFingerprint !== token.fingerprint) {
      return { valid: false }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// Helper functions

function base64Encode(buffer: Uint8Array): string {
  const binary = String.fromCharCode.apply(null, Array.from(buffer))
  return btoa(binary)
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function generateSecureKeyId(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey)
  const hash = await crypto.subtle.digest('SHA-256', exported)
  const hashArray = new Uint8Array(hash)
  const hashBase64 = base64Encode(hashArray.slice(0, 16))
  return `ztsec_${hashBase64.replace(/[+/=]/g, '')}`
}

async function getCorrespondingPublicKey(privateKey: CryptoKey): Promise<CryptoKey> {
  // For testing and development - derive public key from private key
  // In production, you'd maintain the key pair relationship in secure storage

  // Get the algorithm info from the private key
  const keyData = await crypto.subtle.exportKey('jwk', privateKey)

  // Extract the public key from the private key
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: keyData.kty,
      crv: keyData.crv,
      x: keyData.x,
      y: keyData.y,
    } as JsonWebKey,
    {
      name: privateKey.algorithm.name,
      namedCurve: (privateKey.algorithm as EcKeyAlgorithm).namedCurve,
    },
    true,
    ['verify']
  )

  return publicKey
}

// Temporary key storage for testing (implement with secure storage in production)
const temporaryKeyStorage = new Map<string, SecureKeyPair>()

async function storeKeyPairSecurely(keyPair: SecureKeyPair, token: string): Promise<void> {
  // WARNING: This is for testing only - in production use secure storage
  temporaryKeyStorage.set(token, keyPair)
}

async function retrieveKeyPairSecurely(token: string): Promise<SecureKeyPair> {
  // WARNING: This is for testing only - in production use secure storage
  const keyPair = temporaryKeyStorage.get(token)
  if (!keyPair) {
    throw new Error('Key pair not found for token')
  }
  return keyPair
}

async function cleanupKeyExchange(token: string): Promise<void> {
  // WARNING: This is for testing only - in production use secure storage
  temporaryKeyStorage.delete(token)
}
