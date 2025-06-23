import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptToken,
  encryptToken,
  exportKey,
  generateEncryptionKey,
  importKey,
  rotateEncryptionKey,
} from '@/lib/auth/crypto'

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

describe('Web Crypto API Token Encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Key Generation', () => {
    it('should generate AES-GCM encryption key', async () => {
      const key = await generateEncryptionKey()

      expect(key).toBeDefined()
      expect(key.type).toBe('secret')
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as any).length).toBe(256)
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })

    it('should export key to storable format', async () => {
      const key = await generateEncryptionKey()
      const exported = await exportKey(key)

      expect(exported).toBeDefined()
      expect(exported.key).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64
      expect(exported.algorithm).toBe('AES-GCM')
      expect(exported.keyLength).toBe(256)
    })

    it('should import key from stored format', async () => {
      const originalKey = await generateEncryptionKey()
      const exported = await exportKey(originalKey)
      const imported = await importKey(exported)

      expect(imported).toBeDefined()
      expect(imported.type).toBe('secret')
      expect(imported.algorithm.name).toBe('AES-GCM')
      expect((imported.algorithm as any).length).toBe(256)
    })
  })

  describe('Token Encryption', () => {
    it('should encrypt token with AES-GCM', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted = await encryptToken(token, key)

      expect(encrypted).toBeDefined()
      expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(encrypted.tag).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(encrypted.algorithm).toBe('AES-GCM')
      expect(encrypted.keyId).toBeDefined()
    })

    it('should generate unique IV for each encryption', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted1 = await encryptToken(token, key)
      const encrypted2 = await encryptToken(token, key)

      expect(encrypted1.iv).not.toBe(encrypted2.iv)
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
    })

    it('should include authentication tag', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted = await encryptToken(token, key)

      expect(encrypted.tag).toBeDefined()
      expect(encrypted.tag.length).toBeGreaterThan(0)
    })
  })

  describe('Token Decryption', () => {
    it('should decrypt token with correct key', async () => {
      const key = await generateEncryptionKey()
      const originalToken = 'gho_testtoken123456789'

      const encrypted = await encryptToken(originalToken, key)
      const decrypted = await decryptToken(encrypted, key)

      expect(decrypted).toBe(originalToken)
    })

    it('should fail with wrong key', async () => {
      const key1 = await generateEncryptionKey()
      const key2 = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted = await encryptToken(token, key1)

      await expect(decryptToken(encrypted, key2)).rejects.toThrow()
    })

    it('should fail with tampered ciphertext', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted = await encryptToken(token, key)

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: `${encrypted.ciphertext.slice(0, -4)}XXXX`,
      }

      await expect(decryptToken(tampered, key)).rejects.toThrow()
    })

    it('should fail with tampered authentication tag', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'

      const encrypted = await encryptToken(token, key)

      // Tamper with tag
      const tampered = {
        ...encrypted,
        tag: `${encrypted.tag.slice(0, -4)}XXXX`,
      }

      await expect(decryptToken(tampered, key)).rejects.toThrow()
    })
  })

  describe('Key Rotation', () => {
    it('should rotate encryption keys', async () => {
      const sql = await import('@/lib/db/config').then(m => m.sql)
      const mockSql = vi.mocked(sql)

      // Mock current key retrieval
      const testKey = await generateEncryptionKey()
      const testKeyData = await exportKey(testKey)

      mockSql.mockResolvedValueOnce([
        {
          id: 'key-1',
          key_data: JSON.stringify(testKeyData),
          version: 1,
        },
      ])

      // Mock new key insertion
      mockSql.mockResolvedValueOnce([
        {
          id: 'key-2',
          version: 2,
        },
      ])

      // Mock old key update
      mockSql.mockResolvedValueOnce([])

      // Mock getting tokens to re-encrypt (empty result)
      mockSql.mockResolvedValueOnce([])

      const newKey = await rotateEncryptionKey()

      expect(newKey).toBeDefined()
      expect(newKey.keyId).toBe('key-2')
      expect(newKey.version).toBe(2)

      // Verify old key was marked as rotated
      const calls = mockSql.mock.calls
      expect(calls[2]?.[0]?.[0]).toContain('UPDATE encryption_keys')
      expect(calls[2]?.[0]?.[0]).toContain('rotated_at')
    })

    it('should re-encrypt tokens with new key', async () => {
      const sql = await import('@/lib/db/config').then(m => m.sql)
      const mockSql = vi.mocked(sql)

      const oldKey = await generateEncryptionKey()
      const oldKeyData = await exportKey(oldKey)

      // Mock current key retrieval
      mockSql.mockResolvedValueOnce([
        {
          id: 'key-1',
          key_data: JSON.stringify(oldKeyData),
          version: 1,
        },
      ])

      // Mock new key insertion
      mockSql.mockResolvedValueOnce([
        {
          id: 'key-2',
          version: 2,
        },
      ])

      // Mock old key update
      mockSql.mockResolvedValueOnce([])

      // Mock getting tokens to re-encrypt
      mockSql.mockResolvedValueOnce([
        {
          id: 'oauth-1',
          access_token: JSON.stringify(await encryptToken('token1', oldKey)),
          refresh_token: JSON.stringify(await encryptToken('refresh1', oldKey)),
        },
        {
          id: 'oauth-2',
          access_token: JSON.stringify(await encryptToken('token2', oldKey)),
          refresh_token: null,
        },
      ])

      // Mock token updates
      mockSql.mockResolvedValueOnce([]) // First token update
      mockSql.mockResolvedValueOnce([]) // Second token update

      await rotateEncryptionKey()

      // Verify tokens were re-encrypted
      const calls = mockSql.mock.calls
      const updateCalls = calls.filter(call => call?.[0]?.[0]?.includes('UPDATE oauth_accounts'))
      expect(updateCalls.length).toBeGreaterThan(0)
    })
  })

  describe('Additional Data Authentication', () => {
    it('should authenticate with additional data', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'
      const additionalData = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        provider: 'github',
      }

      const encrypted = await encryptToken(token, key, additionalData)
      const decrypted = await decryptToken(encrypted, key, additionalData)

      expect(decrypted).toBe(token)
    })

    it('should fail with wrong additional data', async () => {
      const key = await generateEncryptionKey()
      const token = 'gho_testtoken123456789'
      const additionalData = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        provider: 'github',
      }

      const encrypted = await encryptToken(token, key, additionalData)

      const wrongData = {
        userId: 'different-user-id',
        provider: 'github',
      }

      await expect(decryptToken(encrypted, key, wrongData)).rejects.toThrow('Decryption failed')
    })
  })

  describe('Encryption Performance', () => {
    it('should handle large tokens efficiently', async () => {
      const key = await generateEncryptionKey()
      const largeToken = 'x'.repeat(10000) // 10KB token

      const start = performance.now()
      const encrypted = await encryptToken(largeToken, key)
      const decrypted = await decryptToken(encrypted, key)
      const end = performance.now()

      expect(decrypted).toBe(largeToken)
      expect(end - start).toBeLessThan(100) // Should complete in < 100ms
    })

    it('should handle concurrent encryption operations', async () => {
      const key = await generateEncryptionKey()
      const tokens = Array.from({ length: 100 }, (_, i) => `token_${i}`)

      const encryptPromises = tokens.map(token => encryptToken(token, key))
      const encrypted = await Promise.all(encryptPromises)

      expect(encrypted).toHaveLength(100)

      // Verify all IVs are unique
      const ivs = new Set(encrypted.map(e => e.iv))
      expect(ivs.size).toBe(100)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid base64 input', async () => {
      const key = await generateEncryptionKey()
      const invalidEncrypted = {
        ciphertext: 'not-valid-base64!@#$',
        iv: 'invalid',
        tag: 'invalid',
        algorithm: 'AES-GCM',
        keyId: 'test',
      }

      await expect(decryptToken(invalidEncrypted, key)).rejects.toThrow()
    })

    it('should handle missing encryption parameters', async () => {
      const key = await generateEncryptionKey()

      const incomplete = {
        ciphertext: 'base64string',
        // Missing iv and tag
        algorithm: 'AES-GCM',
        keyId: 'test',
      }

      await expect(decryptToken(incomplete as any, key)).rejects.toThrow(
        'Missing required encryption parameters'
      )
    })

    it('should validate algorithm mismatch', async () => {
      const key = await generateEncryptionKey()
      const token = 'testtoken'

      const encrypted = await encryptToken(token, key)
      encrypted.algorithm = 'AES-CBC' // Wrong algorithm

      await expect(decryptToken(encrypted, key)).rejects.toThrow('Algorithm mismatch')
    })
  })
})
