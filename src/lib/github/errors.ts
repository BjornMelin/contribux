import type { RequestError } from '@octokit/types'

export interface GitHubGraphQLErrorData {
  message: string
  type?: string
  path?: string[]
  locations?: Array<{ line: number; column: number }>
}

export class GitHubClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubClientError'
  }
}

export class GitHubAuthenticationError extends GitHubClientError {
  constructor(message: string = 'Authentication failed') {
    super(message)
    this.name = 'GitHubAuthenticationError'
  }
}

export class GitHubRateLimitError extends GitHubClientError {
  constructor(
    message: string,
    public readonly retryAfter: number,
    public readonly limit: number,
    public readonly remaining: number,
    public readonly reset: Date
  ) {
    super(message)
    this.name = 'GitHubRateLimitError'
  }
}

export class GitHubGraphQLError extends GitHubClientError {
  constructor(
    message: string,
    public readonly errors: GitHubGraphQLErrorData[],
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'GitHubGraphQLError'
  }
}

export class GitHubWebhookError extends GitHubClientError {
  constructor(
    message: string,
    public readonly reason: 'invalid-signature' | 'missing-signature' | 'parse-error'
  ) {
    super(message)
    this.name = 'GitHubWebhookError'
  }
}

export class GitHubTokenExpiredError extends GitHubAuthenticationError {
  constructor(
    message: string = 'Token has expired',
    public readonly expiredAt?: Date
  ) {
    super(message)
    this.name = 'GitHubTokenExpiredError'
  }
}

export class GitHubCacheError extends GitHubClientError {
  constructor(
    message: string,
    public readonly operation: 'get' | 'set' | 'delete' | 'clear'
  ) {
    super(message)
    this.name = 'GitHubCacheError'
  }
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && 'status' in error && 'request' in error && 'response' in error
}

export function isRateLimitError(error: unknown): boolean {
  if (!isRequestError(error)) return false
  const response = (error as RequestError & { response: { headers: Record<string, string> } })
    .response
  return error.status === 403 && response?.headers?.['x-ratelimit-remaining'] === '0'
}

export function isSecondaryRateLimitError(error: unknown): boolean {
  if (!isRequestError(error)) return false
  const response = (error as RequestError & { response: { headers: Record<string, string> } })
    .response
  return error.status === 403 && 'retry-after' in (response?.headers || {})
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'Unknown error occurred'
}

/**
 * Error message formatting standards:
 * - Start with capital letter (sentence case)
 * - No ending punctuation for simple messages
 * - Use colon for contextual information
 * - Use template literals for dynamic content
 * - Provide actionable context when possible
 */
export const ErrorMessages = {
  // Authentication errors
  AUTH_TOKEN_REQUIRED: 'Authentication token is required',
  AUTH_TOKEN_EXPIRED: 'Authentication token has expired',
  AUTH_TOKEN_INVALID: 'Authentication token is invalid',
  AUTH_APP_CONFIG_REQUIRED: 'GitHub App configuration required',
  AUTH_TYPE_INVALID: (type: string) => `Invalid authentication type: ${type}`,

  // Configuration errors
  CONFIG_INVALID: 'Invalid configuration provided',
  CONFIG_TOKEN_ROTATION_NOT_CONFIGURED: 'Token rotation not configured',
  CONFIG_CACHE_NOT_CONFIGURED: 'Cache not configured',
  CONFIG_WEBHOOK_SECRET_REQUIRED: 'Webhook secret is required and must be a non-empty string',

  // Validation errors
  VALIDATION_RETRY_COUNT_NEGATIVE: 'Retry count cannot be negative',
  VALIDATION_CACHE_SIZE_INVALID: 'Cache size must be between 100 and 100,000',
  VALIDATION_RECOVERY_TIMEOUT_INVALID: 'Recovery timeout must be positive',
  VALIDATION_FAILURE_THRESHOLD_INVALID: 'Failure threshold must be positive',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED: 'GitHub API rate limit exceeded',
  RATE_LIMIT_SECONDARY: 'GitHub secondary rate limit hit',
  RATE_LIMIT_GRAPHQL_EXCEEDED: (points: number, limit: number) =>
    `Query exceeds maximum point limit: ${points.toLocaleString()} points (limit: ${limit.toLocaleString()})`,

  // Circuit breaker errors
  CIRCUIT_BREAKER_OPEN: 'Circuit breaker is open',

  // Webhook errors
  WEBHOOK_SIGNATURE_INVALID: 'Invalid webhook signature',
  WEBHOOK_SIGNATURE_MISSING: 'Missing webhook signature header',
  WEBHOOK_PAYLOAD_INVALID: 'Invalid webhook payload',
  WEBHOOK_DELIVERY_ID_INVALID: 'Invalid delivery ID format',

  // DataLoader errors
  DATALOADER_BATCH_LENGTH_MISMATCH: (expected: number, received: number | string) =>
    `DataLoader batch function must return an array of the same length as the input array\nExpected: ${expected}, received: ${received}`,
  DATALOADER_KEY_NOT_FOUND: (key: string) => `Repository not found: ${key}`,

  // API errors
  API_ERROR: (context: string, message: string) => `GitHub API error for ${context}: ${message}`,
  API_GRAPHQL_ERROR: 'GraphQL query failed',

  // Token errors
  TOKEN_REFRESH_FAILED: (error: string) => `Failed to refresh token: ${error}`,
  TOKEN_NOT_FOUND: 'No available tokens',
  TOKEN_ALL_EXPIRED: 'All tokens have expired',
} as const
