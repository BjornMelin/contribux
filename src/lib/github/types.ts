/**
 * GitHub API types and interfaces
 *
 * This file serves as the main export point for GitHub API types
 * while organizing interfaces into dedicated modules for better maintainability.
 *
 * @deprecated This file is being phased out in favor of organized interface modules.
 * Consider importing from './interfaces' instead for new code.
 */

// Re-export all interfaces from the organized interface modules
export type {
  BatchRequest,
  BatchResponse,
  CacheEntry,
  CacheMetrics,
  CacheOptions,
  CircuitBreakerOptions,
  GitHubAuthConfig,
  GitHubClientConfig,
  GitHubError,
  GitHubErrorResponse,
  GitHubGraphQLClient,
  GitHubRestClient,
  GraphQLConnection,
  GraphQLPageInfo,
  GraphQLRateLimitInfo,
  GraphQLResponse,
  LogLevel,
  OctokitHeaders,
  OctokitRequestOptions,
  OctokitResponse,
  RateLimitInfo,
  RateLimitResponse,
  RedisLikeClient,
  RequestOptions,
  RetryOptions,
  RetryState,
  ThrottleOptions,
  TokenInfo,
  TokenRotationConfig,
  WebhookValidationResult,
} from './interfaces'
