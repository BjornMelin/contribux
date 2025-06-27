/**
 * GitHub API Types
 *
 * Core interface definitions for GitHub API entities.
 * Provides clean, focused type definitions for the GitHub client.
 */

import { z } from 'zod'

// Configuration validation schemas
const TokenAuthSchema = z.object({
  type: z.literal('token'),
  token: z
    .string({
      required_error: 'Token is required for token authentication',
      invalid_type_error: 'Token must be a string',
    })
    .min(1, 'Token cannot be empty'),
})

const AppAuthSchema = z.object({
  type: z.literal('app'),
  appId: z
    .number({
      required_error: 'App ID is required for app authentication',
      invalid_type_error: 'App ID must be a positive integer',
    })
    .int()
    .positive('App ID must be a positive integer'),
  privateKey: z
    .string({
      required_error: 'Private key is required for app authentication',
      invalid_type_error: 'Private key must be a string',
    })
    .min(1, 'Private key cannot be empty'),
  installationId: z
    .number({
      invalid_type_error: 'Installation ID must be a positive integer',
    })
    .int()
    .positive('Installation ID must be a positive integer')
    .optional(),
})

const AuthSchema = z.any().refine(data => {
  if (!data || typeof data !== 'object') {
    return false
  }

  // Check for invalid type
  if (!data.type || !['token', 'app'].includes(data.type)) {
    throw new Error('Invalid authentication type. Must be "token" or "app"')
  }

  // Check for conflicts first
  const hasTokenFields = 'token' in data
  const hasAppFields = 'appId' in data || 'privateKey' in data || 'installationId' in data

  if (hasTokenFields && hasAppFields) {
    throw new Error('Cannot mix token and app authentication')
  }

  // Validate specific auth type
  if (data.type === 'token') {
    return TokenAuthSchema.parse(data)
  }
  if (data.type === 'app') {
    return AppAuthSchema.parse(data)
  }

  return true
})

const CacheOptionsSchema = z
  .object({
    maxAge: z
      .number({
        invalid_type_error: 'Cache maxAge must be a positive integer',
      })
      .int()
      .positive('Cache maxAge must be a positive integer')
      .optional(),
    maxSize: z
      .number({
        invalid_type_error: 'Cache maxSize must be a positive integer',
      })
      .int()
      .positive('Cache maxSize must be a positive integer')
      .optional(),
  })
  .optional()

const ThrottleOptionsSchema = z
  .object({
    onRateLimit: z
      .any()
      .refine(val => val === undefined || typeof val === 'function', {
        message: 'onRateLimit must be a function',
      })
      .optional(),
    onSecondaryRateLimit: z
      .any()
      .refine(val => val === undefined || typeof val === 'function', {
        message: 'onSecondaryRateLimit must be a function',
      })
      .optional(),
  })
  .optional()

const RetryOptionsSchema = z
  .object({
    retries: z
      .number({
        invalid_type_error: 'Retries must be a non-negative integer',
      })
      .int()
      .min(0, 'Retries must be a non-negative integer')
      .max(10, 'Retries cannot exceed 10')
      .optional(),
    doNotRetry: z
      .any()
      .refine(
        val =>
          val === undefined || (Array.isArray(val) && val.every(item => typeof item === 'string')),
        {
          message: 'doNotRetry must be an array of strings',
        }
      )
      .optional(),
  })
  .optional()

const GitHubClientConfigSchema = z
  .object({
    auth: AuthSchema.optional(),
    baseUrl: z
      .string({
        invalid_type_error: 'baseUrl must be a string',
      })
      .url('baseUrl must be a valid URL')
      .optional(),
    userAgent: z
      .string({
        invalid_type_error: 'userAgent must be a string',
      })
      .min(1, 'userAgent cannot be empty')
      .optional(),
    throttle: ThrottleOptionsSchema,
    cache: CacheOptionsSchema,
    retry: RetryOptionsSchema,
  })
  .refine(config => {
    // Warn about potentially problematic configurations
    if (config.cache?.maxAge && config.cache.maxAge < 30 && config.throttle?.onRateLimit) {
      // Warning: short cache duration with rate limiting may cause issues
    }
    return true
  })

// Export validation schemas and their inferred types
export {
  GitHubClientConfigSchema,
  AuthSchema,
  CacheOptionsSchema,
  ThrottleOptionsSchema,
  RetryOptionsSchema,
}
export type GitHubClientConfig = z.infer<typeof GitHubClientConfigSchema>
export type AuthConfig = z.infer<typeof AuthSchema>

// Core GitHub data structures
export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  owner: GitHubUser
  private: boolean
  html_url: string
  description: string | null
  fork: boolean
  created_at: string
  updated_at: string
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  default_branch: string
}

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: string
  site_admin: boolean
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  user: GitHubUser | null
  labels: GitHubLabel[]
  assignee: GitHubUser | null
  assignees: GitHubUser[]
  created_at: string
  updated_at: string
  html_url: string
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  user: GitHubUser | null
  head: GitHubPullRequestRef
  base: GitHubPullRequestRef
  merged: boolean
  mergeable: boolean | null
  created_at: string
  updated_at: string
  html_url: string
}

export interface GitHubPullRequestRef {
  ref: string
  sha: string
  user: GitHubUser | null
  repo: GitHubRepository | null
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description: string | null
}

// Identifier types
export interface RepositoryIdentifier {
  owner: string
  repo: string
  [key: string]: unknown
}

export interface IssueIdentifier extends RepositoryIdentifier {
  issueNumber: number
  [key: string]: unknown
}

export interface PullRequestIdentifier extends RepositoryIdentifier {
  pullNumber: number
  [key: string]: unknown
}

// Pagination and search types
export interface PaginationOptions {
  page?: number
  per_page?: number
}

export interface SearchOptions extends PaginationOptions {
  q: string
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'
  order?: 'asc' | 'desc'
  [key: string]: unknown
}

export interface SearchResult<T> {
  total_count: number
  incomplete_results: boolean
  items: T[]
}

// Token management types for load testing
export interface TokenInfo {
  token: string
  type: 'personal' | 'app' | 'installation'
  scopes?: string[]
  expiresAt?: Date
}
