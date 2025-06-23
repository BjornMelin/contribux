/**
 * GitHub API Types
 *
 * Core interface definitions for GitHub API entities.
 * Provides clean, focused type definitions for the GitHub client.
 */

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
}

export interface IssueIdentifier extends RepositoryIdentifier {
  issueNumber: number
}

export interface PullRequestIdentifier extends RepositoryIdentifier {
  pullNumber: number
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
}

export interface SearchResult<T> {
  total_count: number
  incomplete_results: boolean
  items: T[]
}
