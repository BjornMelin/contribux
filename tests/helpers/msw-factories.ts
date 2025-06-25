/**
 * Enhanced MSW handler factories for consistent API mocking
 * Provides type-safe mock builders with common patterns
 */

import { z } from 'zod'
import { resetAllGitHubMockCounters } from './github-mocks'
import {
  createErrorHandler,
  createGraphQLHandler,
  createRateLimitHandler,
  createRepositoryHandler,
  createRepositoryIssuesHandler,
  createUserHandler,
  createUserRepositoriesHandler,
} from './msw-setup'

// GitHub API response schemas for validation
export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  name: z.string().nullable(),
  avatar_url: z.string().url(),
  html_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean(),
  public_repos: z.number(),
  public_gists: z.number(),
  followers: z.number(),
  following: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  email: z.string().email().nullable().optional(),
  bio: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  blog: z.string().nullable().optional(),
  twitter_username: z.string().nullable().optional(),
})

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().url(),
    html_url: z.string().url(),
    type: z.string(),
    site_admin: z.boolean(),
  }),
  html_url: z.string().url(),
  description: z.string().nullable(),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  size: z.number(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  language: z.string().nullable(),
  forks_count: z.number(),
  archived: z.boolean(),
  disabled: z.boolean(),
  open_issues_count: z.number(),
  license: z
    .object({
      key: z.string(),
      name: z.string(),
      spdx_id: z.string(),
      url: z.string().url(),
    })
    .nullable(),
  forks: z.number(),
  open_issues: z.number(),
  watchers: z.number(),
  default_branch: z.string(),
  topics: z.array(z.string()).default([]),
})

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  labels: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string(),
      description: z.string().nullable(),
    })
  ),
  user: GitHubUserSchema,
  assignee: GitHubUserSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  html_url: z.string().url(),
  repository_url: z.string().url(),
})

export const GitHubRateLimitSchema = z.object({
  core: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
  search: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
  graphql: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
})

// Type exports
export type GitHubUser = z.infer<typeof GitHubUserSchema>
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>
export type GitHubRateLimit = z.infer<typeof GitHubRateLimitSchema>

// GitHub API base URLs
const GITHUB_API_BASE = 'https://api.github.com'
const _GITHUB_GRAPHQL_URL = `${GITHUB_API_BASE}/graphql`

// Legacy MSWHandlerFactory class has been replaced with plain functions
// All functionality is now available through direct function imports from './msw-setup'

/**
 * Reset factory counters for test isolation
 */
export function resetMockFactoryCounters(): void {
  resetAllGitHubMockCounters()
}

/**
 * Common handler sets for different testing scenarios
 */
export const CommonHandlerSets = {
  /**
   * Basic GitHub API handlers for standard functionality
   */
  basic: () => [
    createUserHandler(),
    createRateLimitHandler(),
    createRepositoryHandler('testowner', 'test-repo'),
    createGraphQLHandler(),
  ],

  /**
   * Handlers for testing error scenarios
   */
  errors: () => [
    createErrorHandler('https://api.github.com/user', 401),
    createErrorHandler('https://api.github.com/repos/invalid/repo', 404),
    createErrorHandler('https://api.github.com/rate_limit', 403),
  ],

  /**
   * Handlers for search functionality testing
   */
  search: () => [createRepositoryIssuesHandler('testowner', 'test-repo'), createRateLimitHandler()],

  /**
   * Comprehensive handlers for integration tests
   */
  comprehensive: () => [
    ...CommonHandlerSets.basic(),
    ...CommonHandlerSets.search(),
    createUserRepositoriesHandler('testuser'),
    createRepositoryIssuesHandler('testowner', 'test-repo', 5),
  ],
}
