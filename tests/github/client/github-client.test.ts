import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import { GitHubAuthenticationError, GitHubClientError } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github'

describe('GitHubClient', () => {
  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('initialization', () => {
    it('should create client with minimal configuration', () => {
      const client = new GitHubClient()
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.rest).toBeDefined()
      expect(client.graphql).toBeDefined()
    })

    it('should create client with token authentication', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'token',
          token: 'ghp_test_token'
        }
      }
      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should create client with GitHub App authentication', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
          installationId: 789
        }
      }
      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should accept custom base URL', () => {
      const config: GitHubClientConfig = {
        baseUrl: 'https://github.enterprise.com/api/v3'
      }
      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should accept custom user agent', () => {
      const config: GitHubClientConfig = {
        userAgent: 'contribux/1.0.0'
      }
      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should throw error for invalid configuration', () => {
      const config = {
        auth: {
          type: 'invalid' as any
        }
      }
      expect(() => new GitHubClient(config)).toThrow(GitHubClientError)
    })
  })

  describe('REST API client', () => {
    it('should make authenticated REST API requests', async () => {
      const mockUser = { login: 'testuser', id: 123 }
      
      nock('https://api.github.com')
        .get('/user')
        .reply(200, mockUser)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data).toEqual(mockUser)
    })

    it('should handle REST API errors', async () => {
      nock('https://api.github.com')
        .get('/user')
        .reply(401, {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest'
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'invalid_token' }
      })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
    })

    it('should respect custom base URL for REST requests', async () => {
      const mockUser = { login: 'enterprise-user', id: 456 }
      
      nock('https://github.enterprise.com')
        .get('/api/v3/user')
        .reply(200, mockUser)

      const client = new GitHubClient({
        baseUrl: 'https://github.enterprise.com/api/v3',
        auth: { type: 'token', token: 'test_token' }
      })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data).toEqual(mockUser)
    })

    it('should include custom headers in REST requests', async () => {
      let capturedHeaders: any

      nock('https://api.github.com')
        .get('/user')
        .reply(function() {
          capturedHeaders = this.req.headers
          return [200, { login: 'testuser' }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        userAgent: 'contribux-test/1.0'
      })

      await client.rest.users.getAuthenticated()
      expect(capturedHeaders['user-agent']).toContain('contribux-test/1.0')
    })
  })

  describe('GraphQL client', () => {
    it('should make authenticated GraphQL requests', async () => {
      const mockResponse = {
        viewer: { login: 'testuser', name: 'Test User' }
      }

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, { data: mockResponse })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `query { viewer { login name } }`
      const result = await client.graphql(query)
      expect(result).toEqual(mockResponse)
    })

    it('should handle GraphQL errors', async () => {
      const mockErrors = [{
        message: 'Field "invalidField" doesn\'t exist on type "User"',
        locations: [{ line: 1, column: 15 }]
      }]

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, { errors: mockErrors })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `query { viewer { invalidField } }`
      await expect(client.graphql(query)).rejects.toThrow()
    })

    it('should pass variables to GraphQL queries', async () => {
      let capturedBody: any

      nock('https://api.github.com')
        .post('/graphql')
        .reply(function(uri, requestBody) {
          capturedBody = requestBody
          return [200, { data: { repository: { name: 'test-repo' } } }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `query($owner: String!, $name: String!) { 
        repository(owner: $owner, name: $name) { name } 
      }`
      const variables = { owner: 'testowner', name: 'testrepo' }
      
      await client.graphql(query, variables)
      expect(capturedBody.variables).toEqual(variables)
    })

    it('should respect custom base URL for GraphQL requests', async () => {
      nock('https://github.enterprise.com')
        .post('/api/graphql')
        .reply(200, { data: { viewer: { login: 'enterprise-user' } } })

      const client = new GitHubClient({
        baseUrl: 'https://github.enterprise.com/api/v3',
        auth: { type: 'token', token: 'test_token' }
      })

      const result = await client.graphql(`query { viewer { login } }`)
      expect(result.viewer.login).toBe('enterprise-user')
    })
  })

  describe('error handling', () => {
    it('should properly handle network errors', async () => {
      nock('https://api.github.com')
        .get('/user')
        .replyWithError('Network error')

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
    })

    it('should handle authentication errors', async () => {
      nock('https://api.github.com')
        .get('/user')
        .reply(401, {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest'
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'invalid_token' }
      })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
    })

    it('should handle rate limit headers', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600

      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': resetTime.toString(),
          'x-ratelimit-used': '1'
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const response = await client.rest.users.getAuthenticated()
      expect(response.headers['x-ratelimit-remaining']).toBe('4999')
    })
  })

  describe('request serialization', () => {
    it('should properly serialize request payloads', async () => {
      let capturedBody: any

      nock('https://api.github.com')
        .post('/repos/testowner/testrepo/issues')
        .reply(function(uri, requestBody) {
          capturedBody = requestBody
          return [201, { number: 1, title: 'Test Issue' }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const issueData = {
        title: 'Test Issue',
        body: 'This is a test issue',
        labels: ['bug', 'enhancement']
      }

      await client.rest.issues.create({
        owner: 'testowner',
        repo: 'testrepo',
        ...issueData
      })

      expect(capturedBody).toEqual(issueData)
    })

    it('should handle response deserialization', async () => {
      const mockIssue = {
        number: 1,
        title: 'Test Issue',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }

      nock('https://api.github.com')
        .get('/repos/testowner/testrepo/issues/1')
        .reply(200, mockIssue)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const response = await client.rest.issues.get({
        owner: 'testowner',
        repo: 'testrepo',
        issue_number: 1
      })

      expect(response.data).toEqual(mockIssue)
      expect(response.status).toBe(200)
    })
  })

  describe('configuration options', () => {
    it('should apply throttle configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          maxRetries: 3,
          minimumSecondaryRateRetryAfter: 60
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should apply retry configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        retry: {
          enabled: true,
          retries: 5,
          doNotRetry: [404, 422]
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should apply cache configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          ttl: 300,
          storage: 'memory'
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should apply log level configuration', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        log: 'debug'
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })
})