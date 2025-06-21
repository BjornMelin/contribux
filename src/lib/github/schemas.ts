/**
 * Zod schemas for GitHub API client types
 * Provides runtime validation and TypeScript type inference
 */

import { z } from 'zod'
import { CACHE_DEFAULTS, CIRCUIT_BREAKER_DEFAULTS, RETRY_DEFAULTS } from './constants'

// Authentication schemas
export const TokenAuthSchema = z.object({
  type: z.literal('token'),
  token: z.string().min(1, { message: 'Token cannot be empty' }),
})

export const AppAuthSchema = z.object({
  type: z.literal('app'),
  appId: z.union([z.string().min(1), z.number().int().positive()]),
  privateKey: z.string().min(1, { message: 'Private key is required' }),
  installationId: z.union([z.string().min(1), z.number().int().positive()]).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
})

export const AuthConfigSchema = z.union([TokenAuthSchema, AppAuthSchema])

// Retry schemas
export const RetryOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  retries: z.number().int().min(0).max(RETRY_DEFAULTS.MAX_RETRY_COUNT).optional(),
  retryAfterBaseValue: z.number().min(0).optional(),
  doNotRetry: z.array(z.number().int().min(100).max(599)).optional(),
  shouldRetry: z
    .function()
    .args(z.unknown(), z.number().int().min(0))
    .returns(z.boolean())
    .optional(),
  calculateDelay: z
    .function()
    .args(z.number().int().min(0), z.number().int().min(0).optional(), z.number().min(0).optional())
    .returns(z.number().min(0))
    .optional(),
  onRetry: z
    .function()
    .args(z.unknown(), z.number().int().min(0), z.unknown())
    .returns(z.void())
    .optional(),
  circuitBreaker: z
    .object({
      enabled: z.boolean(),
      failureThreshold: z.number().min(1).default(CIRCUIT_BREAKER_DEFAULTS.FAILURE_THRESHOLD),
      recoveryTimeout: z
        .number()
        .min(CIRCUIT_BREAKER_DEFAULTS.MIN_RECOVERY_TIMEOUT_MS)
        .default(CIRCUIT_BREAKER_DEFAULTS.RECOVERY_TIMEOUT_MS),
    })
    .optional(),
})

// Cache schemas
export const CacheStorageSchema = z.enum(['memory', 'redis'])

export const CacheOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  storage: CacheStorageSchema.default('memory'),
  ttl: z
    .number()
    .min(0)
    .default(CACHE_DEFAULTS.TTL_MS / 1000), // in seconds
  maxSize: z.number().min(1).default(CACHE_DEFAULTS.MAX_SIZE),
  excludePatterns: z.array(z.string()).optional(),
  includeHeaders: z.boolean().optional(),
  backgroundRefresh: z.boolean().optional(),
  refreshThreshold: z.number().min(0).max(1).optional(),
  redis: z.any().optional(), // RedisLike interface
})

export const CacheEntrySchema = z.object({
  data: z.unknown(),
  etag: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  ttl: z.number().int().min(0).optional(),
})

// Rate limit schemas
export const RateLimitInfoSchema = z.object({
  limit: z.number().int().min(0),
  remaining: z.number().int().min(0),
  reset: z.date(),
  used: z.number().int().min(0),
})

export const GraphQLRateLimitInfoSchema = RateLimitInfoSchema.extend({
  cost: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
})

// Error schemas
export const GitHubErrorResponseSchema = z.object({
  message: z.string(),
  documentation_url: z.string().optional(),
  errors: z
    .array(
      z.object({
        resource: z.string().optional(),
        field: z.string().optional(),
        code: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .optional(),
})

// GraphQL schemas
export const GraphQLErrorSchema = z.object({
  message: z.string(),
  extensions: z
    .object({
      code: z.string().optional(),
      argumentName: z.string().optional(),
      typeName: z.string().optional(),
      fieldName: z.string().optional(),
    })
    .optional(),
  locations: z
    .array(
      z.object({
        line: z.number(),
        column: z.number(),
      })
    )
    .optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
})

export const GraphQLResponseSchema = z.object({
  data: z.unknown().nullable(),
  errors: z.array(GraphQLErrorSchema).optional(),
  extensions: z
    .object({
      rateLimit: GraphQLRateLimitInfoSchema.optional(),
    })
    .optional(),
})

// Webhook schemas
export const WebhookEventSchema = z.object({
  type: z.string().min(1),
  action: z.string().min(1).optional(),
  deliveryId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID format for delivery ID',
  }),
  payload: z.record(z.string(), z.unknown()),
})

export const WebhookConfigSchema = z.object({
  secret: z.string().min(1),
  path: z.string().default('/webhook'),
  validateSignature: z.boolean().default(true),
})

// Client configuration schema
export const GitHubClientConfigSchema = z.object({
  auth: AuthConfigSchema.optional(),
  retry: RetryOptionsSchema.optional(),
  cache: CacheOptionsSchema.optional(),
  baseUrl: z.string().url().optional(),
  userAgent: z.string().optional(),
  timeZone: z.string().optional(),
  previews: z.array(z.string()).optional(),
  throttle: z
    .object({
      onSecondaryRateLimit: z.function().args(z.number(), z.any()).returns(z.void()).optional(),
      onRateLimit: z.function().args(z.number(), z.any()).returns(z.void()).optional(),
    })
    .optional(),
  request: z
    .object({
      agent: z.any().optional(),
      fetch: z.function().optional(),
      signal: z.any().optional(),
      timeout: z.number().optional(),
    })
    .optional(),
  pagination: z
    .object({
      perPage: z.number().min(1).max(100).optional(),
    })
    .optional(),
})

// Token rotation schemas
export const TokenInfoSchema = z.object({
  token: z.string(),
  type: z.enum(['personal', 'app', 'installation']),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.date().optional(),
  rateLimit: RateLimitInfoSchema.optional(),
  isActive: z.boolean().default(true),
  quarantinedUntil: z.date().optional(),
})

export const TokenRotationOptionsSchema = z.object({
  tokens: z.array(TokenInfoSchema).min(1),
  rotationStrategy: z.enum(['round-robin', 'least-used', 'random']).default('round-robin'),
  refreshBeforeExpiry: z.number().min(0).optional(), // minutes
})

// DataLoader schemas
export const DataLoaderOptionsSchema = z.object({
  batchingEnabled: z.boolean().default(true),
  maxBatchSize: z.number().int().min(1).max(1000).default(100),
  batchScheduleFn: z.function().args(z.function()).returns(z.void()).optional(),
  cacheEnabled: z.boolean().default(true),
})

// Query optimizer schemas
export const QueryAnalysisSchema = z.object({
  points: z.number().int().min(0),
  nodeCount: z.number().int().min(0),
  depth: z.number().int().min(0),
  suggestions: z.array(z.string().min(1)),
})

export const OptimizedQuerySchema = z.object({
  query: z.string().min(1),
  variables: z.record(z.string(), z.unknown()).optional(),
  analysis: QueryAnalysisSchema,
})

// Type exports using Zod inference
export type TokenAuth = z.infer<typeof TokenAuthSchema>
export type AppAuth = z.infer<typeof AppAuthSchema>
export type AuthConfig = z.infer<typeof AuthConfigSchema>
export type RetryOptions = z.infer<typeof RetryOptionsSchema>
export type CacheOptions = z.infer<typeof CacheOptionsSchema>
export type CacheEntry = z.infer<typeof CacheEntrySchema>
export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>
export type GraphQLRateLimitInfo = z.infer<typeof GraphQLRateLimitInfoSchema>
export type GitHubErrorResponse = z.infer<typeof GitHubErrorResponseSchema>
export type GraphQLError = z.infer<typeof GraphQLErrorSchema>
export type GraphQLResponse = z.infer<typeof GraphQLResponseSchema>
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>
export type GitHubClientConfig = z.infer<typeof GitHubClientConfigSchema>
export type TokenInfo = z.infer<typeof TokenInfoSchema>
export type TokenRotationOptions = z.infer<typeof TokenRotationOptionsSchema>
export type DataLoaderOptions = z.infer<typeof DataLoaderOptionsSchema>
export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>
export type OptimizedQuery = z.infer<typeof OptimizedQuerySchema>

// Validation helper functions
export function validateAuthConfig(config: unknown): AuthConfig {
  return AuthConfigSchema.parse(config) as AuthConfig
}

export function validateRetryOptions(options: unknown): RetryOptions {
  return RetryOptionsSchema.parse(options) as RetryOptions
}

export function validateCacheOptions(options: unknown): CacheOptions {
  return CacheOptionsSchema.parse(options) as CacheOptions
}

export function validateGitHubClientConfig(config: unknown): GitHubClientConfig {
  return GitHubClientConfigSchema.parse(config) as GitHubClientConfig
}

export function validateCacheEntry(entry: unknown): CacheEntry {
  return CacheEntrySchema.parse(entry) as CacheEntry
}

export function validateGraphQLResponse(response: unknown): GraphQLResponse {
  return GraphQLResponseSchema.parse(response) as GraphQLResponse
}

export function validateWebhookEvent(event: unknown): WebhookEvent {
  return WebhookEventSchema.parse(event) as WebhookEvent
}

export function validateTokenInfo(token: unknown): TokenInfo {
  return TokenInfoSchema.parse(token) as TokenInfo
}

export function validateTokenRotationOptions(options: unknown): TokenRotationOptions {
  return TokenRotationOptionsSchema.parse(options) as TokenRotationOptions
}

export function validateRateLimitInfo(info: unknown): RateLimitInfo {
  return RateLimitInfoSchema.parse(info) as RateLimitInfo
}

export function validateGraphQLRateLimitInfo(info: unknown): GraphQLRateLimitInfo {
  return GraphQLRateLimitInfoSchema.parse(info) as GraphQLRateLimitInfo
}

export function validateQueryAnalysis(analysis: unknown): QueryAnalysis {
  return QueryAnalysisSchema.parse(analysis) as QueryAnalysis
}
