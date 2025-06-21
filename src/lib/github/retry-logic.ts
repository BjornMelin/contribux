import { CIRCUIT_BREAKER_DEFAULTS, HTTP_STATUS, RETRY_DEFAULTS, TIME } from './constants'
import { ErrorMessages } from './errors'
import type { GitHubError } from './interfaces/client'
import type { CircuitBreakerOptions, RetryOptions } from './interfaces/retry'

export interface RetryState {
  retryCount: number
  error: GitHubError
  lastAttempt: Date
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
      throw new Error(ErrorMessages.CIRCUIT_BREAKER_OPEN)
    }

    let lastError: GitHubError | null = null
    const maxRetries = this.options.retries || RETRY_DEFAULTS.MAX_RETRIES

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()

        // Reset circuit breaker on success
        if (this.circuitBreaker) {
          this.circuitBreaker.recordSuccess()
        }

        return result
      } catch (error) {
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
            lastAttempt: new Date(),
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
    const doNotRetry = this.options.doNotRetry || [
      HTTP_STATUS.BAD_REQUEST,
      HTTP_STATUS.UNAUTHORIZED,
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.NOT_FOUND,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    ]
    if (error.status && doNotRetry.includes(error.status)) {
      return false
    }

    // Retry on 5xx server errors and rate limit errors
    if (error.status) {
      return (
        error.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR ||
        error.status === HTTP_STATUS.TOO_MANY_REQUESTS
      )
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
    const baseDelay = this.options.retryAfterBaseValue || RETRY_DEFAULTS.BASE_DELAY_MS
    const retryAfter = this.extractRetryAfter(error)

    return calculateRetryDelay(retryCount, baseDelay, retryAfter)
  }

  private extractRetryAfter(error: GitHubError): number | undefined {
    const retryAfter = error.response?.headers?.['retry-after']
    if (retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10)
      return Number.isNaN(seconds) ? undefined : seconds * TIME.SECOND // Convert to milliseconds
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
  baseDelay: number = RETRY_DEFAULTS.BASE_DELAY_MS,
  retryAfter?: number
): number {
  // If retry-after header is present, use it (with small jitter)
  if (retryAfter !== undefined) {
    const jitterRange = RETRY_DEFAULTS.RETRY_AFTER_JITTER_PERCENTAGE * 2
    const jitter = Math.random() * jitterRange - RETRY_DEFAULTS.RETRY_AFTER_JITTER_PERCENTAGE
    return Math.floor(retryAfter * (1 + jitter))
  }

  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = 2 ** retryCount * baseDelay

  // Add random jitter (±10%)
  const jitterRange = RETRY_DEFAULTS.JITTER_PERCENTAGE * 2
  const jitter = Math.random() * jitterRange - RETRY_DEFAULTS.JITTER_PERCENTAGE
  const delayWithJitter = exponentialDelay * (1 + jitter)

  // Cap at max delay
  return Math.min(Math.floor(delayWithJitter), RETRY_DEFAULTS.MAX_DELAY_MS)
}

export function createDefaultRetryOptions(): RetryOptions {
  return {
    enabled: true,
    retries: RETRY_DEFAULTS.MAX_RETRIES,
    retryAfterBaseValue: RETRY_DEFAULTS.BASE_DELAY_MS,
    doNotRetry: [
      HTTP_STATUS.BAD_REQUEST,
      HTTP_STATUS.UNAUTHORIZED,
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.NOT_FOUND,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    ],
    circuitBreaker: {
      enabled: false,
      failureThreshold: CIRCUIT_BREAKER_DEFAULTS.FAILURE_THRESHOLD,
      recoveryTimeout: CIRCUIT_BREAKER_DEFAULTS.RECOVERY_TIMEOUT_MS,
    },
  }
}

export function validateRetryOptions(options: RetryOptions): void {
  if (options.retries !== undefined) {
    if (options.retries < 0) {
      throw new Error(ErrorMessages.VALIDATION_RETRY_COUNT_NEGATIVE)
    }
    if (options.retries > RETRY_DEFAULTS.MAX_RETRY_COUNT) {
      throw new Error(`Maximum retry count is ${RETRY_DEFAULTS.MAX_RETRY_COUNT}`)
    }
  }

  if (options.retryAfterBaseValue !== undefined && options.retryAfterBaseValue < 0) {
    throw new Error('Retry base delay cannot be negative')
  }

  if (options.circuitBreaker?.enabled) {
    if (options.circuitBreaker.failureThreshold < 1) {
      throw new Error(ErrorMessages.VALIDATION_FAILURE_THRESHOLD_INVALID)
    }
    if (options.circuitBreaker.recoveryTimeout < CIRCUIT_BREAKER_DEFAULTS.MIN_RECOVERY_TIMEOUT_MS) {
      throw new Error(ErrorMessages.VALIDATION_RECOVERY_TIMEOUT_INVALID)
    }
  }
}
