import type { GitHubError, RetryOptions, RetryState, CircuitBreakerOptions } from './types'

export interface RetryManager {
  executeWithRetry<T>(operation: () => Promise<T>): Promise<T>
}

export class RetryManager {
  private circuitBreaker: CircuitBreaker | null = null

  constructor(private options: RetryOptions) {
    if (options.circuitBreaker?.enabled) {
      this.circuitBreaker = new CircuitBreaker(options.circuitBreaker)
    }
  }

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    if (this.circuitBreaker?.isOpen()) {
      throw new Error('Circuit breaker is open')
    }

    let lastError: GitHubError | null = null
    const maxRetries = this.options.retries || 3

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
        
        // Reset circuit breaker on success
        if (this.circuitBreaker) {
          this.circuitBreaker.recordSuccess()
        }
        
        return result
      } catch (error: any) {
        lastError = error as GitHubError

        // Record failure for circuit breaker
        if (this.circuitBreaker) {
          this.circuitBreaker.recordFailure()
        }

        // Check if this is the last attempt
        if (attempt === maxRetries) {
          break
        }

        // Check if we should retry based on error type
        if (!this.shouldRetry(lastError, attempt)) {
          break
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt, lastError)
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        // Call retry callback if provided
        if (this.options.onRetry) {
          const retryState: RetryState = {
            retryCount: attempt + 1,
            error: lastError,
            lastAttempt: new Date()
          }
          this.options.onRetry(lastError, attempt + 1, retryState)
        }
      }
    }

    throw lastError || new Error('Operation failed after retries')
  }

  private shouldRetry(error: GitHubError, retryCount: number): boolean {
    // Use custom shouldRetry if provided
    if (this.options.shouldRetry) {
      return this.options.shouldRetry(error, retryCount)
    }

    // Don't retry if circuit breaker is open
    if (this.circuitBreaker?.isOpen()) {
      return false
    }

    // Check if error status is in the do not retry list
    const doNotRetry = this.options.doNotRetry || [400, 401, 403, 404, 422]
    if (error.status && doNotRetry.includes(error.status)) {
      return false
    }

    // Retry on 5xx server errors and rate limit errors
    if (error.status) {
      return error.status >= 500 || error.status === 429
    }

    // Retry on network errors (no status)
    return true
  }

  private calculateDelay(retryCount: number, error: GitHubError): number {
    // Use custom calculateDelay if provided
    if (this.options.calculateDelay) {
      const retryAfter = this.extractRetryAfter(error)
      return this.options.calculateDelay(retryCount, this.options.retryAfterBaseValue, retryAfter)
    }

    // Default exponential backoff with jitter
    const baseDelay = this.options.retryAfterBaseValue || 1000
    const retryAfter = this.extractRetryAfter(error)
    
    return calculateRetryDelay(retryCount, baseDelay, retryAfter)
  }

  private extractRetryAfter(error: GitHubError): number | undefined {
    const retryAfter = error.response?.headers?.['retry-after']
    if (retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10)
      return isNaN(seconds) ? undefined : seconds * 1000 // Convert to milliseconds
    }
    return undefined
  }
}

class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(private options: CircuitBreakerOptions) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if recovery timeout has passed
      if (Date.now() - this.lastFailureTime > this.options.recoveryTimeout) {
        this.state = 'half-open'
        return false
      }
      return true
    }
    return false
  }

  recordSuccess(): void {
    this.failures = 0
    this.state = 'closed'
  }

  recordFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open'
    }
  }
}

export function calculateRetryDelay(
  retryCount: number, 
  baseDelay: number = 1000, 
  retryAfter?: number
): number {
  // If retry-after header is present, use it (with small jitter)
  if (retryAfter !== undefined) {
    const jitter = Math.random() * 0.1 // ±10% jitter
    return Math.floor(retryAfter * (1 + jitter))
  }

  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = Math.pow(2, retryCount) * baseDelay
  
  // Add random jitter (±10%)
  const jitter = Math.random() * 0.2 - 0.1 // -10% to +10%
  const delayWithJitter = exponentialDelay * (1 + jitter)
  
  // Cap at 30 seconds
  const maxDelay = 30000
  
  return Math.min(Math.floor(delayWithJitter), maxDelay)
}

export function createDefaultRetryOptions(): RetryOptions {
  return {
    enabled: true,
    retries: 3,
    retryAfterBaseValue: 1000,
    doNotRetry: [400, 401, 403, 404, 422],
    circuitBreaker: {
      enabled: false,
      failureThreshold: 5,
      recoveryTimeout: 60000 // 1 minute
    }
  }
}

export function validateRetryOptions(options: RetryOptions): void {
  if (options.retries !== undefined) {
    if (options.retries < 0) {
      throw new Error('Retry count cannot be negative')
    }
    if (options.retries > 10) {
      throw new Error('Maximum retry count is 10')
    }
  }

  if (options.retryAfterBaseValue !== undefined && options.retryAfterBaseValue < 0) {
    throw new Error('Retry base delay cannot be negative')
  }

  if (options.circuitBreaker?.enabled) {
    if (options.circuitBreaker.failureThreshold < 1) {
      throw new Error('Circuit breaker failure threshold must be at least 1')
    }
    if (options.circuitBreaker.recoveryTimeout < 1000) {
      throw new Error('Circuit breaker recovery timeout must be at least 1000ms')
    }
  }
}