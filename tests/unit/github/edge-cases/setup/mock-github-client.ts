/**
 * Mock GitHub Client for Edge Case Testing
 *
 * This file provides a simplified mock implementation of the GitHub client
 * that doesn't depend on Next.js modules, avoiding module resolution issues
 * in the test environment.
 */

export interface GitHubClientConfig {
  auth?: {
    type: 'token' | 'app'
    token?: string
    appId?: string
    privateKey?: string
  }
  retry?: {
    retries: number
  }
  throttle?: {
    onRateLimit: () => boolean
    onSecondaryRateLimit: () => boolean
  }
  cache?: {
    maxAge: number
    maxSize: number
  }
  timeout?: number
  maxRetries?: number
}

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: string
  site_admin: boolean
}

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
  default_branch: string
}

export class MockGitHubClient {
  private config: GitHubClientConfig
  private cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
  }

  constructor(config: Partial<GitHubClientConfig> = {}) {
    this.config = {
      auth: { type: 'token', token: 'test_token' },
      retry: { retries: 3 },
      throttle: {
        onRateLimit: () => true,
        onSecondaryRateLimit: () => true,
      },
      cache: {
        maxAge: 300000, // 5 minutes
        maxSize: 100,
      },
      timeout: 30000,
      maxRetries: 3,
      ...config,
    }
  }

  async getUser(username?: string): Promise<GitHubUser> {
    const url = username
      ? `https://api.github.com/users/${username}`
      : 'https://api.github.com/user'

    const headers: Record<string, string> = {}
    if (this.config.auth?.token) {
      headers.Authorization = `token ${this.config.auth.token}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }

  async getRepository(options: { owner: string; repo: string }): Promise<GitHubRepository> {
    const url = `https://api.github.com/repos/${options.owner}/${options.repo}`

    const headers: Record<string, string> = {}
    if (this.config.auth?.token) {
      headers.Authorization = `token ${this.config.auth.token}`
    }

    // Apply timeout configuration
    const controller = new AbortController()
    const timeoutId = this.config.timeout
      ? setTimeout(() => controller.abort(), this.config.timeout)
      : null

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      })

      if (timeoutId) clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout: Failed to fetch ${options.owner}/${options.repo}`)
      }

      throw error
    }
  }

  getCacheStats() {
    return { ...this.cacheStats }
  }

  clearCache() {
    this.cacheStats = { hits: 0, misses: 0, size: 0 }
  }
}
