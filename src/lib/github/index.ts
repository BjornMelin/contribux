// Core types - Export types first to establish canonical definitions

export type {
  GitHubClientConfig,
  GitHubIssue,
  GitHubLabel,
  GitHubRepository,
  GitHubUser,
  SearchResult,
} from './client'

// GitHub client implementation - Explicitly re-export client types to resolve conflicts
export { createGitHubClient, GitHubClient } from './client'
// Constants
export * from './constants'
// Error classes
export * from './errors'
export * from './types'
// Core utilities
export * from './utils'
