/**
 * Shared Octokit type definitions
 *
 * These types define the structure of Octokit API responses and methods
 * to avoid using 'any' types throughout the codebase.
 */

/**
 * Generic REST API response structure
 */
export interface OctokitResponse<T = unknown> {
  data: T
  status: number
  headers: Record<string, string>
  url: string
}

/**
 * REST API method signature
 */
export type RestApiMethod<TParams = unknown, TResponse = unknown> = (
  params?: TParams
) => Promise<OctokitResponse<TResponse>>

/**
 * GraphQL variables type
 */
export type GraphQLVariables = Record<string, unknown>

/**
 * GraphQL response type
 */
export type GraphQLResponse<T = unknown> = T

/**
 * Request options for Octokit
 */
export interface OctokitRequestOptions {
  method?: string
  url?: string
  headers?: Record<string, string>
  data?: unknown
  request?: {
    retryCount?: number
  }
}

/**
 * Octokit constructor options
 */
export interface OctokitOptions {
  auth?: string | unknown
  userAgent?: string
  baseUrl?: string
  throttle?: {
    onRateLimit?: (
      retryAfter: number,
      options: OctokitRequestOptions,
      octokit: unknown,
      retryCount: number
    ) => boolean | Promise<boolean>
    onSecondaryRateLimit?: (
      retryAfter: number,
      options: OctokitRequestOptions,
      octokit: unknown,
      retryCount: number
    ) => boolean | Promise<boolean>
  }
  retry?: {
    doNotRetry?: string[]
  }
}
