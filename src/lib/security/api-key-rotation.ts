/**
 * API Key Rotation System
 * Provides secure API key management with automatic rotation capabilities
 * Implements key versioning, gradual migration, and audit logging
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { Redis } from '@redis/client'
import { auditLogger, AuditEventType, AuditSeverity } from './audit-logger'
import { SecurityError, SecurityErrorType } from './error-boundaries'

// API Key configuration
export interface ApiKeyConfig {
  keyLength: number // Length of generated keys
  hashAlgorithm: 'sha256' | 'sha512' // Algorithm for key hashing
  rotationIntervalDays: number // Days before key rotation
  gracePeriodDays: number // Days old keys remain valid after rotation
  maxActiveKeys: number // Maximum number of active keys per user
  keyPrefix?: string // Prefix for generated keys
  allowMultipleKeys: boolean // Allow multiple active keys
  requireRotation: boolean // Force rotation after interval
}

// API Key metadata
export interface ApiKeyMetadata {
  id: string
  userId: string
  name: string
  keyHash: string
  keyPrefix: string // First few characters for identification
  version: number
  permissions: string[]
  createdAt: Date
  lastUsedAt?: Date
  expiresAt?: Date
  rotatedFrom?: string // Previous key ID if rotated
  status: 'active' | 'expired' | 'revoked' | 'rotating'
  metadata?: Record<string, unknown>
}

// Key validation result
export interface KeyValidationResult {
  valid: boolean
  keyId?: string
  userId?: string
  permissions?: string[]
  reason?: string
  requiresRotation?: boolean
}

// Key rotation schema
export const ApiKeyRotationSchema = z.object({
  userId: z.string(),
  keyId: z.string(),
  reason: z.string(),
  immediate: z.boolean().default(false),
})

/**
 * API Key Manager
 */
export class ApiKeyManager {
  private config: ApiKeyConfig
  private redis: Redis | null
  private cache: Map<string, ApiKeyMetadata> = new Map()
  
  constructor(
    config: Partial<ApiKeyConfig> = {},
    redis?: Redis
  ) {
    this.config = {
      keyLength: 32,
      hashAlgorithm: 'sha256',
      rotationIntervalDays: 90,
      gracePeriodDays: 30,
      maxActiveKeys: 5,
      keyPrefix: 'sk_',
      allowMultipleKeys: true,
      requireRotation: true,
      ...config,
    }
    this.redis = redis || null
  }
  
  /**
   * Generate a new API key
   */
  async generateKey(
    userId: string,
    name: string,
    permissions: string[],
    metadata?: Record<string, unknown>
  ): Promise<{
    key: string
    keyId: string
    expiresAt: Date
  }> {
    // Check active key limit
    const activeKeys = await this.getUserKeys(userId, 'active')
    if (!this.config.allowMultipleKeys && activeKeys.length > 0) {
      throw new SecurityError(
        SecurityErrorType.AUTHORIZATION,
        'Multiple API keys not allowed',
        400,
        undefined,
        'Only one active API key is allowed per user'
      )
    }
    
    if (activeKeys.length >= this.config.maxActiveKeys) {
      throw new SecurityError(
        SecurityErrorType.AUTHORIZATION,
        'Maximum API keys reached',
        400,
        { current: activeKeys.length, max: this.config.maxActiveKeys },
        `Maximum of ${this.config.maxActiveKeys} active keys allowed`
      )
    }
    
    // Generate key
    const keyBytes = randomBytes(this.config.keyLength)
    const key = this.config.keyPrefix + keyBytes.toString('base64url')
    const keyHash = this.hashKey(key)
    const keyId = randomBytes(16).toString('hex')
    
    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + this.config.rotationIntervalDays)
    
    // Create metadata
    const keyMetadata: ApiKeyMetadata = {
      id: keyId,
      userId,
      name,
      keyHash,
      keyPrefix: key.slice(0, 8) + '****',
      version: 1,
      permissions,
      createdAt: new Date(),
      expiresAt,
      status: 'active',
      metadata,
    }
    
    // Store in database
    await this.storeKey(keyMetadata)
    
    // Log key creation
    await auditLogger.log({
      type: AuditEventType.SECURITY_CONFIG_CHANGE,
      severity: AuditSeverity.INFO,
      actor: {
        id: userId,
        type: 'user',
      },
      action: 'API key created',
      result: 'success',
      metadata: {
        keyId,
        name,
        permissions,
        expiresAt,
      },
    })
    
    return {
      key,
      keyId,
      expiresAt,
    }
  }
  
  /**
   * Validate an API key
   */
  async validateKey(key: string): Promise<KeyValidationResult> {
    try {
      // Extract and validate format
      if (!key.startsWith(this.config.keyPrefix || '')) {
        return {
          valid: false,
          reason: 'Invalid key format',
        }
      }
      
      const keyHash = this.hashKey(key)
      
      // Check cache first
      const cachedKey = Array.from(this.cache.values())
        .find(k => k.keyHash === keyHash)
      
      if (cachedKey) {
        return this.validateKeyMetadata(cachedKey)
      }
      
      // Search in database
      const keyMetadata = await this.findKeyByHash(keyHash)
      
      if (!keyMetadata) {
        return {
          valid: false,
          reason: 'Invalid API key',
        }
      }
      
      // Update cache
      this.cache.set(keyMetadata.id, keyMetadata)
      
      // Update last used
      await this.updateLastUsed(keyMetadata.id)
      
      return this.validateKeyMetadata(keyMetadata)
    } catch (error) {
      console.error('[ApiKeyManager] Validation error:', error)
      return {
        valid: false,
        reason: 'Validation error',
      }
    }
  }
  
  /**
   * Rotate an API key
   */
  async rotateKey(
    keyId: string,
    userId: string,
    reason: string,
    immediate = false
  ): Promise<{
    oldKeyId: string
    newKey: string
    newKeyId: string
    gracePeriodEnd?: Date
  }> {
    // Get existing key
    const oldKey = await this.getKey(keyId)
    
    if (!oldKey || oldKey.userId !== userId) {
      throw new SecurityError(
        SecurityErrorType.AUTHORIZATION,
        'API key not found',
        404
      )
    }
    
    if (oldKey.status !== 'active') {
      throw new SecurityError(
        SecurityErrorType.VALIDATION,
        'Cannot rotate inactive key',
        400
      )
    }
    
    // Generate new key with same permissions
    const result = await this.generateKey(
      userId,
      `${oldKey.name} (Rotated)`,
      oldKey.permissions,
      {
        ...oldKey.metadata,
        rotatedFrom: keyId,
        rotationReason: reason,
      }
    )
    
    // Update old key status
    if (immediate) {
      await this.revokeKey(keyId, userId, `Rotated: ${reason}`)
    } else {
      // Set grace period
      const gracePeriodEnd = new Date()
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.config.gracePeriodDays)
      
      await this.updateKeyStatus(keyId, 'rotating', gracePeriodEnd)
      
      // Log rotation
      await auditLogger.log({
        type: AuditEventType.SECURITY_CONFIG_CHANGE,
        severity: AuditSeverity.INFO,
        actor: {
          id: userId,
          type: 'user',
        },
        action: 'API key rotated',
        result: 'success',
        metadata: {
          oldKeyId: keyId,
          newKeyId: result.keyId,
          reason,
          gracePeriodEnd,
          immediate,
        },
      })
      
      return {
        oldKeyId: keyId,
        newKey: result.key,
        newKeyId: result.keyId,
        gracePeriodEnd,
      }
    }
    
    return {
      oldKeyId: keyId,
      newKey: result.key,
      newKeyId: result.keyId,
    }
  }
  
  /**
   * Revoke an API key
   */
  async revokeKey(
    keyId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    const key = await this.getKey(keyId)
    
    if (!key || key.userId !== userId) {
      throw new SecurityError(
        SecurityErrorType.AUTHORIZATION,
        'API key not found',
        404
      )
    }
    
    await this.updateKeyStatus(keyId, 'revoked')
    
    // Remove from cache
    this.cache.delete(keyId)
    
    // Log revocation
    await auditLogger.log({
      type: AuditEventType.SECURITY_CONFIG_CHANGE,
      severity: AuditSeverity.WARNING,
      actor: {
        id: userId,
        type: 'user',
      },
      action: 'API key revoked',
      result: 'success',
      metadata: {
        keyId,
        reason,
      },
    })
  }
  
  /**
   * Get user's API keys
   */
  async getUserKeys(
    userId: string,
    status?: ApiKeyMetadata['status']
  ): Promise<ApiKeyMetadata[]> {
    if (!this.redis) {
      // In-memory fallback
      return Array.from(this.cache.values())
        .filter(k => k.userId === userId && (!status || k.status === status))
    }
    
    const pattern = `apikey:user:${userId}:*`
    const keys = await this.redis.keys(pattern)
    
    const metadata: ApiKeyMetadata[] = []
    for (const key of keys) {
      const data = await this.redis.get(key)
      if (data) {
        try {
          const keyMeta = JSON.parse(data) as ApiKeyMetadata
          if (!status || keyMeta.status === status) {
            metadata.push(keyMeta)
          }
        } catch {}
      }
    }
    
    return metadata.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )
  }
  
  /**
   * Check keys requiring rotation
   */
  async getKeysRequiringRotation(): Promise<ApiKeyMetadata[]> {
    const now = new Date()
    const rotationThreshold = new Date()
    rotationThreshold.setDate(
      rotationThreshold.getDate() - this.config.rotationIntervalDays
    )
    
    if (!this.redis) {
      return Array.from(this.cache.values())
        .filter(k => 
          k.status === 'active' &&
          k.createdAt < rotationThreshold &&
          this.config.requireRotation
        )
    }
    
    // Query from database
    const keys: ApiKeyMetadata[] = []
    const pattern = 'apikey:*'
    const allKeys = await this.redis.keys(pattern)
    
    for (const key of allKeys) {
      const data = await this.redis.get(key)
      if (data) {
        try {
          const keyMeta = JSON.parse(data) as ApiKeyMetadata
          if (
            keyMeta.status === 'active' &&
            new Date(keyMeta.createdAt) < rotationThreshold &&
            this.config.requireRotation
          ) {
            keys.push(keyMeta)
          }
        } catch {}
      }
    }
    
    return keys
  }
  
  /**
   * Cleanup expired keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    const now = new Date()
    let cleaned = 0
    
    if (!this.redis) {
      // In-memory cleanup
      for (const [id, key] of this.cache.entries()) {
        if (
          (key.status === 'rotating' || key.status === 'expired') &&
          key.expiresAt &&
          key.expiresAt < now
        ) {
          this.cache.delete(id)
          cleaned++
        }
      }
      return cleaned
    }
    
    // Database cleanup
    const pattern = 'apikey:*'
    const allKeys = await this.redis.keys(pattern)
    
    for (const key of allKeys) {
      const data = await this.redis.get(key)
      if (data) {
        try {
          const keyMeta = JSON.parse(data) as ApiKeyMetadata
          if (
            (keyMeta.status === 'rotating' || keyMeta.status === 'expired') &&
            keyMeta.expiresAt &&
            new Date(keyMeta.expiresAt) < now
          ) {
            await this.redis.del(key)
            cleaned++
          }
        } catch {}
      }
    }
    
    return cleaned
  }
  
  /**
   * Hash an API key
   */
  private hashKey(key: string): string {
    return createHash(this.config.hashAlgorithm)
      .update(key)
      .digest('hex')
  }
  
  /**
   * Validate key metadata
   */
  private validateKeyMetadata(
    metadata: ApiKeyMetadata
  ): KeyValidationResult {
    const now = new Date()
    
    // Check status
    if (metadata.status === 'revoked') {
      return {
        valid: false,
        reason: 'Key has been revoked',
      }
    }
    
    if (metadata.status === 'expired') {
      return {
        valid: false,
        reason: 'Key has expired',
      }
    }
    
    // Check expiration
    if (metadata.expiresAt && metadata.expiresAt < now) {
      return {
        valid: false,
        reason: 'Key has expired',
      }
    }
    
    // Check if rotation is required
    const rotationThreshold = new Date()
    rotationThreshold.setDate(
      rotationThreshold.getDate() - this.config.rotationIntervalDays
    )
    
    const requiresRotation = 
      metadata.createdAt < rotationThreshold &&
      this.config.requireRotation
    
    return {
      valid: true,
      keyId: metadata.id,
      userId: metadata.userId,
      permissions: metadata.permissions,
      requiresRotation,
    }
  }
  
  /**
   * Store key in database
   */
  private async storeKey(metadata: ApiKeyMetadata): Promise<void> {
    const key = `apikey:${metadata.id}`
    const userKey = `apikey:user:${metadata.userId}:${metadata.id}`
    const hashKey = `apikey:hash:${metadata.keyHash}`
    
    if (this.redis) {
      const data = JSON.stringify(metadata)
      const ttl = metadata.expiresAt
        ? Math.floor((metadata.expiresAt.getTime() - Date.now()) / 1000)
        : undefined
      
      const multi = this.redis.multi()
      
      // Store main key
      if (ttl) {
        multi.set(key, data, { EX: ttl })
        multi.set(userKey, data, { EX: ttl })
        multi.set(hashKey, metadata.id, { EX: ttl })
      } else {
        multi.set(key, data)
        multi.set(userKey, data)
        multi.set(hashKey, metadata.id)
      }
      
      await multi.exec()
    }
    
    // Also store in cache
    this.cache.set(metadata.id, metadata)
  }
  
  /**
   * Find key by hash
   */
  private async findKeyByHash(
    keyHash: string
  ): Promise<ApiKeyMetadata | null> {
    if (!this.redis) {
      return Array.from(this.cache.values())
        .find(k => k.keyHash === keyHash) || null
    }
    
    const keyId = await this.redis.get(`apikey:hash:${keyHash}`)
    if (!keyId) return null
    
    return this.getKey(keyId)
  }
  
  /**
   * Get key by ID
   */
  private async getKey(keyId: string): Promise<ApiKeyMetadata | null> {
    if (this.cache.has(keyId)) {
      return this.cache.get(keyId)!
    }
    
    if (!this.redis) return null
    
    const data = await this.redis.get(`apikey:${keyId}`)
    if (!data) return null
    
    try {
      return JSON.parse(data) as ApiKeyMetadata
    } catch {
      return null
    }
  }
  
  /**
   * Update key status
   */
  private async updateKeyStatus(
    keyId: string,
    status: ApiKeyMetadata['status'],
    expiresAt?: Date
  ): Promise<void> {
    const key = await this.getKey(keyId)
    if (!key) return
    
    key.status = status
    if (expiresAt) {
      key.expiresAt = expiresAt
    }
    
    await this.storeKey(key)
  }
  
  /**
   * Update last used timestamp
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const key = await this.getKey(keyId)
    if (!key) return
    
    key.lastUsedAt = new Date()
    await this.storeKey(key)
  }
}

// Export default instance
export const apiKeyManager = new ApiKeyManager()

/**
 * API Key authentication middleware
 */
export async function apiKeyAuthMiddleware(
  request: Request,
  config?: {
    headerName?: string
    queryParam?: string
    cookieName?: string
    required?: boolean
  }
): Promise<KeyValidationResult | null> {
  const options = {
    headerName: 'X-API-Key',
    queryParam: 'api_key',
    required: true,
    ...config,
  }
  
  // Extract API key from request
  let apiKey: string | null = null
  
  // Check header
  if (options.headerName) {
    apiKey = request.headers.get(options.headerName)
  }
  
  // Check query parameter
  if (!apiKey && options.queryParam) {
    const url = new URL(request.url)
    apiKey = url.searchParams.get(options.queryParam)
  }
  
  // Check cookie
  if (!apiKey && options.cookieName) {
    const cookies = request.headers.get('cookie')
    if (cookies) {
      const match = cookies.match(new RegExp(`${options.cookieName}=([^;]+)`))
      if (match) {
        apiKey = match[1]
      }
    }
  }
  
  // No key found
  if (!apiKey) {
    if (options.required) {
      throw new SecurityError(
        SecurityErrorType.AUTHENTICATION,
        'API key required',
        401,
        undefined,
        'Missing API key'
      )
    }
    return null
  }
  
  // Validate key
  const result = await apiKeyManager.validateKey(apiKey)
  
  if (!result.valid && options.required) {
    throw new SecurityError(
      SecurityErrorType.AUTHENTICATION,
      'Invalid API key',
      401,
      { reason: result.reason },
      result.reason
    )
  }
  
  return result
}