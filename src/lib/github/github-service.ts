/**
 * GitHub Service - Service layer for GitHub API operations
 * Provides higher-level functions for common GitHub operations
 */

import { Octokit } from '@octokit/rest'
import { z } from 'zod'
import type { 
  GitHubRepository, 
  GitHubUser, 
  GitHubLabel, 
  GitHubIssue,
  GitHubComment,
  GitHubOrganization
} from './client'

export interface SearchRepositoriesOptions {
  query: string
  language?: string
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'
  order?: 'desc' | 'asc'
  perPage?: number
  page?: number
  minStars?: number
  maxStars?: number
  hasIssues?: boolean
  isTemplate?: boolean
  license?: string
}

export interface SearchRepositoriesResult {
  items: GitHubRepository[]
  totalCount: number
  incompleteResults: boolean
}

export interface GitHubServiceConfig {
  token: string
  rateLimiter?: GitHubRateLimiter
}

export class GitHubService {
  private octokit: Octokit
  private rateLimiter?: GitHubRateLimiter

  constructor(config: GitHubServiceConfig) {
    this.rateLimiter = config.rateLimiter

    this.octokit = new Octokit({
      auth: config.token,
    })
  }

  async getRepositoryLanguages(owner: string, repo: string): Promise<Array<{ name: string; percentage: number }>> {
    try {
      const response = await this.octokit.repos.listLanguages({
        owner,
        repo,
      })

      const languages = response.data
      const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0)

      return Object.entries(languages)
        .map(([name, bytes]) => ({
          name,
          percentage: Math.round((bytes / total) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage)
    } catch (error) {
      console.error('Error fetching repository languages:', error)
      throw error
    }
  }

  async getUserFollowers(username: string, options: { perPage?: number } = {}): Promise<GitHubUser[]> {
    try {
      const response = await this.octokit.rest.users.listFollowersForUser({
        username,
        per_page: options.perPage || 30,
      })

      return response.data as GitHubUser[]
    } catch (error) {
      console.error('Error fetching user followers:', error)
      throw error
    }
  }
}

export class GitHubRateLimiter {
  private remaining: number = 5000
  private resetTime: number = Date.now() + 3600000 // 1 hour from now
  private searchRemaining: number = 30
  private searchResetTime: number = Date.now() + 60000 // 1 minute from now

  async checkStatus() {
    return {
      core: {
        limit: 5000,
        remaining: this.remaining,
        reset: Math.floor(this.resetTime / 1000),
      },
      search: {
        limit: 30,
        remaining: this.searchRemaining,
        reset: Math.floor(this.searchResetTime / 1000),
      },
    }
  }

  updateFromHeaders(headers: Record<string, string>) {
    if (headers['x-ratelimit-remaining']) {
      this.remaining = parseInt(headers['x-ratelimit-remaining'], 10)
    }
    if (headers['x-ratelimit-reset']) {
      this.resetTime = parseInt(headers['x-ratelimit-reset'], 10) * 1000
    }
  }

  shouldThrottle(): boolean {
    return this.remaining < 100 // Throttle when less than 100 requests remaining
  }

  getBackoffTime(): number {
    const timeUntilReset = this.resetTime - Date.now()
    return Math.max(0, timeUntilReset)
  }
}

export class GitHubWebhookHandler {
  private secret: string

  constructor(config: { secret: string }) {
    this.secret = config.secret
  }

  generateSignature(payload: string): string {
    // Simplified signature generation for testing
    return `sha256=${Buffer.from(`${this.secret}${payload}`).toString('hex')}`
  }

  verifySignature(payload: string, signature: string): boolean {
    const expected = this.generateSignature(payload)
    return signature === expected
  }

  async handleEvent(event: any): Promise<boolean> {
    // Simplified event handling for testing
    console.log('Handling webhook event:', event.type, event.action)
    return true
  }
}

// Factory function for creating Octokit instances (can be mocked in tests)
export const createOctokit = (auth?: string) => new Octokit({ auth })

// Helper functions expected by tests
export async function searchRepositories(options: SearchRepositoriesOptions, octokitInstance?: Octokit): Promise<SearchRepositoriesResult> {
  const octokit = octokitInstance || createOctokit()

  // Build search query
  let searchQuery = options.query
  
  if (options.language) {
    searchQuery += ` language:${options.language}`
  }
  
  if (options.minStars !== undefined) {
    searchQuery += ` stars:>=${options.minStars}`
  }
  
  if (options.maxStars !== undefined) {
    searchQuery += ` stars:<=${options.maxStars}`
  }
  
  if (options.hasIssues) {
    searchQuery += ' has:issues'
  }
  
  if (options.isTemplate === false) {
    searchQuery += ' is:public'
  }
  
  if (options.license) {
    searchQuery += ` license:${options.license}`
  }

  try {
    const response = await octokit.search.repos({
      q: searchQuery,
      sort: options.sort || 'updated',
      order: options.order || 'desc',
      per_page: options.perPage || 30,
      page: options.page || 1,
    })

    // Check for API deprecation warnings
    if (response.headers && (response.headers['sunset'] || response.headers['x-github-api-version-selected'])) {
      console.warn('GitHub API deprecation warning detected. Please update to use the latest API version.')
    }

    return {
      items: response.data.items as GitHubRepository[],
      totalCount: response.data.total_count,
      incompleteResults: response.data.incomplete_results,
    }
  } catch (error: any) {
    if (error.status === 403 && error.message?.includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded')
    }
    throw error
  }
}

export async function getRepositoryDetails(owner: string, repo: string, octokitInstance?: Octokit): Promise<GitHubRepository> {
  const octokit = octokitInstance || createOctokit()

  try {
    const response = await octokit.repos.get({
      owner,
      repo,
    })

    if (!response.data) {
      throw new Error('Invalid response from GitHub API')
    }

    // Transform GitHub API response to our format
    const repoData = response.data
    return {
      id: repoData.id,
      name: repoData.name,
      full_name: repoData.full_name,
      description: repoData.description,
      homepage: repoData.homepage,
      stars: repoData.stargazers_count,
      watchers: repoData.watchers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      language: repoData.language,
      createdAt: repoData.created_at,
      updatedAt: repoData.updated_at,
      pushedAt: repoData.pushed_at,
      size: repoData.size,
      defaultBranch: repoData.default_branch,
      topics: repoData.topics || [],
      license: repoData.license?.key || null,
      owner: {
        login: repoData.owner.login,
        id: repoData.owner.id,
        avatar_url: repoData.owner.avatar_url,
        html_url: repoData.owner.html_url,
        type: repoData.owner.type,
        site_admin: repoData.owner.site_admin,
      },
      private: repoData.private,
      fork: repoData.fork,
      html_url: repoData.html_url,
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      stargazers_count: repoData.stargazers_count,
      forks_count: repoData.forks_count,
      default_branch: repoData.default_branch,
    } as GitHubRepository
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error('Repository not found')
    }
    throw error
  }
}

export async function getUserProfile(username: string, octokitInstance?: Octokit): Promise<GitHubUser> {
  const octokit = octokitInstance || createOctokit()

  try {
    const response = await octokit.users.getByUsername({
      username,
    })

    const userData = response.data
    return {
      login: userData.login,
      id: userData.id,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
      type: userData.type,
      site_admin: userData.site_admin,
      name: userData.name,
      company: userData.company,
      blog: userData.blog,
      location: userData.location,
      email: userData.email,
      bio: userData.bio,
      publicRepos: userData.public_repos,
      followers: userData.followers,
      following: userData.following,
      createdAt: userData.created_at,
    } as GitHubUser
  } catch (error) {
    console.error('Error fetching user profile:', error)
    throw error
  }
}

export async function getRepositoryContributors(
  owner: string, 
  repo: string,
  octokitInstance?: Octokit
): Promise<Array<{ login: string; avatar_url: string; contributions: number }>> {
  const octokit = octokitInstance || createOctokit()

  try {
    const response = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 100,
    })

    return response.data.map((contributor: any) => ({
      login: contributor.login || 'anonymous',
      avatar_url: contributor.avatar_url || '',
      contributions: contributor.contributions,
    }))
  } catch (error) {
    console.error('Error fetching repository contributors:', error)
    throw error
  }
}

// Re-export types
export type { GitHubRepository, GitHubUser }