/**
 * @vitest-environment node
 */

import { Octokit } from '@octokit/rest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOctokit,
  GitHubRateLimiter,
  GitHubService,
  GitHubWebhookHandler,
  getRepositoryContributors,
  getRepositoryDetails,
  getUserProfile,
  searchRepositories,
} from '@/lib/github/github-service'

// Mock the createOctokit factory function
vi.mock('@/lib/github/github-service', async () => {
  const actual = await vi.importActual('@/lib/github/github-service')
  return {
    ...actual,
    createOctokit: vi.fn(),
  }
})

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    search: {
      repos: vi.fn(),
      users: vi.fn(),
      issues: vi.fn(),
    },
    repos: {
      get: vi.fn(),
      listContributors: vi.fn(),
      getContent: vi.fn(),
      listLanguages: vi.fn(),
    },
    users: {
      getByUsername: vi.fn(),
      listFollowers: vi.fn(),
    },
    rateLimit: {
      get: vi.fn(),
    },
  })),
}))

describe('GitHub Integration Tests', () => {
  let githubService: GitHubService
  let mockOctokit: any
  let rateLimiter: GitHubRateLimiter

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a proper mock structure
    mockOctokit = {
      search: {
        repos: vi.fn(),
        users: vi.fn(),
        issues: vi.fn(),
      },
      repos: {
        get: vi.fn(),
        listContributors: vi.fn(),
        getContent: vi.fn(),
        listLanguages: vi.fn(),
      },
      users: {
        getByUsername: vi.fn(),
        listFollowers: vi.fn(),
      },
      rateLimit: {
        get: vi.fn(),
      },
    }

    // Mock the Octokit constructor to return our mock
    vi.mocked(Octokit).mockImplementation(() => mockOctokit)

    // Mock the createOctokit factory to return our mock
    vi.mocked(createOctokit).mockReturnValue(mockOctokit)

    rateLimiter = new GitHubRateLimiter()
    githubService = new GitHubService({
      token: 'test-github-token',
      rateLimiter,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Repository Search', () => {
    const mockSearchResults = {
      data: {
        total_count: 100,
        items: [
          {
            id: 1,
            name: 'awesome-project',
            full_name: 'user/awesome-project',
            description: 'An awesome project',
            stargazers_count: 1000,
            forks_count: 50,
            language: 'TypeScript',
            topics: ['javascript', 'typescript', 'web'],
            owner: {
              login: 'user',
              avatar_url: 'https://github.com/user.png',
            },
          },
        ],
      },
      headers: {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': String(Date.now() / 1000 + 3600),
      },
    }

    it('should search repositories with query', async () => {
      mockOctokit.search.repos.mockResolvedValueOnce(mockSearchResults)

      const results = await searchRepositories(
        {
          query: 'typescript web framework',
          language: 'TypeScript',
          sort: 'stars',
          perPage: 10,
        },
        mockOctokit
      )

      expect(results.items).toHaveLength(1)
      expect(results.items[0].name).toBe('awesome-project')
      expect(results.totalCount).toBe(100)

      expect(mockOctokit.search.repos).toHaveBeenCalledWith({
        q: 'typescript web framework language:TypeScript',
        sort: 'stars',
        order: 'desc',
        per_page: 10,
        page: 1,
      })
    })

    it('should handle search with filters', async () => {
      mockOctokit.search.repos.mockResolvedValueOnce(mockSearchResults)

      const _results = await searchRepositories(
        {
          query: 'react',
          language: 'JavaScript',
          minStars: 100,
          hasIssues: true,
          isTemplate: false,
          license: 'mit',
        },
        mockOctokit
      )

      expect(mockOctokit.search.repos).toHaveBeenCalledWith({
        q: 'react language:JavaScript stars:>=100 has:issues is:public license:mit',
        sort: 'best-match',
        order: 'desc',
        per_page: 30,
        page: 1,
      })
    })

    it('should handle rate limit errors', async () => {
      mockOctokit.search.repos.mockRejectedValueOnce({
        status: 403,
        message: 'API rate limit exceeded',
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Date.now() / 1000 + 3600),
        },
      })

      await expect(searchRepositories({ query: 'test' }, mockOctokit)).rejects.toThrow('rate limit')
    })

    it('should handle empty search results', async () => {
      mockOctokit.search.repos.mockResolvedValueOnce({
        data: { total_count: 0, items: [] },
      })

      const results = await searchRepositories({ query: 'nonexistent-repo-xyz' }, mockOctokit)

      expect(results.items).toHaveLength(0)
      expect(results.totalCount).toBe(0)
    })
  })

  describe('Repository Details', () => {
    const mockRepo = {
      data: {
        id: 1,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        description: 'Test repository',
        homepage: 'https://example.com',
        stargazers_count: 500,
        watchers_count: 100,
        forks_count: 25,
        open_issues_count: 10,
        language: 'JavaScript',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: '2023-01-01T00:00:00Z',
        size: 1024,
        default_branch: 'main',
        topics: ['javascript', 'nodejs'],
        license: {
          key: 'mit',
          name: 'MIT License',
        },
        owner: {
          login: 'owner',
          avatar_url: 'https://github.com/owner.png',
          type: 'User',
        },
      },
    }

    it('should get repository details', async () => {
      mockOctokit.repos.get.mockResolvedValueOnce(mockRepo)

      const repo = await getRepositoryDetails('owner', 'test-repo', mockOctokit)

      expect(repo.name).toBe('test-repo')
      expect(repo.stars).toBe(500)
      expect(repo.license).toBe('mit')

      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'test-repo',
      })
    })

    it('should get repository languages', async () => {
      mockOctokit.repos.listLanguages.mockResolvedValueOnce({
        data: {
          TypeScript: 60000,
          JavaScript: 30000,
          CSS: 10000,
        },
      })

      const languages = await githubService.getRepositoryLanguages('owner', 'repo')

      expect(languages).toEqual([
        { name: 'TypeScript', percentage: 60 },
        { name: 'JavaScript', percentage: 30 },
        { name: 'CSS', percentage: 10 },
      ])
    })

    it('should handle repository not found', async () => {
      mockOctokit.repos.get.mockRejectedValueOnce({
        status: 404,
        message: 'Not Found',
      })

      await expect(getRepositoryDetails('owner', 'nonexistent', mockOctokit)).rejects.toThrow(
        'not found'
      )
    })
  })

  describe('User Profile', () => {
    const mockUser = {
      data: {
        login: 'testuser',
        id: 123,
        avatar_url: 'https://github.com/testuser.png',
        name: 'Test User',
        company: 'Test Company',
        blog: 'https://testuser.com',
        location: 'San Francisco, CA',
        email: 'test@example.com',
        bio: 'Software Developer',
        public_repos: 50,
        followers: 100,
        following: 50,
        created_at: '2015-01-01T00:00:00Z',
      },
    }

    it('should get user profile', async () => {
      mockOctokit.users.getByUsername.mockResolvedValueOnce(mockUser)

      const user = await getUserProfile('testuser', mockOctokit)

      expect(user.login).toBe('testuser')
      expect(user.name).toBe('Test User')
      expect(user.publicRepos).toBe(50)

      expect(mockOctokit.users.getByUsername).toHaveBeenCalledWith({
        username: 'testuser',
      })
    })

    it('should get user followers', async () => {
      mockOctokit.users.listFollowers.mockResolvedValueOnce({
        data: [
          { login: 'follower1', avatar_url: 'https://github.com/f1.png' },
          { login: 'follower2', avatar_url: 'https://github.com/f2.png' },
        ],
      })

      const followers = await githubService.getUserFollowers('testuser', { perPage: 10 })

      expect(followers).toHaveLength(2)
      expect(followers[0].login).toBe('follower1')
    })
  })

  describe('Contributors', () => {
    const mockContributors = {
      data: [
        {
          login: 'contributor1',
          avatar_url: 'https://github.com/c1.png',
          contributions: 100,
        },
        {
          login: 'contributor2',
          avatar_url: 'https://github.com/c2.png',
          contributions: 50,
        },
      ],
    }

    it('should get repository contributors', async () => {
      mockOctokit.repos.listContributors.mockResolvedValueOnce(mockContributors)

      const contributors = await getRepositoryContributors('owner', 'repo', mockOctokit)

      expect(contributors).toHaveLength(2)
      expect(contributors[0].login).toBe('contributor1')
      expect(contributors[0].contributions).toBe(100)

      expect(mockOctokit.repos.listContributors).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 100,
      })
    })

    it('should handle anonymous contributors', async () => {
      mockOctokit.repos.listContributors.mockResolvedValueOnce({
        data: [
          {
            login: null,
            name: 'Anonymous',
            email: 'anon@example.com',
            contributions: 10,
          },
        ],
      })

      const contributors = await getRepositoryContributors('owner', 'repo', mockOctokit)

      expect(contributors[0].login).toBe('anonymous')
      expect(contributors[0].contributions).toBe(10)
    })
  })

  describe('Rate Limiting', () => {
    it('should check rate limit status', async () => {
      const status = await rateLimiter.checkStatus()

      expect(status.core.remaining).toBe(5000)
      expect(status.search.remaining).toBe(30)
    })

    it('should throttle requests when approaching limit', async () => {
      // Set low remaining requests
      rateLimiter.updateFromHeaders({
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset': String(Date.now() / 1000 + 3600),
      })

      const shouldThrottle = rateLimiter.shouldThrottle()
      expect(shouldThrottle).toBe(true)
    })

    it('should calculate backoff time', () => {
      const resetTime = Date.now() / 1000 + 300 // 5 minutes from now
      rateLimiter.updateFromHeaders({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetTime),
      })

      const backoffMs = rateLimiter.getBackoffTime()
      expect(backoffMs).toBeGreaterThan(290000) // At least 4.8 minutes
      expect(backoffMs).toBeLessThan(310000) // At most 5.2 minutes
    })
  })

  describe('Webhook Handling', () => {
    let webhookHandler: GitHubWebhookHandler

    beforeEach(() => {
      webhookHandler = new GitHubWebhookHandler({
        secret: 'webhook-secret',
      })
    })

    it('should validate webhook signature', () => {
      const payload = JSON.stringify({ action: 'opened' })
      const signature = webhookHandler.generateSignature(payload)

      const isValid = webhookHandler.verifySignature(payload, signature)
      expect(isValid).toBe(true)
    })

    it('should reject invalid webhook signature', () => {
      const payload = JSON.stringify({ action: 'opened' })
      const invalidSignature = 'sha256=invalid'

      const isValid = webhookHandler.verifySignature(payload, invalidSignature)
      expect(isValid).toBe(false)
    })

    it('should handle repository events', async () => {
      const event = {
        type: 'repository',
        action: 'created',
        repository: {
          id: 123,
          name: 'new-repo',
          full_name: 'user/new-repo',
        },
      }

      const handled = await webhookHandler.handleEvent(event)
      expect(handled).toBe(true)
    })

    it('should handle pull request events', async () => {
      const event = {
        type: 'pull_request',
        action: 'opened',
        pull_request: {
          id: 456,
          number: 1,
          title: 'New feature',
          state: 'open',
        },
        repository: {
          full_name: 'user/repo',
        },
      }

      const handled = await webhookHandler.handleEvent(event)
      expect(handled).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockOctokit.search.repos.mockRejectedValueOnce(new Error('Network error'))

      await expect(searchRepositories({ query: 'test' }, mockOctokit)).rejects.toThrow(
        'Network error'
      )
    })

    it('should handle malformed responses', async () => {
      mockOctokit.repos.get.mockResolvedValueOnce({
        data: null, // Invalid response
      })

      await expect(getRepositoryDetails('owner', 'repo', mockOctokit)).rejects.toThrow(
        'Invalid response'
      )
    })

    it('should handle API deprecation warnings', async () => {
      const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockOctokit.search.repos.mockResolvedValueOnce({
        data: {
          total_count: 1,
          items: [
            {
              id: 1,
              name: 'test-repo',
              full_name: 'user/test-repo',
              description: 'Test repository',
              stargazers_count: 100,
              language: 'JavaScript',
            },
          ],
        },
        headers: {
          'x-github-api-version-selected': '2022-11-28',
          sunset: '2024-01-01',
        },
      })

      await searchRepositories({ query: 'test' }, mockOctokit)

      expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('API deprecation'))
      warningSpy.mockRestore()
    })
  })
})
