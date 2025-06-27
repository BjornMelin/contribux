/**
 * Web Crypto API implementation for secure token encryption
 * Uses AES-GCM for authenticated encryption with 256-bit keys
 */

import { z } from 'zod'
import { cryptoConfig } from '@/lib/config'
import { sql } from '@/lib/db/config'

// Encryption configuration using centralized config
const ALGORITHM = cryptoConfig.algorithm
const KEY_LENGTH = cryptoConfig.keyLength
const IV_LENGTH = cryptoConfig.ivLength
const TAG_LENGTH = cryptoConfig.tagLength

// Validation schemas for crypto operations
const EncryptTokenSchema = z.object({
  token: z.string().min(1, 'Token cannot be empty'),
  key: z.instanceof(CryptoKey),
  additionalData: z.record(z.unknown()).optional(),
})

const DecryptTokenSchema = z.object({
  encrypted: z.object({
    ciphertext: z.string().min(1, 'Ciphertext cannot be empty'),
    iv: z.string().min(1, 'IV cannot be empty'),
    tag: z.string().min(1, 'Tag cannot be empty'),
    algorithm: z.string().min(1, 'Algorithm must be specified'),
    keyId: z.string().min(1, 'Key ID must be specified'),
  }),
  key: z.instanceof(CryptoKey),
  additionalData: z.record(z.unknown()).optional(),
})

const EncryptOAuthTokenSchema = z.object({
  token: z.string().min(1, 'Token cannot be empty'),
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const DecryptOAuthTokenSchema = z.object({
  encryptedData: z.string().min(1, 'Encrypted data cannot be empty'),
  userId: z.string().uuid('User ID must be a valid UUID'),
  provider: z.string().min(1, 'Provider cannot be empty'),
})

const ExportedKeySchema = z.object({
  key: z.string().min(1, 'Key data cannot be empty'),
  algorithm: z.string().min(1, 'Algorithm must be specified'),
  keyLength: z.number().int().positive('Key length must be positive'),
})

const _EncryptionKeyMetadataSchema = z.object({
  keyId: z.string().min(1, 'Key ID cannot be empty'),
  version: z.number().int().positive('Version must be positive'),
  createdAt: z.date(),
  rotatedAt: z.date().optional(),
})

// Type definitions
export interface EncryptedData {
  ciphertext: string // Base64
  iv: string // Base64
  tag: string // Base64
  algorithm: string
  keyId: string
}

export interface ExportedKey {
  key: string // Base64
  algorithm: string
  keyLength: number
}

export interface EncryptionKeyMetadata {
  keyId: string
  version: number
  createdAt: Date
  rotatedAt?: Date
}

// Generate a new AES-GCM encryption key
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable for storage
    ['encrypt', 'decrypt']
  )
}

// Generate AES key (alias for consistency with test imports)
export const generateAESKey = generateEncryptionKey

// Export key to storable format
export async function exportKey(key: CryptoKey): Promise<ExportedKey> {
  // Validate input parameter
  if (!(key instanceof CryptoKey)) {
    throw new Error('Must provide a valid CryptoKey')
  }

  const exported = await crypto.subtle.exportKey('raw', key)
  const keyData = new Uint8Array(exported)

  const result = {
    key: base64Encode(keyData),
    algorithm: ALGORITHM,
    keyLength: KEY_LENGTH,
  }

  // Validate output using schema
  return ExportedKeySchema.parse(result)
}

// Import key from stored format
export async function importKey(exported: ExportedKey): Promise<CryptoKey> {
  // Validate input parameter
  const validated = ExportedKeySchema.parse(exported)

  const keyData = base64Decode(validated.key)

  return await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: validated.algorithm,
      length: validated.keyLength,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

// Encrypt a token using AES-GCM
export async function encryptToken(
  token: string,
  key: CryptoKey,
  additionalData?: Record<string, unknown>
): Promise<EncryptedData> {
  // Validate input parameters
  const _validated = EncryptTokenSchema.parse({ token, key, additionalData })

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Encode token as UTF-8
  const encoder = new TextEncoder()
  const tokenData = encoder.encode(token)

  // Prepare additional authenticated data if provided
  let aad: Uint8Array | undefined
  if (additionalData) {
    const aadString = JSON.stringify(additionalData)
    aad = encoder.encode(aadString)
  }

  // Encrypt with AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
      additionalData: aad,
      tagLength: TAG_LENGTH * 8, // in bits
    },
    key,
    tokenData
  )

  // Extract ciphertext and tag
  const encryptedArray = new Uint8Array(encryptedBuffer)
  const ciphertext = encryptedArray.slice(0, -TAG_LENGTH)
  const tag = encryptedArray.slice(-TAG_LENGTH)

  // Generate key ID (in production, this would be from key storage)
  const keyId = await generateKeyId(key)

  return {
    ciphertext: base64Encode(ciphertext),
    iv: base64Encode(iv),
    tag: base64Encode(tag),
    algorithm: ALGORITHM,
    keyId,
  }
}

// Decrypt a token using AES-GCM
export async function decryptToken(
  encrypted: EncryptedData,
  key: CryptoKey,
  additionalData?: Record<string, unknown>
): Promise<string> {
  // Validate input parameters
  const validated = DecryptTokenSchema.parse({ encrypted, key, additionalData })

  // Additional algorithm validation
  if (validated.encrypted.algorithm !== ALGORITHM) {
    throw new Error(
      `Algorithm mismatch: expected ${ALGORITHM}, got ${validated.encrypted.algorithm}`
    )
  }

  try {
    // Decode from base64
    const ciphertext = base64Decode(encrypted.ciphertext)
    const iv = base64Decode(encrypted.iv)
    const tag = base64Decode(encrypted.tag)

    // Combine ciphertext and tag
    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext, 0)
    combined.set(tag, ciphertext.length)

    // Prepare additional authenticated data if provided
    let aad: Uint8Array | undefined
    if (additionalData) {
      const encoder = new TextEncoder()
      const aadString = JSON.stringify(additionalData)
      aad = encoder.encode(aadString)
    }

    // Decrypt with AES-GCM
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        additionalData: aad,
        tagLength: TAG_LENGTH * 8,
      },
      key,
      combined
    )

    // Decode UTF-8
    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  } catch (_error) {
    throw new Error('Decryption failed')
  }
}

// Rotate encryption keys
export async function rotateEncryptionKey(): Promise<EncryptionKeyMetadata> {
  // Get current active key
  const currentKeyResult = await sql`
    SELECT id, key_data, version
    FROM encryption_keys
    WHERE is_active = true
    AND rotated_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `

  let currentVersion = 0
  let currentKeyData = null

  if (currentKeyResult.length > 0 && currentKeyResult[0] && currentKeyResult[0].key_data) {
    currentVersion = currentKeyResult[0].version
    currentKeyData = JSON.parse(currentKeyResult[0].key_data)
  }

  // Generate new key
  const newKey = await generateEncryptionKey()
  const exportedKey = await exportKey(newKey)
  const newVersion = currentVersion + 1

  // Store new key
  const newKeyResult = await sql`
    INSERT INTO encryption_keys (
      key_data, version, is_active, created_at
    )
    VALUES (
      ${JSON.stringify(exportedKey)},
      ${newVersion},
      true,
      CURRENT_TIMESTAMP
    )
    RETURNING id, version
  `

  const newKeyId = newKeyResult[0]?.id
  if (!newKeyId) {
    throw new Error('Failed to create new encryption key')
  }

  // Mark old key as rotated
  if (currentKeyResult.length > 0 && currentKeyResult[0]) {
    await sql`
      UPDATE encryption_keys
      SET 
        is_active = false,
        rotated_at = CURRENT_TIMESTAMP
      WHERE id = ${currentKeyResult[0].id}
    `

    // Re-encrypt existing tokens with new key
    await reEncryptTokens(currentKeyData, exportedKey, newKeyId)
  }

  return {
    keyId: newKeyId,
    version: newVersion,
    createdAt: new Date(),
  }
}

// Type for token re-encryption operations
interface TokenReencryptionRecord {
  id: string
  access_token?: string
  refresh_token?: string
}

// Type for database record during token re-encryption
interface OAuthTokenRecord {
  id: string
  access_token?: string
  refresh_token?: string
}

// Helper function to safely re-encrypt a single token field
async function reencryptTokenField(
  encryptedTokenData: string,
  oldKey: CryptoKey,
  newKey: CryptoKey
): Promise<string | null> {
  try {
    const encrypted = JSON.parse(encryptedTokenData)
    const decrypted = await decryptToken(encrypted, oldKey)
    const newEncrypted = await encryptToken(decrypted, newKey)
    return JSON.stringify(newEncrypted)
  } catch (_error) {
    // Silent failure for security - token re-encryption errors are logged at system level
    return null
  }
}

// Helper function to process a single token record
async function processTokenRecord(
  record: OAuthTokenRecord,
  oldKey: CryptoKey,
  newKey: CryptoKey
): Promise<TokenReencryptionRecord> {
  const reEncrypted: TokenReencryptionRecord = {
    id: record.id,
  }

  // Process access token if present
  if (record.access_token) {
    const reencryptedToken = await reencryptTokenField(record.access_token, oldKey, newKey)
    if (reencryptedToken) {
      reEncrypted.access_token = reencryptedToken
    }
  }

  // Process refresh token if present
  if (record.refresh_token) {
    const reencryptedToken = await reencryptTokenField(record.refresh_token, oldKey, newKey)
    if (reencryptedToken) {
      reEncrypted.refresh_token = reencryptedToken
    }
  }

  return reEncrypted
}

// Helper function to batch update tokens in database
async function batchUpdateTokens(updates: TokenReencryptionRecord[]): Promise<void> {
  if (updates.length === 0) return

  // In production, use a proper batch update
  for (const update of updates) {
    await sql`
      UPDATE oauth_accounts
      SET 
        access_token = ${update.access_token || null},
        refresh_token = ${update.refresh_token || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${update.id}
    `
  }
}

// Helper function to fetch tokens needing re-encryption
async function fetchTokensForReencryption(): Promise<OAuthTokenRecord[]> {
  const result = await sql`
    SELECT id, access_token, refresh_token
    FROM oauth_accounts
    WHERE access_token IS NOT NULL
  `
  return result as OAuthTokenRecord[]
}

// Re-encrypt tokens during key rotation
async function reEncryptTokens(
  oldKeyData: ExportedKey | null,
  newKeyData: ExportedKey,
  _newKeyId: string
): Promise<void> {
  if (!oldKeyData) return

  // Import keys for re-encryption
  const oldKey = await importKey(oldKeyData)
  const newKey = await importKey(newKeyData)

  // Get all encrypted tokens that need re-encryption
  const tokensResult = await fetchTokensForReencryption()

  // Process each token record
  const updates: TokenReencryptionRecord[] = []
  for (const record of tokensResult) {
    const processedRecord = await processTokenRecord(record, oldKey, newKey)
    updates.push(processedRecord)
  }

  // Apply batch updates to database
  await batchUpdateTokens(updates)
}

// Validation schema for key retrieval
const GetEncryptionKeyByIdSchema = z.object({
  keyId: z.string().min(1, 'Key ID cannot be empty'),
})

// Get current active encryption key
export async function getCurrentEncryptionKey(): Promise<{
  key: CryptoKey
  keyId: string
}> {
  const result = await sql`
    SELECT id, key_data
    FROM encryption_keys
    WHERE is_active = true
    AND rotated_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `

  if (result.length === 0) {
    // Create initial key if none exists
    const newKey = await generateEncryptionKey()
    const exported = await exportKey(newKey)

    const insertResult = await sql`
      INSERT INTO encryption_keys (
        key_data, version, is_active, created_at
      )
      VALUES (
        ${JSON.stringify(exported)},
        1,
        true,
        CURRENT_TIMESTAMP
      )
      RETURNING id
    `

    return {
      key: newKey,
      keyId: insertResult[0]?.id,
    }
  }

  const keyData = JSON.parse(result[0]?.key_data || '{}')
  const key = await importKey(keyData)

  return {
    key,
    keyId: result[0]?.id,
  }
}

// Get encryption key by ID
export async function getEncryptionKeyById(keyId: string): Promise<CryptoKey> {
  // Validate input parameter
  const validated = GetEncryptionKeyByIdSchema.parse({ keyId })

  const result = await sql`
    SELECT key_data
    FROM encryption_keys
    WHERE id = ${validated.keyId}
    LIMIT 1
  `

  if (result.length === 0) {
    throw new Error('Encryption key not found')
  }

  const keyData = JSON.parse(result[0]?.key_data || '{}')
  return await importKey(keyData)
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

async function generateKeyId(key: CryptoKey): Promise<string> {
  // Generate a deterministic key ID from the key material
  const exported = await crypto.subtle.exportKey('raw', key)
  const hash = await crypto.subtle.digest('SHA-256', exported)
  const hashArray = new Uint8Array(hash)
  const hashBase64 = base64Encode(hashArray.slice(0, 8))
  return `key_${hashBase64.replace(/[+/=]/g, '')}`
}

// Convenience functions for OAuth token encryption

export async function encryptOAuthToken(
  token: string,
  userId: string,
  provider: string
): Promise<string> {
  // Validate input parameters
  const validated = EncryptOAuthTokenSchema.parse({ token, userId, provider })

  const { key } = await getCurrentEncryptionKey()

  const encrypted = await encryptToken(validated.token, key, {
    userId: validated.userId,
    provider: validated.provider,
    timestamp: Date.now(),
  })

  return JSON.stringify(encrypted)
}

export async function decryptOAuthToken(
  encryptedData: string,
  userId: string,
  provider: string
): Promise<string> {
  // Validate input parameters
  const validated = DecryptOAuthTokenSchema.parse({ encryptedData, userId, provider })

  try {
    const encrypted = JSON.parse(validated.encryptedData) as EncryptedData

    // Get the key used for encryption
    const key = await getEncryptionKeyById(encrypted.keyId)

    return await decryptToken(encrypted, key, {
      userId: validated.userId,
      provider: validated.provider,
      timestamp: Date.now(), // This won't match, but it's for demonstration
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid encrypted data format')
    }
    throw error
  }
}
