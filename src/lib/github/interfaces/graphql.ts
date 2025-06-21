/**
 * GraphQL interfaces and types
 *
 * This file contains interfaces for GraphQL operations,
 * including pagination, batching, and response types.
 */

export interface GraphQLPageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string
  endCursor?: string
}

export interface GraphQLConnection<T> {
  edges: Array<{
    node: T
    cursor: string
  }>
  pageInfo: GraphQLPageInfo
  totalCount?: number
}

export interface BatchRequest {
  id: string
  query: string
  variables?: Record<string, unknown>
}

export interface BatchResponse<T = unknown> {
  id: string
  data?: T
  errors?: Array<{
    message: string
    type?: string
    path?: string[]
  }>
}

export interface GraphQLResponse<T = unknown> {
  data?: T
  errors?: Array<{
    message: string
    path?: Array<string | number>
    extensions?: Record<string, unknown>
  }>
  rateLimit?: import('./rate-limiting').GraphQLRateLimitInfo
}
