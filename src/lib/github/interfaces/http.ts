/**
 * HTTP and Octokit-specific interfaces
 *
 * This file contains interfaces for HTTP requests, responses,
 * and Octokit-specific headers and options.
 */

export interface GitHubErrorResponse {
  message: string
  documentation_url?: string
  errors?: Array<{
    resource: string
    field: string
    code: string
  }>
}

export interface OctokitHeaders {
  'x-ratelimit-limit'?: string
  'x-ratelimit-remaining'?: string
  'x-ratelimit-reset'?: string
  'x-ratelimit-used'?: string
  'x-ratelimit-resource'?: string
  'retry-after'?: string
  'if-none-match'?: string
  etag?: string
  'cache-control'?: string
  [key: string]: string | undefined
}

export interface OctokitRequestOptions {
  method?: string
  url?: string
  headers?: OctokitHeaders
  mediaType?: {
    format?: string
    previews?: string[]
  }
  data?: unknown
  [key: string]: unknown
}

export interface OctokitResponse<T = unknown> {
  data: T
  status: number
  headers: OctokitHeaders
  url: string
}
