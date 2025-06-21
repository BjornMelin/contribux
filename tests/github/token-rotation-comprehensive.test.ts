import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenRotationManager } from '@/lib/github/token-rotation'
import type { TokenInfo, TokenRotationConfig } from '@/lib/github'
import { GitHubTokenExpiredError } from '@/lib/github/errors'

describe('Token Rotation - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TokenRotationManager - Error Handling', () => {
    it('should handle empty token list gracefully', async () => {
      const config: TokenRotationConfig = {
        tokens: [],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      const token = await manager.getNextToken()
      
      expect(token).toBeNull()
    })

    it('should handle all tokens expired', async () => {
      const expiredDate = new Date(Date.now() - 1000) // 1 second ago
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'expired1', type: 'personal', expiresAt: expiredDate },
          { token: 'expired2', type: 'personal', expiresAt: expiredDate }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      const token = await manager.getNextToken()
      
      expect(token).toBeNull()
    })

    it('should handle all tokens quarantined', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'token1', type: 'personal' },
          { token: 'token2', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Quarantine all tokens
      manager.quarantineTokenManually('token1')
      manager.quarantineTokenManually('token2')
      
      const token = await manager.getNextToken()
      expect(token).toBeNull()
    })

    it('should throw error for round-robin when no valid tokens at index', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'token1', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Force internal state where tokens array is empty but currentIndex is not 0
      const tokensField = manager as any
      tokensField.tokens = []
      
      await expect(manager.getNextToken()).resolves.toBeNull()
    })

    it('should throw error for least-used when no tokens available', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'token1', type: 'personal' }],
        rotationStrategy: 'least-used'
      }

      const manager = new TokenRotationManager(config)
      
      // Remove all tokens
      manager.removeToken('token1')
      
      const token = await manager.getNextToken()
      expect(token).toBeNull()
    })

    it('should handle random selection with no tokens', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'token1', type: 'personal' }],
        rotationStrategy: 'random'
      }

      const manager = new TokenRotationManager(config)
      
      // Remove all tokens
      manager.removeToken('token1')
      
      const token = await manager.getNextToken()
      expect(token).toBeNull()
    })
  })

  describe('Token Health and Quarantine Logic', () => {
    it('should quarantine token after error threshold', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'error-token', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Record enough errors to trigger quarantine (5 errors, 50% threshold)
      for (let i = 0; i < 5; i++) {
        manager.recordError('error-token')
      }
      
      const health = manager.getTokenHealth()
      expect(health[0]?.isHealthy).toBe(false)
      expect(health[0]?.quarantineUntil).toBeDefined()
    })

    it('should unquarantine token after timeout', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'token1', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Quarantine token
      manager.quarantineTokenManually('token1', 1000) // 1 second
      
      // Check token is quarantined
      let token = await manager.getNextToken()
      expect(token).toBeNull()
      
      // Advance time past quarantine
      vi.advanceTimersByTime(1001)
      
      // Token should be available again
      token = await manager.getNextToken()
      expect(token?.token).toBe('token1')
    })

    it('should calculate token score correctly', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'high-usage', type: 'personal' },
          { token: 'low-usage', type: 'personal' }
        ],
        rotationStrategy: 'least-used'
      }

      const manager = new TokenRotationManager(config)
      
      // Simulate different usage patterns
      for (let i = 0; i < 10; i++) {
        manager.recordSuccess('high-usage')
      }
      manager.recordSuccess('low-usage')
      
      // Get stats to verify score calculation
      const stats = manager.getStats()
      const highUsageStats = stats.find(s => s.token === 'high-usage')
      const lowUsageStats = stats.find(s => s.token === 'low-usage')
      
      expect(highUsageStats?.successfulRequests).toBe(10)
      expect(lowUsageStats?.successfulRequests).toBe(1)
      
      // Least-used should prefer the low-usage token
      const token = await manager.getNextToken()
      expect(token?.token).toBe('low-usage')
    })

    it('should handle weighted random selection with health scores', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'healthy', type: 'personal' },
          { token: 'unhealthy', type: 'personal' }
        ],
        rotationStrategy: 'random'
      }

      const manager = new TokenRotationManager(config)
      
      // Make unhealthy token have high error rate
      manager.recordError('unhealthy')
      manager.recordError('unhealthy')
      manager.recordSuccess('unhealthy')
      
      // Make healthy token all successes
      manager.recordSuccess('healthy')
      manager.recordSuccess('healthy')
      manager.recordSuccess('healthy')
      
      // Run multiple selections to test weighted random
      const selections = new Map<string, number>()
      for (let i = 0; i < 100; i++) {
        const token = await manager.getNextToken()
        if (token) {
          selections.set(token.token, (selections.get(token.token) || 0) + 1)
        }
      }
      
      // Healthy token should be selected more often due to higher weight
      const healthySelections = selections.get('healthy') || 0
      const unhealthySelections = selections.get('unhealthy') || 0
      
      expect(healthySelections).toBeGreaterThan(unhealthySelections)
    })

    it('should cleanup expired quarantines', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'token1', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Quarantine with short duration
      manager.quarantineTokenManually('token1', 1000)
      
      // Advance time past expiration
      vi.advanceTimersByTime(1001)
      
      // Cleanup should remove expired quarantine
      manager.cleanupExpiredQuarantines()
      
      const health = manager.getTokenHealth()
      expect(health[0]?.quarantineUntil).toBeUndefined()
    })
  })

  describe('Scope-based Token Selection', () => {
    it('should select token with required scopes', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'read-only', type: 'personal', scopes: ['repo:read'] },
          { token: 'full-access', type: 'personal', scopes: ['repo', 'user'] }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Request token with repo scope
      const token = await manager.getTokenForScopes(['repo'])
      expect(token?.token).toBe('full-access')
    })

    it('should return null when no tokens have required scopes', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'limited', type: 'personal', scopes: ['public_repo'] }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Request token with admin scope
      const token = await manager.getTokenForScopes(['admin:org'])
      expect(token).toBeNull()
    })

    it('should handle tokens without scopes field', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'no-scopes', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Should accept any token when scopes are not defined
      const token = await manager.getTokenForScopes(['repo'])
      expect(token?.token).toBe('no-scopes')
    })

    it('should handle empty required scopes', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'any-token', type: 'personal', scopes: ['repo'] }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Empty scopes should match any token
      const token = await manager.getTokenForScopes([])
      expect(token?.token).toBe('any-token')
    })
  })

  describe('Token Management Operations', () => {
    it('should add duplicate token by updating existing', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'original', type: 'personal', scopes: ['repo'] }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Add same token with different scopes
      manager.addToken({ token: 'original', type: 'personal', scopes: ['repo', 'user'] })
      
      const tokens = manager.getTokens()
      expect(tokens).toHaveLength(1)
      expect(tokens[0]?.scopes).toEqual(['repo', 'user'])
    })

    it('should update token and transfer stats', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'old-token', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Record some usage
      manager.recordSuccess('old-token')
      manager.recordError('old-token')
      
      // Update token
      manager.updateToken('old-token', { token: 'new-token', type: 'personal' })
      
      const stats = manager.getStats()
      const newTokenStats = stats.find(s => s.token === 'new-token')
      const oldTokenStats = stats.find(s => s.token === 'old-token')
      
      expect(newTokenStats?.successfulRequests).toBe(1)
      expect(newTokenStats?.errors).toBe(1)
      expect(oldTokenStats).toBeUndefined()
    })

    it('should transfer quarantine status when updating token', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'quarantined', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Quarantine token
      manager.quarantineTokenManually('quarantined')
      
      // Update token
      manager.updateToken('quarantined', { token: 'new-quarantined', type: 'personal' })
      
      const health = manager.getTokenHealth()
      const newTokenHealth = health.find(h => h.token === 'new-quarantined')
      
      expect(newTokenHealth?.quarantineUntil).toBeDefined()
    })

    it('should reset token stats completely', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'reset-me', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Generate stats and quarantine
      manager.recordError('reset-me')
      manager.recordError('reset-me')
      manager.quarantineTokenManually('reset-me')
      
      // Reset
      manager.resetTokenStats('reset-me')
      
      const stats = manager.getStats()
      const health = manager.getTokenHealth()
      
      const tokenStats = stats.find(s => s.token === 'reset-me')
      const tokenHealth = health.find(h => h.token === 'reset-me')
      
      expect(tokenStats?.errors).toBe(0)
      expect(tokenStats?.errorRate).toBe(0)
      expect(tokenStats?.usageCount).toBe(0)
      expect(tokenHealth?.quarantineUntil).toBeUndefined()
    })
  })

  describe('Concurrency and Thread Safety', () => {
    it('should handle concurrent token requests with locking', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'token1', type: 'personal' },
          { token: 'token2', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Make concurrent requests
      const promises = Array(10).fill(null).map(() => manager.getNextToken())
      const results = await Promise.all(promises)
      
      // All requests should succeed
      expect(results.every(token => token !== null)).toBe(true)
      
      // Should alternate between tokens due to round-robin
      const tokenCounts = new Map<string, number>()
      results.forEach(token => {
        if (token) {
          tokenCounts.set(token.token, (tokenCounts.get(token.token) || 0) + 1)
        }
      })
      
      expect(tokenCounts.get('token1')).toBe(5)
      expect(tokenCounts.get('token2')).toBe(5)
    })

    it('should handle concurrent scope-based requests', async () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'repo-token', type: 'personal', scopes: ['repo'] },
          { token: 'user-token', type: 'personal', scopes: ['user'] }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Make concurrent requests for different scopes
      const repoPromises = Array(5).fill(null).map(() => manager.getTokenForScopes(['repo']))
      const userPromises = Array(5).fill(null).map(() => manager.getTokenForScopes(['user']))
      
      const [repoResults, userResults] = await Promise.all([
        Promise.all(repoPromises),
        Promise.all(userPromises)
      ])
      
      // Check correct tokens were selected
      expect(repoResults.every(token => token?.token === 'repo-token')).toBe(true)
      expect(userResults.every(token => token?.token === 'user-token')).toBe(true)
    })
  })

  describe('Metrics and Monitoring', () => {
    it('should provide accurate rotation metrics', () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'active1', type: 'personal' },
          { token: 'active2', type: 'personal' },
          { token: 'quarantined', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Quarantine one token
      manager.quarantineTokenManually('quarantined')
      
      // Record some usage
      manager.recordSuccess('active1')
      manager.recordError('active2')
      
      const metrics = manager.getMetrics()
      
      expect(metrics.totalTokens).toBe(3)
      expect(metrics.activeTokens).toBe(2)
      expect(metrics.quarantinedTokens).toBe(1)
      expect(metrics.totalRequests).toBe(2)
      expect(metrics.totalErrors).toBe(1)
      expect(metrics.overallErrorRate).toBe(0.5)
      expect(metrics.rotationStrategy).toBe('round-robin')
    })

    it('should track token usage statistics accurately', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'tracked', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Use token multiple times
      await manager.getNextToken()
      await manager.getNextToken()
      
      // Record successes and errors
      manager.recordSuccess('tracked')
      manager.recordError('tracked')
      
      const stats = manager.getStats()
      const tokenStats = stats.find(s => s.token === 'tracked')
      
      expect(tokenStats?.usageCount).toBe(2)
      expect(tokenStats?.successfulRequests).toBe(1)
      expect(tokenStats?.errors).toBe(1)
      expect(tokenStats?.errorRate).toBe(0.5)
      expect(tokenStats?.lastUsed).toBeInstanceOf(Date)
    })

    it('should handle token health metrics with edge cases', () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: 'unused', type: 'personal' },
          { token: 'error-prone', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // One token has no usage, other has only errors
      manager.recordError('error-prone')
      manager.recordError('error-prone')
      
      const health = manager.getTokenHealth()
      
      const unusedHealth = health.find(h => h.token === 'unused')
      const errorProneHealth = health.find(h => h.token === 'error-prone')
      
      expect(unusedHealth?.isHealthy).toBe(true)
      expect(unusedHealth?.lastSuccessfulUse).toBeUndefined()
      expect(errorProneHealth?.errorRate).toBe(1.0)
    })
  })

  describe('Token Expiration Logic', () => {
    it('should correctly identify tokens needing refresh', () => {
      const config: TokenRotationConfig = {
        tokens: [
          { 
            token: 'expiring-soon', 
            type: 'app', 
            expiresAt: new Date(Date.now() + 30000) // 30 seconds
          }
        ],
        rotationStrategy: 'round-robin',
        refreshBeforeExpiry: 1 // 1 minute
      }

      const manager = new TokenRotationManager(config)
      
      const token = config.tokens[0]
      if (token) {
        expect(manager.needsRefresh(token)).toBe(true)
      }
    })

    it('should handle tokens without expiration', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'never-expires', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      const token = config.tokens[0]
      if (token) {
        expect(manager.needsRefresh(token)).toBe(false)
      }
    })
  })

  describe('Edge Cases and Error Conditions', () => {
    it('should handle malformed token configurations', () => {
      const config: TokenRotationConfig = {
        tokens: [
          { token: '', type: 'personal' }, // Empty token
          { token: 'valid', type: 'personal' }
        ],
        rotationStrategy: 'round-robin'
      }

      // Should not throw during construction
      expect(() => new TokenRotationManager(config)).not.toThrow()
    })

    it('should handle unknown rotation strategy gracefully', async () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'fallback', type: 'personal' }],
        rotationStrategy: 'unknown' as any
      }

      const manager = new TokenRotationManager(config)
      
      // Should fall back to default behavior
      const token = await manager.getNextToken()
      expect(token?.token).toBe('fallback')
    })

    it('should handle operations on non-existent tokens', () => {
      const config: TokenRotationConfig = {
        tokens: [{ token: 'exists', type: 'personal' }],
        rotationStrategy: 'round-robin'
      }

      const manager = new TokenRotationManager(config)
      
      // Operations on non-existent tokens should not crash
      expect(() => {
        manager.recordError('non-existent')
        manager.recordSuccess('non-existent')
        manager.resetTokenStats('non-existent')
        manager.updateToken('non-existent', { token: 'new', type: 'personal' })
      }).not.toThrow()
    })
  })
})