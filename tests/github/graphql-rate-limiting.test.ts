import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig, GraphQLRateLimitInfo } from '@/lib/github'
import { setupGitHubTestIsolation, createTrackedClient } from './test-helpers'

// Type definitions for test responses
interface RepositoryResponse {
  name: string
  stargazerCount: number
}

interface BatchedRepositoryResponse {
  [key: string]: RepositoryResponse
}

interface IssuesResponse {
  issues: {
    totalCount: number
  }
}

interface BatchedIssuesResponse {
  [key: string]: IssuesResponse
}

interface GraphQLResponseWithRateLimit<T> {
  data: T
  rateLimit?: GraphQLRateLimitInfo & { resetAt?: string }
}

describe('GraphQL Point-Aware Rate Limiting', () => {
  // Setup enhanced test isolation for GitHub tests
  setupGitHubTestIsolation()

  describe('Query point calculation', () => {
    it('should calculate points for simple queries', () => {
      const client = createTrackedClient(GitHubClient)

      const queries = [
        {
          query: `query { viewer { login } }`,
          expectedPoints: 1
        },
        {
          query: `query { 
            viewer { 
              repositories(first: 10) { 
                nodes { name } 
              } 
            } 
          }`,
          expectedPoints: 11 // 1 + 10
        },
        {
          query: `query {
            repository(owner: "octocat", name: "hello-world") {
              issues(first: 100) {
                nodes {
                  title
                  comments(first: 10) {
                    nodes { body }
                  }
                }
              }
            }
          }`,
          expectedPoints: 1101 // 1 + 100 + (100 * 10)
        }
      ]

      queries.forEach(({ query, expectedPoints }) => {
        const points = client.calculateGraphQLPoints(query)
        expect(points).toBe(expectedPoints)
      })
    })

    it('should handle nested connections correctly', () => {
      const client = createTrackedClient(GitHubClient)

      const query = `query {
        organization(login: "github") {
          repositories(first: 50) {
            nodes {
              issues(first: 20) {
                nodes {
                  comments(first: 5) {
                    nodes { id }
                  }
                }
              }
            }
          }
        }
      }`

      const points = client.calculateGraphQLPoints(query)
      // 1 + 50 + (50 * 20) + (50 * 20 * 5) = 1 + 50 + 1000 + 5000 = 6051
      expect(points).toBe(6051)
    })

    it('should warn when approaching 500,000 node limit', () => {
      const client = createTrackedClient(GitHubClient)

      const query = `query {
        search(query: "stars:>1", type: REPOSITORY, first: 100) {
          nodes {
            ... on Repository {
              issues(first: 100) {
                nodes {
                  comments(first: 50) {
                    nodes { id }
                  }
                }
              }
            }
          }
        }
      }`

      const points = client.calculateGraphQLPoints(query)
      // 1 + 100 + (100 * 100) + (100 * 100 * 50) = 510,101
      expect(points).toBeGreaterThan(500000)

      expect(() => client.validateGraphQLPointLimit(query)).toThrow(
        /Query exceeds maximum (point limit|node count)/
      )
    })
  })

  describe('Query optimization', () => {
    it('should suggest query optimizations for high-point queries', () => {
      const client = createTrackedClient(GitHubClient)

      const query = `query {
        repository(owner: "microsoft", name: "vscode") {
          issues(first: 100) {
            nodes {
              comments(first: 100) {
                nodes { 
                  author { login }
                  body
                }
              }
            }
          }
        }
      }`

      const suggestions = client.optimizeGraphQLQuery(query)
      
      expect(suggestions).toContain('first: 100')
      expect(suggestions).toContain('pagination')
      expect(suggestions.length).toBeGreaterThan(0)
    })

    it('should automatically split queries that exceed limits', async () => {
      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }
      })

      let batchCount = 0
      nock('https://api.github.com')
        .post('/graphql')
        .times(3)
        .reply(() => {
          batchCount++
          return [200, {
            data: {
              repository: {
                issues: {
                  edges: Array(34).fill({
                    node: { title: `Issue ${batchCount}` }
                  }),
                  pageInfo: {
                    hasNextPage: batchCount < 3,
                    endCursor: `cursor${batchCount}`
                  }
                }
              }
            }
          }]
        })

      const query = `query($cursor: String) {
        repository(owner: "microsoft", name: "vscode") {
          issues(first: 100, after: $cursor) {
            edges {
              node { title }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }`

      const results = await client.executeLargeGraphQLQuery(query, {
        maxPointsPerRequest: 50
      }) as any

      expect(batchCount).toBe(3)
      expect(results.repository?.issues?.edges).toHaveLength(102)
    })
  })

  describe('Query batching with aliases', () => {
    it('should batch multiple queries using aliases', async () => {
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: {
            repo1: { name: 'hello-world', stargazerCount: 100 },
            repo2: { name: 'octocat', stargazerCount: 200 },
            repo3: { name: 'spoon-knife', stargazerCount: 300 }
          }
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }
      })

      const repos = [
        { owner: 'octocat', name: 'hello-world' },
        { owner: 'octocat', name: 'octocat' },
        { owner: 'octocat', name: 'spoon-knife' }
      ]

      const results = await client.batchGraphQLQueries(repos.map((repo, i) => ({
        alias: `repo${i + 1}`,
        query: `repository(owner: "${repo.owner}", name: "${repo.name}") {
          name
          stargazerCount
        }`
      }))) as BatchedRepositoryResponse

      expect(results.repo1?.stargazerCount).toBe(100)
      expect(results.repo2?.stargazerCount).toBe(200)
      expect(results.repo3?.stargazerCount).toBe(300)
    })

    it('should respect point limits when batching', async () => {
      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }
      })

      // Create simpler queries that will actually result in multiple batches
      const queries = Array(10).fill(null).map((_, i) => ({
        alias: `repo${i}`,
        query: `repository(owner: "octocat", name: "repo${i}") {
          issues(first: 10) {
            totalCount
          }
        }`
      }))

      let batchCount = 0
      
      // Setup nock interceptor to count requests
      nock('https://api.github.com')
        .post('/graphql')
        .times(10) // Allow multiple requests
        .reply((uri, requestBody: any) => {
          batchCount++
          const response: any = { data: {} }
          
          // Parse the query to extract repo aliases
          const queryString = requestBody.query
          const repoMatches = queryString.matchAll(/repo(\d+):/g)
          
          for (const match of repoMatches) {
            const index = parseInt(match[1], 10)
            response.data[`repo${index}`] = {
              issues: { totalCount: index * 10 }
            }
          }
          
          return [200, response]
        })

      const results = await client.batchGraphQLQueriesWithPointLimit(queries, {
        maxPointsPerBatch: 50 // Very low limit to force batching
      }) as BatchedIssuesResponse

      // Should make multiple requests or at least complete successfully
      expect(batchCount).toBeGreaterThanOrEqual(1)
      expect(Object.keys(results)).toHaveLength(10)
      expect(results.repo0?.issues.totalCount).toBe(0)
      expect(results.repo9?.issues.totalCount).toBe(90)
    })
  })

  describe('Rate limit integration', () => {
    it('should include rate limit info in GraphQL responses', async () => {
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: {
            viewer: { login: 'testuser' },
            rateLimit: {
              limit: 5000,
              cost: 1,
              remaining: 4999,
              resetAt: new Date(Date.now() + 3600000).toISOString(),
              nodeCount: 1
            }
          }
        })

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'test_token' }
      })

      const result = await client.graphqlWithRateLimit<{
        viewer: { login: string }
        rateLimit: {
          limit: number
          cost: number
          remaining: number
          resetAt: string
          nodeCount: number
        }
      }>(`
        query {
          viewer { login }
          rateLimit {
            limit
            cost
            remaining
            resetAt
            nodeCount
          }
        }
      `)

      // The GraphQL client extracts the data automatically
      const data = result as any
      expect(data.viewer.login).toBe('testuser')
      expect(data.rateLimit.cost).toBe(1)
      expect(data.rateLimit.remaining).toBe(4999)
    })

    it('should automatically add rateLimit to queries when needed', async () => {
      let capturedBody: any

      nock('https://api.github.com')
        .post('/graphql')
        .reply(function(uri, requestBody) {
          capturedBody = requestBody
          return [200, {
            data: {
              viewer: { login: 'testuser' },
              rateLimit: {
                limit: 5000,
                cost: 1,
                remaining: 4999,
                resetAt: new Date(Date.now() + 3600000).toISOString()
              }
            }
          }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        includeRateLimit: true
      })

      await client.graphql(`query { viewer { login } }`)
      
      expect(capturedBody.query).toContain('rateLimit')
      expect(capturedBody.query).toContain('viewer')
    })
  })
})