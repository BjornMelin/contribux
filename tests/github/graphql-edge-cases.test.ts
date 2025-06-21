import { describe, it, expect } from 'vitest'
import { 
  splitGraphQLQuery,
  buildBatchedQuery,
  optimizeGraphQLQuery,
  estimateQueryComplexity
} from '@/lib/github/graphql/query-optimizer'

describe('GraphQL Optimization Edge Cases', () => {
  describe('Deep Nested Query Splitting Refinements', () => {
    it('should handle extremely deep nested connections with proper point calculation', () => {
      const extremeQuery = `
        query ExtremelyNestedQuery {
          repository(owner: "facebook", name: "react") {
            issues(first: 10) {
              edges {
                node {
                  comments(first: 10) {
                    edges {
                      node {
                        reactions(first: 10) {
                          edges {
                            node {
                              user {
                                repositories(first: 10) {
                                  edges {
                                    node {
                                      issues(first: 10) {
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
                    }
                  }
                }
              }
            }
          }
        }
      `

      const complexity = estimateQueryComplexity(extremeQuery)
      
      // This should trigger splitting due to extreme nesting
      expect(complexity.totalPoints).toBeGreaterThan(100000)
      
      const splitQueries = splitGraphQLQuery(extremeQuery)
      expect(splitQueries.length).toBeGreaterThan(1)
      
      // Each split query should be under the limit
      splitQueries.forEach(query => {
        const splitComplexity = estimateQueryComplexity(query)
        expect(splitComplexity.totalPoints).toBeLessThanOrEqual(500000)
      })
    })

    it('should preserve cursor-based pagination in deeply nested queries', () => {
      const nestedPaginationQuery = `
        query NestedPagination($cursor1: String, $cursor2: String) {
          repository(owner: "owner", name: "repo") {
            issues(first: 50, after: $cursor1) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  comments(first: 25, after: $cursor2) {
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                    edges {
                      node {
                        id
                        body
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `

      const splitQueries = splitGraphQLQuery(nestedPaginationQuery)
      
      // Should preserve pagination structure in split queries
      splitQueries.forEach(query => {
        if (query.includes('issues') || query.includes('comments')) {
          expect(query).toContain('pageInfo')
          expect(query).toContain('hasNextPage')
          expect(query).toContain('endCursor')
        }
      })
    })

    it('should handle queries with multiple connection types at the same level', () => {
      const multiConnectionQuery = `
        query MultipleConnections {
          repository(owner: "owner", name: "repo") {
            name
            description
            issues(first: 100) {
              totalCount
              edges {
                node {
                  id
                  title
                }
              }
            }
            pullRequests(first: 100) {
              totalCount
              edges {
                node {
                  id
                  title
                }
              }
            }
            discussions(first: 100) {
              totalCount
              edges {
                node {
                  id
                  title
                }
              }
            }
            releases(first: 100) {
              totalCount
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `

      const splitQueries = splitGraphQLQuery(multiConnectionQuery)
      
      // Should split into separate queries for each connection
      expect(splitQueries.length).toBeGreaterThan(1)
      
      // Each query should include basic fields and one connection
      const connectionFields = ['issues', 'pullRequests', 'discussions', 'releases']
      const foundConnections = new Set()
      
      splitQueries.forEach(query => {
        expect(query).toContain('name')
        expect(query).toContain('description')
        
        connectionFields.forEach(field => {
          if (query.includes(field)) {
            foundConnections.add(field)
          }
        })
      })
      
      // All connections should be represented in split queries
      expect(foundConnections.size).toBe(connectionFields.length)
    })
  })

  describe('Duplicate Field Removal Logic Enhancement', () => {
    it('should remove duplicates while preserving field order and structure', () => {
      const queryWithComplexDuplicates = `
        query ComplexDuplicates {
          repository(owner: "owner", name: "repo") {
            id
            name
            description
            id          # duplicate
            stargazerCount
            name        # duplicate  
            forkCount
            description # duplicate
            createdAt
            updatedAt
            stargazerCount # duplicate
            issues {
              totalCount
            }
            createdAt   # duplicate
          }
        }
      `

      const optimized = optimizeGraphQLQuery(queryWithComplexDuplicates, { removeDuplicates: true })
      
      // Count occurrences of each field in the repository body
      const repoBody = optimized.match(/repository\([^)]*\)\s*\{([\s\S]*)\}/)?.[1] || ''
      
      const fieldCounts = {
        id: (repoBody.match(/^\s*id\s*$/gm) || []).length,
        name: (repoBody.match(/^\s*name\s*$/gm) || []).length,
        description: (repoBody.match(/^\s*description\s*$/gm) || []).length,
        stargazerCount: (repoBody.match(/^\s*stargazerCount\s*$/gm) || []).length,
        createdAt: (repoBody.match(/^\s*createdAt\s*$/gm) || []).length
      }
      
      // Each field should appear exactly once
      Object.entries(fieldCounts).forEach(([field, count]) => {
        expect(count).toBe(1)
      })
      
      // Structure should be preserved
      expect(optimized).toContain('issues')
      expect(optimized).toContain('totalCount')
    })

    it('should handle duplicates in nested structures correctly', () => {
      const nestedDuplicatesQuery = `
        query NestedDuplicates {
          repository(owner: "owner", name: "repo") {
            issues(first: 10) {
              edges {
                node {
                  id
                  title
                  id        # duplicate in nested context
                  body
                  title     # duplicate in nested context
                  createdAt
                }
              }
              nodes {
                id
                title
                body
                createdAt
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(nestedDuplicatesQuery, { removeDuplicates: true })
      
      // Find the node content within edges
      const nodeMatch = optimized.match(/node\s*\{([^}]*)\}/)
      if (nodeMatch) {
        const nodeBody = nodeMatch[1] || ''
        const idCount = (nodeBody.match(/^\s*id\s*$/gm) || []).length
        const titleCount = (nodeBody.match(/^\s*title\s*$/gm) || []).length
        
        expect(idCount).toBe(1)
        expect(titleCount).toBe(1)
      }
    })

    it('should preserve fields with comments when removing duplicates', () => {
      const queryWithComments = `
        query WithComments {
          repository(owner: "owner", name: "repo") {
            id         # primary identifier
            name
            id         # duplicate with different comment
            description # main description
            name       # duplicate name field
          }
        }
      `

      const optimized = optimizeGraphQLQuery(queryWithComments, { removeDuplicates: true })
      
      const repoBody = optimized.match(/repository\([^)]*\)\s*\{([\s\S]*)\}/)?.[1] || ''
      const idCount = (repoBody.match(/^\s*id\s*(?:#.*)?$/gm) || []).length
      const nameCount = (repoBody.match(/^\s*name\s*(?:#.*)?$/gm) || []).length
      
      expect(idCount).toBe(1)
      expect(nameCount).toBe(1)
    })
  })

  describe('Edges Block Optimization When Nodes Exist', () => {
    it('should remove edges block when nodes block is present and contains same fields', () => {
      const edgesAndNodesQuery = `
        query EdgesAndNodes {
          repository(owner: "owner", name: "repo") {
            issues(first: 50) {
              totalCount
              edges {
                cursor
                node {
                  id
                  title
                  body
                  createdAt
                }
              }
              nodes {
                id
                title
                body
                createdAt
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(edgesAndNodesQuery, { 
        preferNodes: true,
        removeCursors: true 
      })
      
      // Should not contain edges block
      expect(optimized).not.toMatch(/edges\s*\{/)
      
      // Should preserve nodes block
      expect(optimized).toContain('nodes')
      
      // Should preserve other fields
      expect(optimized).toContain('totalCount')
      expect(optimized).toContain('pageInfo')
      
      // Should not contain cursor if removeCursors is true
      expect(optimized).not.toContain('cursor')
    })

    it('should handle multiple connections with mixed edges/nodes patterns', () => {
      const mixedConnectionsQuery = `
        query MixedConnections {
          repository(owner: "owner", name: "repo") {
            issues(first: 50) {
              edges {
                node {
                  id
                  title
                }
              }
              nodes {
                id
                title
              }
            }
            pullRequests(first: 50) {
              edges {
                node {
                  id
                  title
                }
              }
            }
            discussions(first: 50) {
              nodes {
                id
                title
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(mixedConnectionsQuery, { preferNodes: true })
      
      // Issues should have edges removed but nodes preserved
      const issuesMatch = optimized.match(/issues\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/)
      if (issuesMatch) {
        const issuesBody = issuesMatch[1] || ''
        expect(issuesBody).not.toMatch(/edges\s*\{/)
        expect(issuesBody).toContain('nodes')
      }
      
      // pullRequests should keep edges (no nodes alternative)
      expect(optimized).toMatch(/pullRequests\([^)]*\)\s*\{[^}]*edges/)
      
      // discussions should keep nodes (no edges to remove)
      expect(optimized).toMatch(/discussions\([^)]*\)\s*\{[^}]*nodes/)
    })

    it('should preserve pageInfo when optimizing connections', () => {
      const connectionWithPageInfo = `
        query ConnectionWithPageInfo {
          repository(owner: "owner", name: "repo") {
            issues(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
              edges {
                cursor
                node {
                  id
                  title
                }
              }
              nodes {
                id
                title
              }
            }
          }
        }
      `

      const optimized = optimizeGraphQLQuery(connectionWithPageInfo, { 
        preferNodes: true,
        removeCursors: true 
      })
      
      // Should preserve pageInfo
      expect(optimized).toContain('pageInfo')
      expect(optimized).toContain('hasNextPage')
      expect(optimized).toContain('endCursor')
      
      // Should remove edges but keep nodes
      expect(optimized).not.toMatch(/edges\s*\{/)
      expect(optimized).toContain('nodes')
      
      // Should remove cursor from edges if removeCursors is true (but not $cursor variables)
      expect(optimized).not.toMatch(/^\s*cursor\s*$/m)
    })
  })

  describe('Complex Query Batching Edge Cases', () => {
    it('should handle batching queries with different variable requirements', () => {
      const queriesWithDifferentVars = [
        {
          id: 'userQuery',
          query: `query GetUser($login: String!) { user(login: $login) { name bio } }`,
          variables: { login: 'octocat' }
        },
        {
          id: 'repoQuery', 
          query: `query GetRepo($owner: String!, $name: String!) { 
            repository(owner: $owner, name: $name) { stargazerCount } 
          }`,
          variables: { owner: 'facebook', name: 'react' }
        },
        {
          id: 'simpleQuery',
          query: `query { viewer { login } }`,
          variables: {}
        }
      ]

      const batched = buildBatchedQuery(queriesWithDifferentVars)
      
      expect(typeof batched).toBe('string')
      if (typeof batched === 'string') {
        // Should inline variables correctly
        expect(batched).toContain('userQuery: user(login: "octocat")')
        expect(batched).toContain('repoQuery: repository(owner: "facebook", name: "react")')
        expect(batched).toContain('simpleQuery: viewer')
        
        // Should include rate limit
        expect(batched).toContain('rateLimit')
      }
    })

    it('should split batches when complexity exceeds limits', () => {
      const highComplexityQueries = Array(50).fill(null).map((_, i) => ({
        id: `query${i}`,
        query: `repository(owner: "owner", name: "repo${i}") {
          issues(first: 100) {
            nodes {
              comments(first: 50) {
                nodes {
                  id
                }
              }
            }
          }
        }`,
        variables: {}
      }))

      const result = buildBatchedQuery(highComplexityQueries, { maxComplexity: 10000 })
      
      // Should return array of batched queries when limit exceeded
      expect(Array.isArray(result)).toBe(true)
      
      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(1)
        
        // Each batch should be under the complexity limit
        result.forEach((batch: string) => {
          const complexity = estimateQueryComplexity(batch)
          expect(complexity.totalPoints).toBeLessThanOrEqual(10000)
        })
      }
    })
  })

  describe('Complexity Calculation Edge Cases', () => {
    it('should handle malformed queries gracefully', () => {
      const malformedQueries = [
        'query {', // unclosed
        'query { repository owner: "test" }', // missing parentheses
        'query { repository(owner: "test") name }', // missing braces
        '', // empty
        'not a query at all'
      ]

      malformedQueries.forEach(query => {
        expect(() => {
          const complexity = estimateQueryComplexity(query)
          expect(typeof complexity.totalPoints).toBe('number')
          expect(complexity.totalPoints).toBeGreaterThanOrEqual(0)
        }).not.toThrow()
      })
    })

    it('should calculate complexity correctly for fragment usage', () => {
      const fragmentQuery = `
        query WithFragments {
          repository(owner: "owner", name: "repo") {
            issues(first: 100) {
              nodes {
                ...IssueFragment
              }
            }
          }
        }
        
        fragment IssueFragment on Issue {
          id
          title
          body
          comments(first: 50) {
            nodes {
              id
              body
            }
          }
        }
      `

      const complexity = estimateQueryComplexity(fragmentQuery)
      
      // Should count the connection within the fragment
      expect(complexity.totalPoints).toBeGreaterThan(100) // base + issues + comments
      expect(complexity.totalPoints).toBeLessThan(10000) // reasonable upper bound
    })
  })
})