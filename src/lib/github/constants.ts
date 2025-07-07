/**
 * GitHub API client constants
 * Contains all magic numbers and configuration values
 */

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const

// Retry Configuration
export const RETRY_DEFAULTS = {
  MAX_RETRIES: 3,
  MAX_RETRY_COUNT: 10,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000, // 30 seconds
  JITTER_PERCENTAGE: 0.1, // ±10%
  RETRY_AFTER_JITTER_PERCENTAGE: 0.05, // ±5%
} as const

// Circuit Breaker Configuration
export const CIRCUIT_BREAKER_DEFAULTS = {
  FAILURE_THRESHOLD: 5,
  RECOVERY_TIMEOUT_MS: 60000, // 1 minute
  MIN_RECOVERY_TIMEOUT_MS: 1000, // 1 second
} as const

// Rate Limiting Configuration
export const RATE_LIMIT_DEFAULTS = {
  CORE_LIMIT: 5000,
  SEARCH_LIMIT: 30,
  GRAPHQL_LIMIT: 5000,
  PERCENTAGE_WARNING_THRESHOLD: 80, // Warn when 80% of rate limit is used
  PERCENTAGE_CRITICAL_THRESHOLD: 95, // Critical when 95% of rate limit is used
} as const

// Cache Configuration
export const CACHE_DEFAULTS = {
  TTL_MS: 300000, // 5 minutes
  MAX_SIZE: 1000,
  BACKGROUND_REFRESH_THRESHOLD: 0.8, // Refresh when 80% of TTL has passed
  STALE_WHILE_REVALIDATE_MS: 60000, // 1 minute
} as const

// GraphQL Configuration
export const GRAPHQL_DEFAULTS = {
  MAX_QUERY_DEPTH: 10,
  MAX_QUERY_COST: 5000,
  MAX_BATCH_SIZE: 100,
  MAX_FIELD_COUNT: 500,
  MAX_ALIAS_COUNT: 30,
} as const

// Token Rotation Configuration
export const TOKEN_ROTATION_DEFAULTS = {
  ROTATION_INTERVAL_MS: 3600000, // 1 hour
  MIN_ROTATION_INTERVAL_MS: 300000, // 5 minutes
  TOKEN_EXPIRY_WARNING_MS: 300000, // Warn 5 minutes before expiry
} as const

// Webhook Configuration
export const WEBHOOK_DEFAULTS = {
  SIGNATURE_ALGORITHM: 'sha256',
  LEGACY_SIGNATURE_ALGORITHM: 'sha1',
  // DEPRECATED: Use Zod's built-in z.uuid() validation instead
  // DELIVERY_ID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  MAX_PAYLOAD_SIZE: 25 * 1024 * 1024, // 25MB
} as const

// Timeout Configuration
export const TIMEOUT_DEFAULTS = {
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  SEARCH_TIMEOUT_MS: 60000, // 60 seconds for search operations
  GRAPHQL_TIMEOUT_MS: 120000, // 2 minutes for complex GraphQL queries
} as const

// Pagination Configuration
export const PAGINATION_DEFAULTS = {
  PER_PAGE: 100,
  MAX_PER_PAGE: 100,
  MIN_PER_PAGE: 1,
} as const

// DataLoader Configuration
export const DATALOADER_DEFAULTS = {
  BATCH_DELAY_MS: 0, // Process immediately
  MAX_BATCH_SIZE: 100,
  CACHE_ENABLED: true,
} as const

// Error Messages (moved from errors.ts for completeness)
export const ERROR_CODES = {
  RATE_LIMITED: 'RATE_LIMITED',
  SECONDARY_RATE_LIMITED: 'SECONDARY_RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  GRAPHQL_PARSE_FAILED: 'GRAPHQL_PARSE_FAILED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
} as const

// Time constants
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const

// Export type unions for TypeScript
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
