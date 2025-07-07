/**
 * API Key Rotation System Tests
 * Tests API key management, rotation, and validation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Redis } from '@redis/client'
import {
  ApiKeyManager,
  ApiKeyConfig,
  ApiKeyMetadata,
  apiKeyAuthMiddleware,
} from '@/lib/security/api-key-rotation'
import { SecurityError, SecurityErrorType } from '@/lib/security/error-boundaries'
import { auditLogger } from '@/lib/security/audit-logger'

// Mock Redis
vi.mock('@redis/client', () => ({
  Redis: vi.fn(),
}))

// Mock audit logger
vi.mock('@/lib/security/audit-logger', () => ({
  auditLogger: {
    log: vi.fn(),
  },
  AuditEventType: {
    SECURITY_CONFIG_CHANGE: 'SECURITY_CONFIG_CHANGE',
  },
  AuditSeverity: {
    INFO: 'INFO',
    WARNING: 'WARNING',
  },
}))

describe('ApiKeyManager', () => {
  let apiKeyManager: ApiKeyManager
  let mockRedis: any

  beforeEach(() => {
    mockRedis = {
      keys: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      multi: vi.fn(),
    }
    
    const multi = {
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }
    
    mockRedis.multi.mockReturnValue(multi)
    
    apiKeyManager = new ApiKeyManager({}, mockRedis)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('generateKey', () => {
    it('should generate a new API key', async () => {
      mockRedis.keys.mockResolvedValue([])
      
      const result = await apiKeyManager.generateKey(
        'user123',
        'Test Key',
        ['read', 'write'],
        { app: 'test' }
      )

      expect(result).toHaveProperty('key')
      expect(result).toHaveProperty('keyId')
      expect(result).toHaveProperty('expiresAt')
      expect(result.key).toMatch(/^sk_/)
      expect(result.expiresAt).toBeInstanceOf(Date)
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SECURITY_CONFIG_CHANGE',
          action: 'API key created',
        })
      )
    })

    it('should reject multiple keys when not allowed', async () => {
      const singleKeyManager = new ApiKeyManager(
        { allowMultipleKeys: false },
        mockRedis
      )
      
      // Mock existing key
      mockRedis.keys.mockResolvedValue(['apikey:user:user123:existing'])
      mockRedis.get.mockResolvedValue(JSON.stringify({
        id: 'existing',
        userId: 'user123',
        status: 'active',
      }))

      await expect(
        singleKeyManager.generateKey('user123', 'New Key', ['read'])
      ).rejects.toThrow('Multiple API keys not allowed')
    })

    it('should enforce maximum key limit', async () => {
      const limitedManager = new ApiKeyManager(
        { maxActiveKeys: 2 },
        mockRedis
      )
      
      // Mock 2 existing keys
      mockRedis.keys.mockResolvedValue([
        'apikey:user:user123:key1',
        'apikey:user:user123:key2',
      ])
      mockRedis.get.mockImplementation((key) => {
        if (key.includes('key1')) {
          return JSON.stringify({ id: 'key1', userId: 'user123', status: 'active' })
        }
        if (key.includes('key2')) {
          return JSON.stringify({ id: 'key2', userId: 'user123', status: 'active' })
        }
        return null
      })

      await expect(
        limitedManager.generateKey('user123', 'New Key', ['read'])
      ).rejects.toThrow('Maximum API keys reached')
    })
  })

  describe('validateKey', () => {
    it('should validate a valid key', async () => {
      const keyData: ApiKeyMetadata = {
        id: 'test123',
        userId: 'user123',
        name: 'Test Key',
        keyHash: 'mockhash',
        keyPrefix: 'sk_1234****',
        version: 1,
        permissions: ['read', 'write'],
        createdAt: new Date(),
        status: 'active',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(keyData))
      
      // Create a mock key and override hashKey method
      const manager = new ApiKeyManager({}, mockRedis)
      ;(manager as any).hashKey = vi.fn().mockReturnValue('mockhash')
      ;(manager as any).findKeyByHash = vi.fn().mockResolvedValue(keyData)

      const result = await manager.validateKey('sk_testkey')

      expect(result.valid).toBe(true)
      expect(result.userId).toBe('user123')
      expect(result.permissions).toEqual(['read', 'write'])
    })

    it('should reject invalid key format', async () => {
      const result = await apiKeyManager.validateKey('invalid_key')
      
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Invalid key format')
    })

    it('should reject revoked keys', async () => {
      const keyData: ApiKeyMetadata = {
        id: 'test123',
        userId: 'user123',
        name: 'Test Key',
        keyHash: 'mockhash',
        keyPrefix: 'sk_1234****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        status: 'revoked',
      }

      const manager = new ApiKeyManager({}, mockRedis)
      ;(manager as any).hashKey = vi.fn().mockReturnValue('mockhash')
      ;(manager as any).findKeyByHash = vi.fn().mockResolvedValue(keyData)

      const result = await manager.validateKey('sk_testkey')

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Key has been revoked')
    })

    it('should reject expired keys', async () => {
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      const keyData: ApiKeyMetadata = {
        id: 'test123',
        userId: 'user123',
        name: 'Test Key',
        keyHash: 'mockhash',
        keyPrefix: 'sk_1234****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        expiresAt: expiredDate,
        status: 'active',
      }

      const manager = new ApiKeyManager({}, mockRedis)
      ;(manager as any).hashKey = vi.fn().mockReturnValue('mockhash')
      ;(manager as any).findKeyByHash = vi.fn().mockResolvedValue(keyData)

      const result = await manager.validateKey('sk_testkey')

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('Key has expired')
    })

    it('should detect keys requiring rotation', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100) // 100 days old

      const keyData: ApiKeyMetadata = {
        id: 'test123',
        userId: 'user123',
        name: 'Test Key',
        keyHash: 'mockhash',
        keyPrefix: 'sk_1234****',
        version: 1,
        permissions: ['read'],
        createdAt: oldDate,
        status: 'active',
      }

      const manager = new ApiKeyManager(
        { rotationIntervalDays: 90, requireRotation: true },
        mockRedis
      )
      ;(manager as any).hashKey = vi.fn().mockReturnValue('mockhash')
      ;(manager as any).findKeyByHash = vi.fn().mockResolvedValue(keyData)

      const result = await manager.validateKey('sk_testkey')

      expect(result.valid).toBe(true)
      expect(result.requiresRotation).toBe(true)
    })
  })

  describe('rotateKey', () => {
    it('should rotate an active key', async () => {
      const oldKey: ApiKeyMetadata = {
        id: 'old123',
        userId: 'user123',
        name: 'Old Key',
        keyHash: 'oldhash',
        keyPrefix: 'sk_old****',
        version: 1,
        permissions: ['read', 'write'],
        createdAt: new Date(),
        status: 'active',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(oldKey))
      mockRedis.keys.mockResolvedValue([])

      const result = await apiKeyManager.rotateKey(
        'old123',
        'user123',
        'Security update'
      )

      expect(result).toHaveProperty('oldKeyId', 'old123')
      expect(result).toHaveProperty('newKey')
      expect(result).toHaveProperty('newKeyId')
      expect(result).toHaveProperty('gracePeriodEnd')
      expect(result.newKey).toMatch(/^sk_/)
    })

    it('should support immediate rotation', async () => {
      const oldKey: ApiKeyMetadata = {
        id: 'old123',
        userId: 'user123',
        name: 'Old Key',
        keyHash: 'oldhash',
        keyPrefix: 'sk_old****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        status: 'active',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(oldKey))
      mockRedis.keys.mockResolvedValue([])

      const result = await apiKeyManager.rotateKey(
        'old123',
        'user123',
        'Immediate rotation',
        true
      )

      expect(result).not.toHaveProperty('gracePeriodEnd')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'API key revoked',
        })
      )
    })

    it('should reject rotation of non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null)

      await expect(
        apiKeyManager.rotateKey('nonexistent', 'user123', 'Test')
      ).rejects.toThrow('API key not found')
    })

    it('should reject rotation of inactive key', async () => {
      const inactiveKey: ApiKeyMetadata = {
        id: 'inactive123',
        userId: 'user123',
        name: 'Inactive Key',
        keyHash: 'hash',
        keyPrefix: 'sk_****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        status: 'revoked',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(inactiveKey))

      await expect(
        apiKeyManager.rotateKey('inactive123', 'user123', 'Test')
      ).rejects.toThrow('Cannot rotate inactive key')
    })
  })

  describe('revokeKey', () => {
    it('should revoke an active key', async () => {
      const activeKey: ApiKeyMetadata = {
        id: 'active123',
        userId: 'user123',
        name: 'Active Key',
        keyHash: 'hash',
        keyPrefix: 'sk_****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        status: 'active',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(activeKey))

      await apiKeyManager.revokeKey('active123', 'user123', 'No longer needed')

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'API key revoked',
          metadata: expect.objectContaining({
            keyId: 'active123',
            reason: 'No longer needed',
          }),
        })
      )
    })

    it('should reject revocation by wrong user', async () => {
      const key: ApiKeyMetadata = {
        id: 'key123',
        userId: 'user123',
        name: 'Key',
        keyHash: 'hash',
        keyPrefix: 'sk_****',
        version: 1,
        permissions: ['read'],
        createdAt: new Date(),
        status: 'active',
      }

      mockRedis.get.mockResolvedValue(JSON.stringify(key))

      await expect(
        apiKeyManager.revokeKey('key123', 'wronguser', 'Test')
      ).rejects.toThrow('API key not found')
    })
  })

  describe('getUserKeys', () => {
    it('should return user keys filtered by status', async () => {
      const keys = [
        'apikey:user:user123:key1',
        'apikey:user:user123:key2',
        'apikey:user:user123:key3',
      ]

      const keyData = [
        { id: 'key1', userId: 'user123', status: 'active', createdAt: new Date() },
        { id: 'key2', userId: 'user123', status: 'revoked', createdAt: new Date() },
        { id: 'key3', userId: 'user123', status: 'active', createdAt: new Date() },
      ]

      mockRedis.keys.mockResolvedValue(keys)
      mockRedis.get.mockImplementation((key) => {
        const index = keys.indexOf(key)
        return index >= 0 ? JSON.stringify(keyData[index]) : null
      })

      const activeKeys = await apiKeyManager.getUserKeys('user123', 'active')

      expect(activeKeys).toHaveLength(2)
      expect(activeKeys.every(k => k.status === 'active')).toBe(true)
    })
  })

  describe('getKeysRequiringRotation', () => {
    it('should identify keys requiring rotation', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)

      const keys = [
        'apikey:key1',
        'apikey:key2',
        'apikey:key3',
      ]

      const keyData = [
        { id: 'key1', status: 'active', createdAt: oldDate },
        { id: 'key2', status: 'active', createdAt: new Date() },
        { id: 'key3', status: 'revoked', createdAt: oldDate },
      ]

      mockRedis.keys.mockResolvedValue(keys)
      mockRedis.get.mockImplementation((key) => {
        const index = keys.indexOf(key)
        return index >= 0 ? JSON.stringify(keyData[index]) : null
      })

      const manager = new ApiKeyManager(
        { rotationIntervalDays: 90, requireRotation: true },
        mockRedis
      )

      const keysToRotate = await manager.getKeysRequiringRotation()

      expect(keysToRotate).toHaveLength(1)
      expect(keysToRotate[0].id).toBe('key1')
    })
  })

  describe('cleanupExpiredKeys', () => {
    it('should remove expired keys', async () => {
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1)

      const keys = [
        'apikey:key1',
        'apikey:key2',
        'apikey:key3',
      ]

      const keyData = [
        { id: 'key1', status: 'rotating', expiresAt: expiredDate },
        { id: 'key2', status: 'active', expiresAt: new Date() },
        { id: 'key3', status: 'expired', expiresAt: expiredDate },
      ]

      mockRedis.keys.mockResolvedValue(keys)
      mockRedis.get.mockImplementation((key) => {
        const index = keys.indexOf(key)
        return index >= 0 ? JSON.stringify(keyData[index]) : null
      })

      const cleaned = await apiKeyManager.cleanupExpiredKeys()

      expect(cleaned).toBe(2)
      expect(mockRedis.del).toHaveBeenCalledTimes(2)
    })
  })
})

describe('apiKeyAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract API key from header', async () => {
    const request = new Request('http://example.com', {
      headers: {
        'X-API-Key': 'sk_testkey',
      },
    })

    const validateSpy = vi.spyOn(apiKeyManager, 'validateKey')
      .mockResolvedValue({
        valid: true,
        keyId: 'test123',
        userId: 'user123',
        permissions: ['read'],
      })

    const result = await apiKeyAuthMiddleware(request)

    expect(validateSpy).toHaveBeenCalledWith('sk_testkey')
    expect(result?.valid).toBe(true)
  })

  it('should extract API key from query parameter', async () => {
    const request = new Request('http://example.com?api_key=sk_testkey')

    const validateSpy = vi.spyOn(apiKeyManager, 'validateKey')
      .mockResolvedValue({
        valid: true,
        keyId: 'test123',
        userId: 'user123',
        permissions: ['read'],
      })

    const result = await apiKeyAuthMiddleware(request)

    expect(validateSpy).toHaveBeenCalledWith('sk_testkey')
    expect(result?.valid).toBe(true)
  })

  it('should extract API key from cookie', async () => {
    const request = new Request('http://example.com', {
      headers: {
        cookie: 'session=abc; api_key=sk_testkey; other=xyz',
      },
    })

    const validateSpy = vi.spyOn(apiKeyManager, 'validateKey')
      .mockResolvedValue({
        valid: true,
        keyId: 'test123',
        userId: 'user123',
        permissions: ['read'],
      })

    const result = await apiKeyAuthMiddleware(request, {
      headerName: undefined,
      queryParam: undefined,
      cookieName: 'api_key',
    })

    expect(validateSpy).toHaveBeenCalledWith('sk_testkey')
    expect(result?.valid).toBe(true)
  })

  it('should throw error when key is required but missing', async () => {
    const request = new Request('http://example.com')

    await expect(
      apiKeyAuthMiddleware(request, { required: true })
    ).rejects.toThrow('API key required')
  })

  it('should return null when key is optional and missing', async () => {
    const request = new Request('http://example.com')

    const result = await apiKeyAuthMiddleware(request, { required: false })

    expect(result).toBeNull()
  })

  it('should throw error for invalid key when required', async () => {
    const request = new Request('http://example.com', {
      headers: {
        'X-API-Key': 'sk_invalid',
      },
    })

    vi.spyOn(apiKeyManager, 'validateKey').mockResolvedValue({
      valid: false,
      reason: 'Invalid API key',
    })

    await expect(
      apiKeyAuthMiddleware(request, { required: true })
    ).rejects.toThrow('Invalid API key')
  })
})