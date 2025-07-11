// Define minimal RequestError interface locally
interface RequestError extends Error {
  status: number
  request: unknown
  response: unknown
}

export interface GitHubGraphQLErrorData {
  message: string
  type?: string
  path?: string[]
  locations?: Array<{ line: number; column: number }>
}

export interface RequestContext {
  /** HTTP method used for the request */
  method: string
  /** Operation name (e.g., 'getRepository', 'getUser') */
  operation: string
  /** Request parameters (sanitized to remove sensitive data) */
  params: Record<string, unknown>
  /** Timestamp when the request was initiated */
  timestamp: Date
  /** Current retry attempt number (0 for initial attempt) */
  retryAttempt: number
  /** Maximum number of retries configured */
  maxRetries: number
  /** Request duration in milliseconds (if available) */
  duration?: number | undefined
}

export class GitHubClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubClientError'
  }
}

// Unified error class for the GitHub client
export class GitHubError extends Error {
  public readonly requestContext?: RequestContext | undefined
  public readonly isRetryable: boolean
  public readonly errorCategory: 'client' | 'server' | 'network' | 'validation'

  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly response?: unknown,
    requestContext?: RequestContext | undefined
  ) {
    super(message)
    this.name = 'GitHubError'
    this.requestContext = requestContext

    // Classify error based on status code
    this.isRetryable = this.determineRetryability(status, code)
    this.errorCategory = this.categorizeError(status, code)
  }

  private determineRetryability(status?: number, code?: string): boolean {
    // Non-retryable conditions
    if (!status) return false
    if (status >= 400 && status < 500) {
      // Client errors are generally not retryable, except for a few cases
      return status === 429 || status === 408 // Rate limit or timeout
    }
    if (code === 'VALIDATION_ERROR') return false

    // Server errors are generally retryable
    return status >= 500 || status === 429
  }

  private categorizeError(
    status?: number,
    code?: string
  ): 'client' | 'server' | 'network' | 'validation' {
    if (code === 'VALIDATION_ERROR') return 'validation'
    if (!status) return 'network'
    if (status >= 400 && status < 500) return 'client'
    if (status >= 500) return 'server'
    return 'network'
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      isRetryable: this.isRetryable,
      errorCategory: this.errorCategory,
      requestContext: this.requestContext,
      // Exclude response to prevent circular references and sensitive data
    }
  }
}

export class GitHubAuthenticationError extends GitHubClientError {
  constructor(message = 'Authentication failed') {
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
    public readonly reason:
      | 'invalid-signature'
      | 'missing-signature'
      | 'parse-error'
      | 'invalid-payload'
      | 'duplicate-delivery'
      | 'handler-error'
  ) {
    super(message)
    this.name = 'GitHubWebhookError'
  }
}

export class GitHubWebhookSignatureError extends GitHubWebhookError {
  constructor(
    message: string,
    public readonly algorithm?: string,
    public readonly providedSignature?: string
  ) {
    super(message, 'invalid-signature')
    this.name = 'GitHubWebhookSignatureError'
  }
}

export class GitHubWebhookPayloadError extends GitHubWebhookError {
  constructor(
    message: string,
    public readonly payloadSize?: number,
    public readonly parseError?: Error
  ) {
    super(message, 'parse-error')
    this.name = 'GitHubWebhookPayloadError'
  }
}

export class GitHubTokenExpiredError extends GitHubAuthenticationError {
  constructor(
    message = 'Token has expired',
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
 * Sanitizes request parameters to remove sensitive information
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...params }

  // List of sensitive keys to remove or mask
  const sensitiveKeys = ['token', 'auth', 'password', 'secret', 'key', 'privateKey']

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key]
    }
  }

  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeParams(value as Record<string, unknown>)
    }
  }

  return sanitized
}

/**
 * Creates a request context object for error reporting
 */
export function createRequestContext(
  method: string,
  operation: string,
  params: Record<string, unknown>,
  retryAttempt = 0,
  maxRetries = 0,
  startTime?: Date
): RequestContext {
  const timestamp = startTime || new Date()
  const duration = startTime ? Date.now() - startTime.getTime() : undefined

  return {
    method,
    operation,
    params: sanitizeParams(params),
    timestamp,
    retryAttempt,
    maxRetries,
    duration,
  }
}

/**
 * Error message formatting standards:
 * - Start with capital letter (sentence case)
 * - No ending punctuation for brief messages
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
  WEBHOOK_HEADERS_INVALID: 'Invalid webhook headers',
  WEBHOOK_EVENT_TYPE_MISSING: 'Missing x-github-event header',
  WEBHOOK_DELIVERY_ID_MISSING: 'Missing x-github-delivery header',
  WEBHOOK_PAYLOAD_TOO_LARGE: (size: number, max: number) =>
    `Payload too large: ${size.toLocaleString()} bytes (max: ${max.toLocaleString()})`,
  WEBHOOK_PAYLOAD_EMPTY: 'Webhook payload cannot be empty',
  WEBHOOK_SECRET_TOO_SHORT: 'Webhook secret must be at least 10 characters long',
  WEBHOOK_ALGORITHM_UNSUPPORTED: (algorithm: string) =>
    `Unsupported signature algorithm: ${algorithm}`,
  WEBHOOK_SIGNATURE_FORMAT_INVALID: 'Signature format is invalid (must be algorithm=signature)',
  WEBHOOK_DUPLICATE_DELIVERY: (deliveryId: string) => `Duplicate delivery ID: ${deliveryId}`,
  WEBHOOK_HANDLER_EXECUTION_FAILED: (eventType: string, error: string) =>
    `Handler for ${eventType} event failed: ${error}`,

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
