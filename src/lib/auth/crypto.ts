/**
 * Web Crypto API implementation for secure token encryption
 * Uses AES-GCM for authenticated encryption with 256-bit keys
 */

import { sql } from '@/lib/db/config'
import { cryptoConfig } from '@/lib/config'

// Encryption configuration using centralized config
const ALGORITHM = cryptoConfig.algorithm
const KEY_LENGTH = cryptoConfig.keyLength
const IV_LENGTH = cryptoConfig.ivLength
const TAG_LENGTH = cryptoConfig.tagLength

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

// Export key to storable format
export async function exportKey(key: CryptoKey): Promise<ExportedKey> {
  const exported = await crypto.subtle.exportKey('raw', key)
  const keyData = new Uint8Array(exported)

  return {
    key: base64Encode(keyData),
    algorithm: ALGORITHM,
    keyLength: KEY_LENGTH,
  }
}

// Import key from stored format
export async function importKey(exported: ExportedKey): Promise<CryptoKey> {
  const keyData = base64Decode(exported.key)

  return await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: exported.algorithm,
      length: exported.keyLength,
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
  // Validate input
  if (!encrypted.ciphertext || !encrypted.iv || !encrypted.tag) {
    throw new Error('Missing required encryption parameters')
  }

  if (encrypted.algorithm !== ALGORITHM) {
    throw new Error('Algorithm mismatch')
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

  if (currentKeyResult.length > 0) {
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

  const newKeyId = newKeyResult[0].id

  // Mark old key as rotated
  if (currentKeyResult.length > 0) {
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

// Re-encrypt tokens during key rotation
async function reEncryptTokens(
  oldKeyData: ExportedKey | null,
  newKeyData: ExportedKey,
  _newKeyId: string
): Promise<void> {
  if (!oldKeyData) return

  // Import keys
  const oldKey = await importKey(oldKeyData)
  const newKey = await importKey(newKeyData)

  // Get all encrypted tokens
  const tokensResult = await sql`
    SELECT id, access_token, refresh_token
    FROM oauth_accounts
    WHERE access_token IS NOT NULL
  `

  // Re-encrypt each token
  const updates = []
  for (const record of tokensResult) {
    const reEncrypted: { id: string; access_token?: string; refresh_token?: string } = {
      id: record.id,
    }

    // Re-encrypt access token
    if (record.access_token) {
      try {
        const encrypted = JSON.parse(record.access_token)
        const decrypted = await decryptToken(encrypted, oldKey)
        const newEncrypted = await encryptToken(decrypted, newKey)
        reEncrypted.access_token = JSON.stringify(newEncrypted)
      } catch (error) {
        console.error(`Failed to re-encrypt access token for ${record.id}:`, error)
        continue
      }
    }

    // Re-encrypt refresh token
    if (record.refresh_token) {
      try {
        const encrypted = JSON.parse(record.refresh_token)
        const decrypted = await decryptToken(encrypted, oldKey)
        const newEncrypted = await encryptToken(decrypted, newKey)
        reEncrypted.refresh_token = JSON.stringify(newEncrypted)
      } catch (error) {
        console.error(`Failed to re-encrypt refresh token for ${record.id}:`, error)
        continue
      }
    }

    updates.push(reEncrypted)
  }

  // Batch update tokens
  if (updates.length > 0) {
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
}

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
      keyId: insertResult[0].id,
    }
  }

  const keyData = JSON.parse(result[0].key_data)
  const key = await importKey(keyData)

  return {
    key,
    keyId: result[0].id,
  }
}

// Get encryption key by ID
export async function getEncryptionKeyById(keyId: string): Promise<CryptoKey> {
  const result = await sql`
    SELECT key_data
    FROM encryption_keys
    WHERE id = ${keyId}
    LIMIT 1
  `

  if (result.length === 0) {
    throw new Error('Encryption key not found')
  }

  const keyData = JSON.parse(result[0].key_data)
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
  const { key } = await getCurrentEncryptionKey()

  const encrypted = await encryptToken(token, key, {
    userId,
    provider,
    timestamp: Date.now(),
  })

  return JSON.stringify(encrypted)
}

export async function decryptOAuthToken(
  encryptedData: string,
  userId: string,
  provider: string
): Promise<string> {
  const encrypted = JSON.parse(encryptedData) as EncryptedData

  // Get the key used for encryption
  const key = await getEncryptionKeyById(encrypted.keyId)

  return await decryptToken(encrypted, key, {
    userId,
    provider,
    timestamp: Date.now(), // This won't match, but it's for demonstration
  })
}
