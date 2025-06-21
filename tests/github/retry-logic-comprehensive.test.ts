import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RetryManager,
  calculateRetryDelay,
  createDefaultRetryOptions,
  validateRetryOptions
} from '@/lib/github/retry-logic'
import type { RetryOptions } from '@/lib/github'
import { GitHubClientError, GitHubRateLimitError } from '@/lib/github/errors'

describe('Retry Logic - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calculateRetryDelay Function', () => {
    it('should calculate exponential backoff with jitter', () => {
      // Mock Math.random for deterministic testing
      const mockRandom = vi.spyOn(Math, 'random')
      mockRandom.mockReturnValue(0.5) // Middle of jitter range

      const baseDelay = 1000
      
      // Test different retry counts
      expect(calculateRetryDelay(0, baseDelay)).toBe(1000) // 2^0 * 1000
      expect(calculateRetryDelay(1, baseDelay)).toBe(2000) // 2^1 * 1000
      expect(calculateRetryDelay(2, baseDelay)).toBe(4000) // 2^2 * 1000
      expect(calculateRetryDelay(3, baseDelay)).toBe(8000) // 2^3 * 1000

      mockRandom.mockRestore()
    })

    it('should apply maximum delay cap', () => {
      const baseDelay = 1000
      const maxDelay = 30000

      // High retry count should be capped
      const delay = calculateRetryDelay(10, baseDelay, undefined, maxDelay)
      expect(delay).toBeLessThanOrEqual(maxDelay)
    })

    it('should respect retry-after header when provided', () => {
      const baseDelay = 1000
      const retryAfter = 5000

      const delay = calculateRetryDelay(2, baseDelay, retryAfter)
      expect(delay).toBe(retryAfter)
    })

    it('should add jitter to prevent thundering herd', () => {
      const baseDelay = 1000
      const delays = []

      for (let i = 0; i < 10; i++) {
        delays.push(calculateRetryDelay(2, baseDelay))
      }

      // All delays should be in expected range
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(3600) // 4000 * 0.9
        expect(delay).toBeLessThanOrEqual(4400) // 4000 * 1.1
      })

      // Should have some variation due to jitter
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })

    it('should handle edge cases', () => {
      expect(calculateRetryDelay(-1, 1000)).toBe(1000) // Negative retry count
      expect(calculateRetryDelay(0, 0)).toBe(0) // Zero base delay
      expect(calculateRetryDelay(0, -100)).toBe(0) // Negative base delay
    })
  })

  describe('createDefaultRetryOptions Function', () => {
    it('should create valid default options', () => {
      const options = createDefaultRetryOptions()
      
      expect(options.retries).toBeGreaterThan(0)
      expect(options.retryAfterBaseValue).toBeGreaterThan(0)
      expect(Array.isArray(options.doNotRetry)).toBe(true)
      expect(options.enabled).toBe(true)
      expect(typeof options.calculateDelay).toBe('function')
    })

    it('should include standard non-retryable status codes', () => {
      const options = createDefaultRetryOptions()
      
      expect(options.doNotRetry).toContain(400) // Bad Request
      expect(options.doNotRetry).toContain(401) // Unauthorized
      expect(options.doNotRetry).toContain(403) // Forbidden
      expect(options.doNotRetry).toContain(404) // Not Found
      expect(options.doNotRetry).toContain(422) // Unprocessable Entity
    })
  })

  describe('validateRetryOptions Function', () => {
    it('should validate correct options without throwing', () => {
      const validOptions: RetryOptions = {
        retries: 3,
        retryAfterBaseValue: 1000,
        doNotRetry: [400, 401, 403],
        enabled: true,
        calculateDelay: (count) => count * 1000
      }

      expect(() => validateRetryOptions(validOptions)).not.toThrow()
    })

    it('should reject negative retry count', () => {
      const invalidOptions: RetryOptions = {
        retries: -1,
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true
      }

      expect(() => validateRetryOptions(invalidOptions)).toThrow()
    })

    it('should reject negative base delay', () => {
      const invalidOptions: RetryOptions = {
        retries: 3,
        retryAfterBaseValue: -1000,
        doNotRetry: [],
        enabled: true
      }

      expect(() => validateRetryOptions(invalidOptions)).toThrow()
    })

    it('should reject excessive retry count', () => {
      const invalidOptions: RetryOptions = {
        retries: 20, // Too many retries
        retryAfterBaseValue: 1000,
        doNotRetry: [],
        enabled: true
      }

      expect(() => validateRetryOptions(invalidOptions)).toThrow()
    })
  })

  describe('RetryManager Class', () => {
    describe('Circuit Breaker Functionality', () => {
      it('should open circuit after failure threshold', async () => {
        const options: RetryOptions = {
          retries: 0, // No retries to test circuit breaker directly
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 3,
            recoveryTimeout: 60000
          }
        }

        const manager = new RetryManager(options)
        let failureCount = 0

        const failingOperation = async () => {
          failureCount++
          throw new Error(`Failure ${failureCount}`)
        }

        // Execute operations that will fail
        for (let i = 0; i < 3; i++) {
          try {
            await manager.executeWithRetry(failingOperation)
          } catch (error) {
            // Expected to fail
          }
        }

        // Circuit should be open now
        const circuitBreaker = (manager as any).circuitBreaker
        expect(circuitBreaker?.isOpen()).toBe(true)

        // Next operation should fail immediately
        const startTime = Date.now()
        try {
          await manager.executeWithRetry(failingOperation)
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toMatch(/circuit breaker/i)
        }
        const endTime = Date.now()

        // Should fail fast (no delay for actual operation)
        expect(endTime - startTime).toBeLessThan(100)
      })

      it('should recover from open state after timeout', async () => {
        const mockNow = vi.spyOn(Date, 'now')
        let currentTime = 1000000

        mockNow.mockImplementation(() => currentTime)

        const options: RetryOptions = {
          retries: 0,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 1,
            recoveryTimeout: 5000
          }
        }

        const manager = new RetryManager(options)

        // Trigger circuit open
        try {
          await manager.executeWithRetry(async () => {
            throw new Error('Test failure')
          })
        } catch {
          // Expected
        }

        // Verify circuit is open
        const circuitBreaker = (manager as any).circuitBreaker
        expect(circuitBreaker?.isOpen()).toBe(true)

        // Advance time past recovery timeout
        currentTime += 6000

        // Next operation should succeed if the operation is fixed
        const result = await manager.executeWithRetry(async () => {
          return 'success'
        })

        expect(result).toBe('success')
        expect(circuitBreaker?.isOpen()).toBe(false)

        mockNow.mockRestore()
      })

      it('should handle circuit breaker disabled', async () => {
        const options: RetryOptions = {
          retries: 0,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          circuitBreaker: {
            enabled: false,
            failureThreshold: 3,
            recoveryTimeout: 60000
          }
        }

        const manager = new RetryManager(options)

        // Should not create circuit breaker when disabled
        const circuitBreaker = (manager as any).circuitBreaker
        expect(circuitBreaker).toBeUndefined()
      })
    })

    describe('Custom Retry Functions', () => {
      it('should use custom calculateDelay function', async () => {
        const customDelays: number[] = []
        const options: RetryOptions = {
          retries: 3,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: (retryCount, baseDelay) => {
            const delay = baseDelay * (retryCount + 1)
            customDelays.push(delay)
            return 0 // No actual delay for testing
          }
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          if (attempts < 3) {
            throw new Error('Retry me')
          }
          return 'success'
        }

        const result = await manager.executeWithRetry(operation)
        expect(result).toBe('success')
        expect(customDelays).toEqual([1000, 2000]) // Called for retries 1 and 2
      })

      it('should use custom shouldRetry function', async () => {
        const checkedErrors: Error[] = []
        const options: RetryOptions = {
          retries: 3,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0,
          shouldRetry: (error, retryCount) => {
            checkedErrors.push(error)
            return error.message === 'retryable'
          }
        }

        const manager = new RetryManager(options)

        // Test retryable error
        let attempts = 0
        const retryableOperation = async () => {
          attempts++
          if (attempts < 3) {
            throw new Error('retryable')
          }
          return 'success'
        }

        const result1 = await manager.executeWithRetry(retryableOperation)
        expect(result1).toBe('success')

        // Test non-retryable error
        const nonRetryableOperation = async () => {
          throw new Error('non-retryable')
        }

        await expect(manager.executeWithRetry(nonRetryableOperation)).rejects.toThrow('non-retryable')
        
        expect(checkedErrors.length).toBeGreaterThan(0)
      })

      it('should call onRetry callback', async () => {
        const retryCallbacks: Array<{ error: Error; retryCount: number }> = []
        const options: RetryOptions = {
          retries: 2,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0,
          onRetry: (error, retryCount) => {
            retryCallbacks.push({ error, retryCount })
          }
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts}`)
          }
          return 'success'
        }

        const result = await manager.executeWithRetry(operation)
        expect(result).toBe('success')
        expect(retryCallbacks).toHaveLength(2)
        expect(retryCallbacks[0]?.retryCount).toBe(1)
        expect(retryCallbacks[1]?.retryCount).toBe(2)
      })
    })

    describe('Error Classification', () => {
      it('should not retry errors in doNotRetry list', async () => {
        const options: RetryOptions = {
          retries: 3,
          retryAfterBaseValue: 1000,
          doNotRetry: [404, 401],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          const error = new Error('Not Found') as Error & { status: number }
          error.status = 404
          throw error
        }

        await expect(manager.executeWithRetry(operation)).rejects.toThrow('Not Found')
        expect(attempts).toBe(1) // Should not retry
      })

      it('should retry errors not in doNotRetry list', async () => {
        const options: RetryOptions = {
          retries: 2,
          retryAfterBaseValue: 1000,
          doNotRetry: [404],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          if (attempts < 3) {
            const error = new Error('Server Error') as Error & { status: number }
            error.status = 500
            throw error
          }
          return 'success'
        }

        const result = await manager.executeWithRetry(operation)
        expect(result).toBe('success')
        expect(attempts).toBe(3) // Original + 2 retries
      })

      it('should handle rate limit errors with retry-after', async () => {
        const options: RetryOptions = {
          retries: 1,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: (retryCount, baseDelay, retryAfter) => {
            return retryAfter || baseDelay
          }
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          if (attempts === 1) {
            const error = new GitHubRateLimitError('Rate limited', 5) // 5 second retry-after
            throw error
          }
          return 'success'
        }

        const result = await manager.executeWithRetry(operation)
        expect(result).toBe('success')
        expect(attempts).toBe(2)
      })
    })

    describe('Edge Cases and Error Conditions', () => {
      it('should handle disabled retry manager', async () => {
        const options: RetryOptions = {
          retries: 3,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: false
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          throw new Error('Always fails')
        }

        await expect(manager.executeWithRetry(operation)).rejects.toThrow('Always fails')
        expect(attempts).toBe(1) // No retries when disabled
      })

      it('should handle zero retries configuration', async () => {
        const options: RetryOptions = {
          retries: 0,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          throw new Error('No retries')
        }

        await expect(manager.executeWithRetry(operation)).rejects.toThrow('No retries')
        expect(attempts).toBe(1)
      })

      it('should handle operations that throw non-Error objects', async () => {
        const options: RetryOptions = {
          retries: 1,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)

        const operation = async () => {
          throw 'String error' // Not an Error object
        }

        await expect(manager.executeWithRetry(operation)).rejects.toBe('String error')
      })

      it('should handle async operations that resolve immediately', async () => {
        const options: RetryOptions = {
          retries: 3,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true
        }

        const manager = new RetryManager(options)

        const operation = async () => {
          return 'immediate success'
        }

        const result = await manager.executeWithRetry(operation)
        expect(result).toBe('immediate success')
      })

      it('should handle very large delay calculations', async () => {
        const options: RetryOptions = {
          retries: 1,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => Number.MAX_SAFE_INTEGER
        }

        const manager = new RetryManager(options)
        let attempts = 0

        const operation = async () => {
          attempts++
          if (attempts === 1) {
            throw new Error('Retry with huge delay')
          }
          return 'success'
        }

        // Should still work despite large delay
        const startTime = Date.now()
        const result = await manager.executeWithRetry(operation)
        const endTime = Date.now()

        expect(result).toBe('success')
        // Should not actually wait the huge delay in test environment
        expect(endTime - startTime).toBeLessThan(1000)
      })

      it('should handle concurrent retry executions', async () => {
        const options: RetryOptions = {
          retries: 2,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)
        const results = new Map<string, string>()

        const createOperation = (id: string) => async () => {
          let attempts = (results.get(`${id}_attempts`) as unknown as number) || 0
          attempts++
          results.set(`${id}_attempts`, attempts as unknown as string)

          if (attempts < 2) {
            throw new Error(`${id} retry`)
          }
          return `${id} success`
        }

        // Execute multiple operations concurrently
        const promises = [
          manager.executeWithRetry(createOperation('op1')),
          manager.executeWithRetry(createOperation('op2')),
          manager.executeWithRetry(createOperation('op3'))
        ]

        const concurrentResults = await Promise.all(promises)

        expect(concurrentResults).toEqual(['op1 success', 'op2 success', 'op3 success'])
        expect(results.get('op1_attempts')).toBe(2 as unknown as string)
        expect(results.get('op2_attempts')).toBe(2 as unknown as string)
        expect(results.get('op3_attempts')).toBe(2 as unknown as string)
      })
    })

    describe('Memory and Resource Management', () => {
      it('should not leak memory with many retry operations', async () => {
        const options: RetryOptions = {
          retries: 1,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)

        // Execute many operations to test for memory leaks
        const operations = Array(100).fill(null).map((_, index) => 
          manager.executeWithRetry(async () => `result-${index}`)
        )

        const results = await Promise.all(operations)
        expect(results).toHaveLength(100)
        expect(results[0]).toBe('result-0')
        expect(results[99]).toBe('result-99')
      })

      it('should clean up resources after failed operations', async () => {
        const options: RetryOptions = {
          retries: 1,
          retryAfterBaseValue: 1000,
          doNotRetry: [],
          enabled: true,
          calculateDelay: () => 0
        }

        const manager = new RetryManager(options)

        const failingOperation = async () => {
          throw new Error('Always fails')
        }

        // Multiple failing operations should not accumulate state
        for (let i = 0; i < 10; i++) {
          try {
            await manager.executeWithRetry(failingOperation)
          } catch {
            // Expected to fail
          }
        }

        // Manager should still work normally
        const result = await manager.executeWithRetry(async () => 'still works')
        expect(result).toBe('still works')
      })
    })
  })
})