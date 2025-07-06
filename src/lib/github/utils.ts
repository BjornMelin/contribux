/**
 * GitHub API Client Utility Functions
 *
 * This module contains shared utility functions used across the GitHub API client.
 * Helper functions for rate limiting, retry logic, error handling,
 * and other common operations.
 */

// Define rate limiting types locally
export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
  used: number
}

export interface GraphQLRateLimitInfo {
  limit: number
  remaining: number
  resetAt: string
  cost: number
}

/**
 * Utility types
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Calculate retry delay with exponential backoff and jitter
 *
 * Following 2025 best practices for retry logic:
 * - Uses full jitter (±50%) to prevent thundering herd
 * - Caps at 30 seconds maximum
 * - Uses proper exponential base of 2
 * - Ensures minimum delay of 100ms
 *
 * @param retryCount - Current retry attempt (0-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000ms)
 * @returns Calculated delay in milliseconds with jitter applied
 */
export function calculateRetryDelay(retryCount: number, baseDelay = 1000): number {
  // Exponential backoff: 2^retryCount * baseDelay
  const exponentialDelay = Math.min(baseDelay * 2 ** retryCount, 30000) // Max 30 seconds

  // Full jitter: ±50% of exponential delay to prevent thundering herd
  const jitter = exponentialDelay * (Math.random() - 0.5)
  const finalDelay = exponentialDelay + jitter

  // Ensure minimum delay of 100ms
  return Math.max(100, Math.floor(finalDelay))
}

/**
 * Parse retry-after header value from GitHub API responses
 *
 * GitHub's secondary rate limiting responses include a retry-after header
 * that can contain either:
 * - A number of seconds to wait
 * - An HTTP date when to retry
 *
 * @param retryAfterHeader - Value from 'retry-after' HTTP header
 * @returns Delay in milliseconds (capped at 5 minutes, minimum 60 seconds)
 */
export function parseRetryAfter(retryAfterHeader?: string): number {
  if (!retryAfterHeader) return 60000 // Default to 60 seconds in milliseconds

  // Try parsing as numeric seconds first
  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10)
  if (!Number.isNaN(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1000, 300000) // Cap at 5 minutes
  }

  // Try parsing as HTTP date
  const retryDate = new Date(retryAfterHeader)
  if (!Number.isNaN(retryDate.getTime())) {
    const delayMs = Math.max(0, retryDate.getTime() - Date.now())
    return Math.min(delayMs, 300000) // Cap at 5 minutes
  }

  return 60000 // Default fallback: 60 seconds
}

/**
 * Check if rate limit usage is approaching a specified threshold
 *
 * This utility helps implement proactive rate limit management by detecting
 * when usage approaches dangerous levels before hitting the limit.
 *
 * @param info - Rate limit information object
 * @param threshold - Usage threshold as decimal (0.0-1.0, default: 0.9 for 90%)
 * @returns True if usage percentage >= threshold
 */
export function isApproachingRateLimit(
  info: RateLimitInfo | GraphQLRateLimitInfo,
  threshold = 0.9
): boolean {
  if (info.limit === 0) return false

  // Handle different rate limit info types
  let percentageUsed: number
  if ('used' in info) {
    // RateLimitInfo type
    percentageUsed = info.used / info.limit
  } else {
    // GraphQLRateLimitInfo type - calculate from remaining
    percentageUsed = (info.limit - info.remaining) / info.limit
  }

  return percentageUsed >= threshold
}

/**
 * Calculate optimal delay between requests to avoid hitting rate limits
 *
 * This function calculates the ideal spacing between API requests to evenly
 * distribute the remaining quota over the time until reset, with a safety buffer.
 *
 * @param info - Rate limit information object
 * @returns Optimal delay in milliseconds between requests
 */
export function calculateOptimalDelay(info: RateLimitInfo | GraphQLRateLimitInfo): number {
  if (info.remaining === 0) {
    // Already rate limited, wait until reset
    if ('reset' in info) {
      // RateLimitInfo type - reset is a timestamp
      return Math.max(0, info.reset * 1000 - Date.now())
    }
    // GraphQLRateLimitInfo type - resetAt is ISO string
    return Math.max(0, new Date(info.resetAt).getTime() - Date.now())
  }

  let timeUntilReset: number
  if ('reset' in info) {
    // RateLimitInfo type - reset is a timestamp
    timeUntilReset = Math.max(0, info.reset * 1000 - Date.now())
  } else {
    // GraphQLRateLimitInfo type - resetAt is ISO string
    timeUntilReset = Math.max(0, new Date(info.resetAt).getTime() - Date.now())
  }
  if (timeUntilReset === 0) return 0

  // Calculate average time per request to spread requests evenly
  const averageTimePerRequest = timeUntilReset / info.remaining

  // Add 10% buffer to be conservative
  return Math.floor(averageTimePerRequest * 1.1)
}

/**
 * Calculate percentage of rate limit used
 *
 * @param info - Rate limit information object
 * @returns Percentage used (0-100)
 */
export function calculatePercentageUsed(info: RateLimitInfo | GraphQLRateLimitInfo): number {
  if (info.limit === 0) return 0
  return ((info.limit - info.remaining) / info.limit) * 100
}

/**
 * Check if a given status code indicates a retryable error
 *
 * @param statusCode - HTTP status code
 * @returns True if the error is retryable
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  return [
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ].includes(statusCode)
}

/**
 * Check if a response indicates a rate limit error
 *
 * @param statusCode - HTTP status code
 * @param headers - Response headers
 * @returns True if this is a rate limit error
 */
export function isRateLimitResponse(statusCode: number, headers: Record<string, string>): boolean {
  return statusCode === 429 || headers['x-ratelimit-remaining'] === '0'
}

/**
 * Sanitize a string for safe use in GraphQL queries
 *
 * @param value - String to sanitize
 * @returns Sanitized string safe for GraphQL
 */
export function sanitizeForGraphQL(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Create a cache key from method, path, and parameters
 *
 * @param method - HTTP method
 * @param path - API path
 * @param params - Request parameters
 * @returns Cache key string
 */
export function createCacheKey(
  method: string,
  path: string,
  params: Record<string, unknown> = {}
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&')

  return `${method.toUpperCase()}:${path}${sortedParams ? `?${sortedParams}` : ''}`
}

/**
 * Debounce function for function calls
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Throttle function for function calls
 *
 * @param fn - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Sleep for a specified number of milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Convert bytes to human readable format
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

/**
 * Check if a value is a plain object
 *
 * @param value - Value to check
 * @returns True if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.constructor === Object &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

/**
 * Deep clone an object
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T
  if (isPlainObject(obj)) {
    const cloned = {} as Record<string, unknown>
    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned as T
  }
  return obj
}

/**
 * Safely parse rate limit header values
 *
 * Parses numeric values from rate limit headers, returning 0 for any invalid values
 * including undefined, null, NaN, or non-numeric strings.
 *
 * @param value - Header value to parse
 * @param defaultValue - Default value to return if parsing fails (default: 0)
 * @returns Parsed number or default value
 */
export function parseRateLimitHeader(value: string | undefined | null, defaultValue = 0): number {
  if (!value) return defaultValue
  
  const parsed = Number.parseInt(value, 10)
  
  // Return default value if parsing resulted in NaN or invalid number
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue
  }
  
  // Ensure non-negative values for rate limits
  return Math.max(0, parsed)
}
