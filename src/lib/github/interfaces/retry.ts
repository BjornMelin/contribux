/**
 * Retry logic and circuit breaker interfaces
 *
 * This file contains interfaces for configuring retry behavior,
 * circuit breakers, and error handling strategies.
 */

import type { GitHubError, RetryState } from './client'

/**
 * Configuration for retry behavior on failed requests
 * Supports exponential backoff, custom retry logic, and circuit breakers
 */
export interface RetryOptions {
  /** Enable/disable retry logic (default: true) */
  enabled?: boolean
  /** Maximum number of retry attempts (default: 3) */
  retries?: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  retryAfterBaseValue?: number
  /** HTTP status codes that should not be retried (default: [400, 401, 403, 404, 422]) */
  doNotRetry?: number[]
  /** Custom function to determine if error should be retried */
  shouldRetry?: (error: GitHubError, retryCount: number) => boolean
  /** Custom delay calculation function */
  calculateDelay?: (retryCount: number, baseDelay?: number, retryAfter?: number) => number
  /** Callback fired on each retry attempt */
  onRetry?: (error: GitHubError, retryCount: number, retryState?: RetryState) => void
  /** Circuit breaker configuration to prevent cascading failures */
  circuitBreaker?: CircuitBreakerOptions
}

/**
 * Circuit breaker pattern configuration
 * Prevents cascading failures by temporarily blocking requests after repeated failures
 */
export interface CircuitBreakerOptions {
  /** Enable/disable circuit breaker */
  enabled: boolean
  /** Number of failures before circuit opens */
  failureThreshold: number
  /** Time in milliseconds before attempting recovery */
  recoveryTimeout: number
}
