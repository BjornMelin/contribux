import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenRotationManager } from '@/lib/github/token-rotation'
import type { TokenInfo, TokenRotationConfig } from '@/lib/github'

describe('GitHub Token Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Token rotation strategies', () => {
    it('should use round-robin strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Get tokens in sequence to verify round-robin
      const usedTokens: string[] = []
      for (let i = 0; i < 6; i++) {
        const token = await manager.getNextToken()
        if (token) {
          usedTokens.push(token.token)
        }
      }

      // Verify round-robin pattern - it should cycle through all tokens
      expect(usedTokens.length).toBe(6)
      
      // Each token should appear exactly twice in the 6 calls
      const tokenCounts = usedTokens.reduce((counts, token) => {
        counts[token] = (counts[token] || 0) + 1
        return counts
      }, {} as Record<string, number>)
      
      expect(tokenCounts['token1']).toBe(2)
      expect(tokenCounts['token2']).toBe(2)
      expect(tokenCounts['token3']).toBe(2)
    })

    it('should use least-used strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'least-used'
      }

      const manager = new TokenRotationManager(config)

      // Track token usage
      const tokenUsage: Map<string, number> = new Map()
      
      // Make requests and track usage
      for (let i = 0; i < 9; i++) {
        const token = await manager.getNextToken()
        if (token) {
          manager.recordSuccess(token.token)
          tokenUsage.set(token.token, (tokenUsage.get(token.token) || 0) + 1)
        }
      }

      // All tokens should be used roughly equally
      const usageCounts = Array.from(tokenUsage.values())
      const maxUsage = Math.max(...usageCounts)
      const minUsage = Math.min(...usageCounts)
      expect(maxUsage - minUsage).toBeLessThanOrEqual(1)
    })

    it('should use random strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'random'
      }

      const manager = new TokenRotationManager(config)
      const tokenUsage = new Set<string>()
      
      // Make multiple requests
      for (let i = 0; i < 20; i++) {
        const token = await manager.getNextToken()
        if (token) {
          tokenUsage.add(token.token)
        }
      }

      // All tokens should be used at least once
      expect(tokenUsage.size).toBe(3)
    })
  })

  describe('Token expiration handling', () => {
    it('should detect tokens needing refresh using fake timers', async () => {
      // Set initial fake time
      const initialTime = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(initialTime)

      const expiresIn5Min = new Date(initialTime + 5 * 60 * 1000)
      
      const tokens: TokenInfo[] = [
        {
          token: 'expiring-token',
          type: 'app',
          expiresAt: expiresIn5Min
        }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin',
        refreshBeforeExpiry: 10 // 10 minutes
      }

      const manager = new TokenRotationManager(config)

      // Token should need refresh since it expires in 5 minutes but refresh threshold is 10 minutes
      const token = await manager.getNextToken()
      expect(token).toBeTruthy()
      
      if (token) {
        const needsRefresh = manager.needsRefresh(token)
        expect(needsRefresh).toBe(true)
      }
    })

    it('should handle expired tokens gracefully using fake timers', async () => {
      // Set initial fake time
      const initialTime = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(initialTime)

      const expiredToken = new Date(initialTime - 60 * 1000) // Expired 1 minute ago
      
      const tokens: TokenInfo[] = [
        {
          token: 'expired-token',
          type: 'personal',
          expiresAt: expiredToken
        },
        {
          token: 'valid-token',
          type: 'personal'
        }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      const token = await manager.getNextToken()

      // Should skip expired token and use valid one
      expect(token?.token).toBe('valid-token')
    })
  })

  describe('Token health and quarantine', () => {
    it('should quarantine tokens with high error rates using fake timers', async () => {
      // Set initial fake time
      const initialTime = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(initialTime)

      const tokens: TokenInfo[] = [
        { token: 'good-token', type: 'personal' },
        { token: 'bad-token', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Simulate multiple errors for the bad token
      for (let i = 0; i < 5; i++) {
        manager.recordError('bad-token')
      }

      // Get token health
      const health = manager.getTokenHealth()
      const badTokenHealth = health.find(h => h.token === 'bad-token')
      
      expect(badTokenHealth?.isHealthy).toBe(false)
      expect(badTokenHealth?.errorRate).toBeGreaterThan(0.5)
    })

    it('should recover from quarantine after timeout using fake timers', async () => {
      // Set initial fake time
      const initialTime = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(initialTime)

      const tokens: TokenInfo[] = [
        { token: 'quarantined-token', type: 'personal' },
        { token: 'good-token', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Manually quarantine a token
      manager.quarantineTokenManually('quarantined-token', 5 * 60 * 1000) // 5 minutes

      // Initially should not return quarantined token
      const token1 = await manager.getNextToken()
      expect(token1?.token).toBe('good-token')

      // Advance time past quarantine period
      vi.setSystemTime(initialTime + 6 * 60 * 1000) // Advance 6 minutes

      // Now should be able to get quarantined token again
      const token2 = await manager.getNextToken()
      expect(token2?.token).toBe('quarantined-token')
    })
  })

  describe('Token scopes and permissions', () => {
    it('should track token scopes for personal access tokens', async () => {
      const tokens: TokenInfo[] = [
        {
          token: 'read-token',
          type: 'personal',
          scopes: ['repo:read', 'user:read']
        },
        {
          token: 'write-token',
          type: 'personal',
          scopes: ['repo', 'user', 'admin:org']
        }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      const tokenInfo = manager.getTokens()
      
      expect(tokenInfo).toHaveLength(2)
      expect(tokenInfo[0]?.scopes).toContain('repo:read')
      expect(tokenInfo[1]?.scopes).toContain('admin:org')
    })

    it('should select token based on required scopes', async () => {
      const tokens: TokenInfo[] = [
        {
          token: 'limited-token',
          type: 'personal',
          scopes: ['public_repo']
        },
        {
          token: 'full-token',
          type: 'personal',
          scopes: ['repo', 'admin:org', 'user']
        }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Request token for admin operations
      const token = await manager.getTokenForScopes(['admin:org'])

      // Should automatically select the token with required scope
      expect(token?.token).toBe('full-token')
    })
  })

  describe('Thread safety and concurrency', () => {
    it('should handle concurrent token rotation safely', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      const tokenUsage = new Map<string, number>()
      
      // Make concurrent requests
      const promises = Array(30).fill(null).map(async () => {
        const token = await manager.getNextToken()
        if (token) {
          tokenUsage.set(token.token, (tokenUsage.get(token.token) || 0) + 1)
        }
      })

      await Promise.all(promises)

      // Each token should be used exactly 10 times in round-robin
      expect(tokenUsage.get('token1')).toBe(10)
      expect(tokenUsage.get('token2')).toBe(10)
      expect(tokenUsage.get('token3')).toBe(10)
    })

    it('should manage token metrics properly using fake timers', async () => {
      // Set initial fake time
      const initialTime = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(initialTime)

      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' }
      ]

      const config: TokenRotationConfig = {
        tokens,
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Use tokens to generate usage count (totalRequests in metrics)
      await manager.getNextToken() // token1 usage
      await manager.getNextToken() // token2 usage
      await manager.getNextToken() // token1 usage
      
      // Record some successes and errors
      manager.recordSuccess('token1')
      manager.recordSuccess('token1')
      manager.recordError('token1')
      
      manager.recordSuccess('token2')
      manager.recordError('token2')
      manager.recordError('token2')

      const metrics = manager.getMetrics()
      
      expect(metrics.totalTokens).toBe(2)
      expect(metrics.activeTokens).toBe(2)
      expect(metrics.totalRequests).toBeGreaterThan(0) // Now should be 3 (usage count)
      expect(metrics.rotationStrategy).toBe('round-robin')
    })
  })

  describe('Token rotation configuration', () => {
    it('should allow dynamic token management', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'initial-token', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)

      // Add new token
      manager.addToken({
        token: 'new-token',
        type: 'personal',
        scopes: ['repo', 'user']
      })

      let tokens = manager.getTokens()
      expect(tokens).toHaveLength(2)
      expect(tokens.some(t => t.token === 'new-token')).toBe(true)

      // Remove a token
      manager.removeToken('initial-token')

      tokens = manager.getTokens()
      expect(tokens).toHaveLength(1)
      expect(tokens.some(t => t.token === 'initial-token')).toBe(false)
    })
  })
})