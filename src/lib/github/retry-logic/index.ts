import type { RetryOptions, CircuitBreakerOptions } from '../types'
import { 
  GitHubClientError, 
  GitHubRateLimitError,
  isRateLimitError,
  isSecondaryRateLimitError,
  isRequestError
} from '../errors'

export interface RetryState {
  attempt: number
  lastError?: Error
  startTime: number
}

export class CircuitBreaker {
  private failures: number = 0
  private lastFailureTime: number = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  
  constructor(private options: CircuitBreakerOptions) {}

  canExecute(): boolean {
    if (!this.options.enabled) return true

    const now = Date.now()
    
    switch (this.state) {
      case 'CLOSED':
        return true
      
      case 'OPEN':
        if (now - this.lastFailureTime >= this.options.recoveryTimeout) {
          this.state = 'HALF_OPEN'
          return true
        }
        return false
      
      case 'HALF_OPEN':
        return true
      
      default:
        return true
    }
  }

  recordSuccess(): void {
    if (!this.options.enabled) return

    this.failures = 0
    this.state = 'CLOSED'
  }

  recordFailure(): void {
    if (!this.options.enabled) return

    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  getState(): string {
    return this.state
  }
}

export class RetryManager {
  private circuitBreaker?: CircuitBreaker
  
  constructor(private options: RetryOptions) {
    if (this.options.circuitBreaker?.enabled) {
      this.circuitBreaker = new CircuitBreaker(this.options.circuitBreaker)
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: { method?: string; url?: string }
  ): Promise<T> {
    let lastError: Error | undefined
    
    for (let attempt = 0; attempt <= (this.options.retries || 3); attempt++) {
      // Check circuit breaker
      if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
        throw new GitHubClientError(
          'Circuit breaker is open - operation temporarily unavailable'
        )
      }

      try {
        const result = await operation()
        
        // Record success for circuit breaker
        this.circuitBreaker?.recordSuccess()
        
        return result
      } catch (error: any) {
        lastError = error
        
        // Record failure for circuit breaker
        this.circuitBreaker?.recordFailure()

        // Don't retry on last attempt
        if (attempt === (this.options.retries || 3)) {
          break
        }

        // Check if we should retry this error
        if (!this.shouldRetry(error, attempt)) {
          break
        }

        // Call retry callback if provided
        this.options.onRetry?.(error, attempt + 1)

        // Calculate delay and wait
        const delay = this.calculateRetryDelay(error, attempt)
        if (delay > 0) {
          await this.sleep(delay)
        }
      }
    }

    throw lastError || new GitHubClientError('Operation failed after retries')
  }

  private shouldRetry(error: any, retryCount: number): boolean {
    // Use custom retry logic if provided
    if (this.options.shouldRetry) {
      return this.options.shouldRetry(error, retryCount)
    }

    // Don't retry if retries are disabled
    if (this.options.enabled === false) {
      return false
    }

    // Don't retry certain HTTP status codes
    if (isRequestError(error)) {
      const doNotRetry = this.options.doNotRetry || [400, 401, 403, 404, 422]
      if (doNotRetry.includes(error.status)) {
        return false
      }

      // Always retry on rate limits
      if (isRateLimitError(error) || isSecondaryRateLimitError(error)) {
        return true
      }

      // Retry on server errors (5xx)
      if (error.status >= 500) {
        return true
      }

      // Retry on specific client errors
      if ([408, 409, 429].includes(error.status)) {
        return true
      }

      return false
    }

    // For GraphQL errors, only retry on specific error types
    if (this.isGraphQLError(error)) {
      return this.shouldRetryGraphQLError(error)
    }

    // Retry on network errors
    if (this.isNetworkError(error)) {
      return true
    }

    return false
  }

  private shouldRetryGraphQLError(error: any): boolean {
    // Don't retry on query validation errors
    if (error.errors) {
      for (const gqlError of error.errors) {
        // Retry on rate limiting
        if (gqlError.type === 'RATE_LIMITED') {
          return true
        }
        
        // Don't retry on syntax or validation errors
        if (gqlError.type === 'VALIDATION' || gqlError.type === 'GRAPHQL_PARSE_FAILED') {
          return false
        }
      }
    }

    // Default: don't retry GraphQL errors unless specifically handled above
    return false
  }

  private isGraphQLError(error: any): boolean {
    return error.errors && Array.isArray(error.errors)
  }

  private isNetworkError(error: any): boolean {
    // Check for common network error indicators
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout')
    )
  }

  private calculateRetryDelay(error: any, retryCount: number): number {
    // Use custom delay calculation if provided
    if (this.options.calculateDelay) {
      return this.options.calculateDelay(retryCount, this.options.retryAfterBaseValue)
    }

    // Extract retry-after from headers for rate limits
    let retryAfter: number | undefined

    if (isRequestError(error)) {
      const retryAfterHeader = error.response?.headers?.['retry-after']
      if (retryAfterHeader) {
        retryAfter = parseInt(retryAfterHeader, 10) * 1000 // Convert to milliseconds
      }
    }

    return calculateRetryDelay(retryCount, this.options.retryAfterBaseValue, retryAfter)
  }

  private sleep(ms: number): Promise<void> {
    // Don't sleep if delay is very small (for testing)
    if (ms <= 5) {
      return Promise.resolve()
    }
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function calculateRetryDelay(
  retryCount: number, 
  baseDelay: number = 1000,
  retryAfter?: number
): number {
  // Use retry-after header if provided
  if (retryAfter !== undefined && retryAfter > 0) {
    return retryAfter
  }

  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = Math.pow(2, retryCount) * baseDelay

  // Add jitter (±10%) to prevent thundering herd
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1)
  const delayWithJitter = exponentialDelay + jitter

  // Cap at 30 seconds maximum
  return Math.min(delayWithJitter, 30000)
}

export function shouldRetryError(error: any, retryCount: number, options: RetryOptions): boolean {
  const manager = new RetryManager(options)
  return (manager as any).shouldRetry(error, retryCount)
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
      recoveryTimeout: 30000
    }
  }
}

export function validateRetryOptions(options: RetryOptions): void {
  if (options.retries !== undefined) {
    if (options.retries < 0) {
      throw new GitHubClientError('Retry count cannot be negative')
    }
    if (options.retries > 10) {
      throw new GitHubClientError('Maximum retry count is 10')
    }
  }

  if (options.retryAfterBaseValue !== undefined && options.retryAfterBaseValue < 0) {
    throw new GitHubClientError('Retry base delay cannot be negative')
  }

  if (options.circuitBreaker) {
    if (options.circuitBreaker.failureThreshold < 1) {
      throw new GitHubClientError('Circuit breaker failure threshold must be at least 1')
    }
    if (options.circuitBreaker.recoveryTimeout < 1000) {
      throw new GitHubClientError('Circuit breaker recovery timeout must be at least 1000ms')
    }
  }
}