import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  splitGraphQLQuery,
  buildBatchedQuery,
  optimizeGraphQLQuery,
  estimateQueryComplexity
} from '@/lib/github/graphql/query-optimizer'
import type { GitHubClient } from '@/lib/github'

describe('GraphQL Query Optimization', () => {
  describe('Query Splitting', () => {
    it('should split queries that exceed the 500,000 node limit', () => {
      const query = `
        query LargeQuery {
          repository(owner: "owner", name: "repo") {
            issues(first: 100) {
              edges {
                node {
                  comments(first: 100) {
                    edges {
                      node {
                        reactions(first: 100) {
                          edges {
                            node {
                              id
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `

      const splitQueries = splitGraphQLQuery(query)
      
      // Should split into multiple queries to stay under limit
      expect(splitQueries.length).toBeGreaterThan(1)
      
      // Each query should estimate under 500,000 points
      splitQueries.forEach(subQuery => {
        const complexity = estimateQueryComplexity(subQuery)
        expect(complexity.totalPoints).toBeLessThanOrEqual(500000)
      })
    })

    it('should preserve query structure when splitting', () => {
      const query = `
        query GetRepoData {
          repository(owner: "owner", name: "repo") {
            name
            description
            issues(first: 1000) {
              totalCount
              edges {
                node {
                  id
                  title
                }
              }
            }
            pullRequests(first: 1000) {
              totalCount
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `

      const splitQueries = splitGraphQLQuery(query)
      
      // Should split issues and PRs into separate queries
      expect(splitQueries.length).toBe(2)
      
      // First query should have basic info + issues
      expect(splitQueries[0]).toContain('name')
      expect(splitQueries[0]).toContain('description')
      expect(splitQueries[0]).toContain('issues')
      expect(splitQueries[0]).not.toContain('pullRequests')
      
      // Second query should have basic info + PRs
      expect(splitQueries[1]).toContain('name')
      expect(splitQueries[1]).toContain('description')
      expect(splitQueries[1]).toContain('pullRequests')
      expect(splitQueries[1]).not.toContain('issues')
    })

    it('should handle nested pagination correctly', () => {
      const query = `
        query NestedPagination($cursor: String) {
          repository(owner: "owner", name: "repo") {
            issues(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  comments(first: 100) {
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `

      const splitQueries = splitGraphQLQuery(query)
      
      // Should preserve pagination structure
      splitQueries.forEach(subQuery => {
        if (subQuery.includes('issues')) {
          expect(subQuery).toContain('$cursor')
          expect(subQuery).toContain('after: $cursor')
          expect(subQuery).toContain('pageInfo')
        }
      })
    })
  })

  describe('Query Batching', () => {
    it('should batch multiple single-item queries into one query with aliases', () => {
      const queries = [
        {
          id: 'q1',
          query: `query { repository(owner: "owner1", name: "repo1") { name stargazerCount } }`,
          variables: {}
        },
        {
          id: 'q2', 
          query: `query { repository(owner: "owner2", name: "repo2") { name stargazerCount } }`,
          variables: {}
        },
        {
          id: 'q3',
          query: `query { repository(owner: "owner3", name: "repo3") { name stargazerCount } }`,
          variables: {}
        }
      ]

      const batchedQuery = buildBatchedQuery(queries)
      
      expect(batchedQuery).toContain('q1: repository(owner: "owner1", name: "repo1")')
      expect(batchedQuery).toContain('q2: repository(owner: "owner2", name: "repo2")')
      expect(batchedQuery).toContain('q3: repository(owner: "owner3", name: "repo3")')
      
      // Should include rate limit info
      expect(batchedQuery).toContain('rateLimit')
    })

    it('should handle queries with variables correctly', () => {
      const queries = [
        {
          id: 'user1',
          query: `query GetUser($login: String!) { user(login: $login) { name bio } }`,
          variables: { login: 'user1' }
        },
        {
          id: 'user2',
          query: `query GetUser($login: String!) { user(login: $login) { name bio } }`,
          variables: { login: 'user2' }
        }
      ]

      const batchedQuery = buildBatchedQuery(queries)
      
      // Should inline variables in the batched query
      expect(batchedQuery).toContain('user1: user(login: "user1")')
      expect(batchedQuery).toContain('user2: user(login: "user2")')
    })

    it('should respect complexity limits when batching', () => {
      const queries = []
      
      // Create many queries that would exceed limit if batched together
      for (let i = 0; i < 100; i++) {
        queries.push({
          id: `repo${i}`,
          query: `query { repository(owner: "owner", name: "repo${i}") { 
            issues(first: 100) { 
              edges { 
                node { 
                  comments(first: 100) { 
                    edges { node { id } } 
                  } 
                } 
              } 
            } 
          } }`,
          variables: {}
        })
      }

      const batchedQueries = buildBatchedQuery(queries, { maxComplexity: 500000 })
      
      // Should return array of batched queries when limit exceeded
      expect(Array.isArray(batchedQueries)).toBe(true)
      
      if (Array.isArray(batchedQueries)) {
        expect(batchedQueries.length).toBeGreaterThan(1)
        
        // Each batch should be under the limit
        batchedQueries.forEach((batch: string) => {
          const complexity = estimateQueryComplexity(batch)
          expect(complexity.totalPoints).toBeLessThanOrEqual(500000)
        })
      }
    })
  })

  describe('Query Optimization', () => {
    it('should optimize queries by removing unnecessary fields', () => {
      const query = `
        query GetRepo {
          repository(owner: "owner", name: "repo") {
            id
            name
            name  # duplicate
            description
            id    # duplicate
            createdAt
            updatedAt
            createdAt  # duplicate
          }
        }
      `

      const optimized = optimizeGraphQLQuery(query)
      
      // Should remove duplicate fields
      // Count field occurrences in the repository body only
      const repoBody = optimized.match(/repository\([^)]*\)\s*\{([\s\S]*)\}/)?.[1] || ''
      const nameMatches = (repoBody.match(/^\s*name\s*$/gm) || []).length
      const idMatches = (repoBody.match(/^\s*id\s*$/gm) || []).length
      const createdAtMatches = (repoBody.match(/^\s*createdAt\s*$/gm) || []).length
      
      expect(nameMatches).toBe(1)
      expect(idMatches).toBe(1)
      expect(createdAtMatches).toBe(1)
    })

    it('should optimize nested queries and connections', () => {
      const query = `
        query GetIssues {
          repository(owner: "owner", name: "repo") {
            issues(first: 100) {
              edges {
                cursor  # Not needed if not paginating
                node {
                  id
                  title
                }
              }
              nodes {  # Redundant with edges.node
                id
                title
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(query, { 
        removeCursors: true,
        preferNodes: true 
      })
      
      // Should remove edges when nodes is available
      // Check for edges block, not just the word "edges"
      expect(optimized).not.toMatch(/edges\s*\{/)
      expect(optimized).toContain('nodes')
      expect(optimized).not.toContain('cursor')
    })

    it('should add rate limit info if not present', () => {
      const query = `
        query GetRepo {
          repository(owner: "owner", name: "repo") {
            name
          }
        }
      `

      const optimized = optimizeGraphQLQuery(query, { includeRateLimit: true })
      
      expect(optimized).toContain('rateLimit')
      expect(optimized).toContain('limit')
      expect(optimized).toContain('remaining')
      expect(optimized).toContain('resetAt')
    })
  })

  describe('Cursor-based Pagination', () => {
    it('should handle forward pagination correctly', () => {
      const query = `
        query GetIssues($cursor: String) {
          repository(owner: "owner", name: "repo") {
            issues(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(query)
      
      // Should preserve pagination structure
      expect(optimized).toContain('pageInfo')
      expect(optimized).toContain('hasNextPage')
      expect(optimized).toContain('endCursor')
      expect(optimized).toContain('after: $cursor')
    })

    it('should handle backward pagination correctly', () => {
      const query = `
        query GetIssues($cursor: String) {
          repository(owner: "owner", name: "repo") {
            issues(last: 50, before: $cursor) {
              pageInfo {
                hasPreviousPage
                startCursor
              }
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(query)
      
      // Should preserve backward pagination
      expect(optimized).toContain('hasPreviousPage')
      expect(optimized).toContain('startCursor')
      expect(optimized).toContain('before: $cursor')
    })
  })
})