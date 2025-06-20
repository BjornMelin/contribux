import {
  GitHubClientError,
  isRateLimitError,
  isRequestError,
  isSecondaryRateLimitError,
} from '../errors'
import type { CircuitBreakerOptions, RetryOptions } from '../types'

export interface RetryState {
  attempt: number
  lastError?: Error
  startTime: number
  totalDelay: number
}

export interface RetryContext {
  method?: string
  url?: string
  requestId?: string
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failures: number
  successes: number
  lastFailureTime: number
  lastSuccessTime: number
  nextAttemptTime: number
}

export class CircuitBreaker {
  private failures = 0
  private successes = 0
  private lastFailureTime = 0
  private lastSuccessTime = 0
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
          this.successes = 0 // Reset success counter for half-open state
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

    this.successes++
    this.lastSuccessTime = Date.now()

    if (this.state === 'HALF_OPEN') {
      // Require multiple successes to fully close from half-open
      const requiredSuccesses = Math.min(this.options.failureThreshold, 3)
      if (this.successes >= requiredSuccesses) {
        this.state = 'CLOSED'
        this.failures = 0
      }
    } else if (this.state === 'CLOSED') {
      // Gradually reduce failure count on success
      this.failures = Math.max(0, this.failures - 1)
    }
  }

  recordFailure(): void {
    if (!this.options.enabled) return

    this.failures++
    this.lastFailureTime = Date.now()

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately opens the circuit
      this.state = 'OPEN'
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime:
        this.state === 'OPEN' ? this.lastFailureTime + this.options.recoveryTimeout : 0,
    }
  }

  reset(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
    this.lastFailureTime = 0
    this.lastSuccessTime = 0
  }
}

export class RetryManager {
  private circuitBreaker?: CircuitBreaker

  constructor(private options: RetryOptions) {
    if (this.options.circuitBreaker?.enabled) {
      this.circuitBreaker = new CircuitBreaker(this.options.circuitBreaker)
    }
  }

  async executeWithRetry<T>(operation: () => Promise<T>, context?: RetryContext): Promise<T> {
    const retryState: RetryState = {
      attempt: 0,
      startTime: Date.now(),
      totalDelay: 0,
    }

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= (this.options.retries ?? 3); attempt++) {
      retryState.attempt = attempt

      // Check circuit breaker
      if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
        const cbState = this.circuitBreaker.getState()
        const nextAttemptIn = Math.max(0, cbState.nextAttemptTime - Date.now())
        throw new GitHubClientError(
          `Circuit breaker is ${cbState.state.toLowerCase()} - operation temporarily unavailable. ` +
            `Next attempt in ${Math.ceil(nextAttemptIn / 1000)}s`
        )
      }

      try {
        const result = await operation()

        // Record success for circuit breaker
        this.circuitBreaker?.recordSuccess()

        // Log successful retry if this wasn't the first attempt
        if (attempt > 0 && this.options.onRetry) {
          this.options.onRetry(
            lastError || new Error('Previous attempts failed'),
            attempt,
            retryState
          )
        }

        return result
      } catch (error: unknown) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        lastError = errorObj
        retryState.lastError = errorObj

        // Record failure for circuit breaker
        this.circuitBreaker?.recordFailure()

        // Don't retry on last attempt
        if (attempt === (this.options.retries ?? 3)) {
          break
        }

        // Check if we should retry this error
        if (!this.shouldRetry(errorObj, attempt)) {
          break
        }

        // Calculate delay and wait
        const delay = this.calculateRetryDelay(errorObj, attempt)
        retryState.totalDelay += delay

        // Call retry callback if provided
        this.options.onRetry?.(errorObj, attempt + 1, retryState)

        if (delay > 0) {
          await this.sleep(delay)
        }
      }
    }

    throw lastError || new GitHubClientError('Operation failed after retries')
  }

  private shouldRetry(error: Error, retryCount: number): boolean {
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
      const doNotRetry = this.options.doNotRetry ?? [400, 401, 403, 404, 422]
      if (doNotRetry.includes(error.status)) {
        return false
      }

      // Always retry on rate limits (403 with specific headers)
      if (isRateLimitError(error) || isSecondaryRateLimitError(error)) {
        return true
      }

      // Retry on server errors (5xx)
      if (error.status >= 500) {
        return true
      }

      // Retry on specific client errors
      if ([408, 409, 429, 502, 503, 504].includes(error.status)) {
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

    // Retry on timeout errors
    if (this.isTimeoutError(error)) {
      return true
    }

    return false
  }

  private shouldRetryGraphQLError(error: any): boolean {
    // Don't retry on query validation errors
    if (error.errors && Array.isArray(error.errors)) {
      for (const gqlError of error.errors) {
        // Retry on rate limiting
        if (gqlError.type === 'RATE_LIMITED') {
          return true
        }

        // Don't retry on syntax or validation errors
        if (gqlError.type === 'VALIDATION' || gqlError.type === 'GRAPHQL_PARSE_FAILED') {
          return false
        }

        // Don't retry on authentication errors
        if (gqlError.type === 'FORBIDDEN' || gqlError.type === 'UNAUTHORIZED') {
          return false
        }
      }
    }

    // Default: retry GraphQL errors that might be transient
    return true
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
      error.code === 'ENOTFOUND' ||
      error.code === 'EAI_AGAIN' ||
      error.message?.includes('network') ||
      error.message?.includes('socket') ||
      error.message?.includes('connection')
    )
  }

  private isTimeoutError(error: any): boolean {
    return (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ESOCKETTIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')
    )
  }

  private calculateRetryDelay(error: Error, retryCount: number): number {
    // Use custom delay calculation if provided
    if (this.options.calculateDelay) {
      return this.options.calculateDelay(retryCount, this.options.retryAfterBaseValue)
    }

    // Extract retry-after from headers for rate limits
    let retryAfter: number | undefined

    if (isRequestError(error)) {
      const retryAfterHeader = (error as any).response?.headers?.['retry-after']
      if (retryAfterHeader) {
        const seconds = Number.parseInt(retryAfterHeader, 10)
        if (!Number.isNaN(seconds)) {
          retryAfter = seconds * 1000 // Convert to milliseconds
        }
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

  getCircuitBreakerState(): CircuitBreakerState | null {
    return this.circuitBreaker?.getState() ?? null
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker?.reset()
  }
}

/**
 * Calculate retry delay with exponential backoff and jitter
 * Following 2025 best practices:
 * - Uses full jitter (±25%) to prevent thundering herd
 * - Caps at 30 seconds maximum
 * - Respects retry-after headers for rate limits
 */
export function calculateRetryDelay(
  retryCount: number,
  baseDelay = 1000,
  retryAfter?: number
): number {
  // Use retry-after header if provided (rate limit scenario)
  if (retryAfter !== undefined && retryAfter > 0) {
    // Add small jitter to retry-after to prevent thundering herd
    const jitter = retryAfter * 0.1 * (Math.random() - 0.5)
    return Math.max(100, Math.floor(retryAfter + jitter))
  }

  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = 2 ** retryCount * baseDelay

  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1)
  const delayWithJitter = exponentialDelay + jitter

  // Cap at 30 seconds maximum
  return Math.max(100, Math.min(Math.floor(delayWithJitter), 30000))
}

/**
 * Helper function to determine if an error should be retried
 * @deprecated Use RetryManager.shouldRetry instead
 */
export function shouldRetryError(error: any, retryCount: number, options: RetryOptions): boolean {
  const manager = new RetryManager(options)
  return (manager as any).shouldRetry(error, retryCount)
}

/**
 * Create default retry options following 2025 best practices
 */
export function createDefaultRetryOptions(): RetryOptions {
  return {
    enabled: true,
    retries: 3,
    retryAfterBaseValue: 1000,
    doNotRetry: [400, 401, 403, 404, 422],
    circuitBreaker: {
      enabled: true, // Enable by default in 2025
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
    },
  }
}

/**
 * Validate retry options and throw descriptive errors for invalid configurations
 */
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

/**
 * Create a retry-enabled function wrapper
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = createDefaultRetryOptions()
): T {
  const manager = new RetryManager(options)

  return ((...args: Parameters<T>) => {
    return manager.executeWithRetry(() => fn(...args))
  }) as T
}

/**
 * Utility to create a delay promise (for testing and manual delays)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
