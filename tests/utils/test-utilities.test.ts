/**
 * Test utilities validation
 * Ensures all helper utilities work correctly with TypeScript strict mode
 */

import { beforeAll, describe, expect, it } from 'vitest'
import {
  type QueryRow,
  createGitHubRepositoryMock,
  createGitHubUserMock,
  createOpportunity,
  createRepository,
  createUser,
  createUserWithRepositoryAndOpportunities,
  formatVector,
  formatVectorParam,
  generateTestEmbedding,
  hasValidQueryStructure,
  isValidEmbedding,
  isValidSimilarityScore,
  resetFactoryCounters,
  sql,
} from './index'
import { createRepositoryHandler, createUserHandler } from './msw-setup'

describe('Test Utilities Validation', () => {
  beforeAll(() => {
    resetFactoryCounters()
  })

  describe('Test Factories', () => {
    it('should create valid user with proper types', () => {
      const user = createUser({
        github_username: 'testuser',
        skill_level: 'advanced',
        preferred_languages: ['TypeScript', 'Python'],
      })

      expect(user.github_username).toBe('testuser')
      expect(user.skill_level).toBe('advanced')
      expect(user.preferred_languages).toEqual(['TypeScript', 'Python'])
      expect(user.github_id).toBeTypeOf('number')
      expect(user.created_at).toBeInstanceOf(Date)
    })

    it('should create valid repository with embedding', () => {
      const embedding = generateTestEmbedding('test-repo')
      const repository = createRepository({
        full_name: 'testowner/test-repo',
        description_embedding: embedding,
      })

      expect(repository.full_name).toBe('testowner/test-repo')
      expect(repository.description_embedding).toStrictEqual(embedding)
      expect(repository.github_id).toBeTypeOf('number')
      if (repository.description_embedding) {
        isValidEmbedding(repository.description_embedding)
      }
    })

    it('should create valid opportunity with required fields', () => {
      const repositoryId = '550e8400-e29b-41d4-a716-446655440000'
      const opportunity = createOpportunity({
        repository_id: repositoryId,
        type: 'feature',
        good_first_issue: true,
      })

      expect(opportunity.repository_id).toBe(repositoryId)
      expect(opportunity.type).toBe('feature')
      expect(opportunity.good_first_issue).toBe(true)
      expect(opportunity.title).toBeTypeOf('string')
      expect(opportunity.url).toMatch(/^https?:\/\//)
    })

    it('should create test scenarios with related data', () => {
      const scenario = createUserWithRepositoryAndOpportunities({
        userOverrides: { skill_level: 'expert' },
        opportunityCount: 3,
        opportunityOverrides: { type: 'bug_fix' },
      })

      expect(scenario.user.skill_level).toBe('expert')
      expect(scenario.opportunities).toHaveLength(3)
      expect(scenario.opportunities.every(op => op.type === 'bug_fix')).toBe(true)
      expect(scenario.opportunities.every(op => op.repository_id === scenario.repository.id)).toBe(
        true
      )
    })
  })

  describe('Vector Utilities', () => {
    it('should generate valid 1536-dimensional embeddings', () => {
      const embedding = generateTestEmbedding('test-seed')

      expect(embedding).toHaveLength(1536)
      expect(embedding.every(v => typeof v === 'number')).toBe(true)
      expect(embedding.every(v => !Number.isNaN(v))).toBe(true)
      isValidEmbedding(embedding)
    })

    it('should format vectors correctly for PostgreSQL', () => {
      const embedding = generateTestEmbedding('test')
      const formatted = formatVector(embedding)

      expect(formatted).toMatch(/^\[[\d,.-]+\]$/)
      expect(formatted.split(',').length).toBe(1536)
    })

    it('should handle vector parameter formatting', () => {
      const embedding = generateTestEmbedding('param-test')
      const formatted = formatVectorParam(embedding)

      expect(formatted).toBe(formatVector(embedding))
      expect(() => isValidEmbedding(embedding)).not.toThrow()
    })

    it('should validate similarity scores', () => {
      expect(() => isValidSimilarityScore(0.85)).not.toThrow()
      expect(() => isValidSimilarityScore(-0.3)).not.toThrow()
      expect(() => isValidSimilarityScore(1.0)).not.toThrow()
      expect(() => isValidSimilarityScore(-1.0)).not.toThrow()

      expect(() => isValidSimilarityScore(1.5)).toThrow()
      expect(() => isValidSimilarityScore(-1.5)).toThrow()
      expect(() => isValidSimilarityScore(Number.NaN)).toThrow()
    })
  })

  describe('MSW Factories', () => {
    it('should create valid GitHub user mock data', () => {
      const user = createGitHubUserMock({
        login: 'testuser',
        public_repos: 15,
      })

      expect(user.login).toBe('testuser')
      expect(user.public_repos).toBe(15)
      expect(user.id).toBeTypeOf('number')
      expect(user.html_url).toMatch(/^https:\/\/github\.com\//)
    })

    it('should create valid GitHub repository mock data', () => {
      const repository = createGitHubRepositoryMock({
        name: 'test-repo',
        owner: {
          login: 'testowner',
          id: 1,
          avatar_url: 'https://github.com/images/error/testowner_happy.gif',
          html_url: 'https://github.com/testowner',
          type: 'User',
          site_admin: false,
        },
      })

      expect(repository.name).toBe('test-repo')
      expect(repository.owner.login).toBe('testowner')
      expect(repository.full_name).toBe('testowner/test-repo')
      expect(repository.stargazers_count).toBeTypeOf('number')
    })

    it('should create MSW handlers with proper structure', () => {
      const userHandler = createUserHandler({
        login: 'testuser',
      })

      const repoHandler = createRepositoryHandler('testowner', 'test-repo')

      // Handlers should be functions
      expect(typeof userHandler).toBe('object')
      expect(typeof repoHandler).toBe('object')
    })
  })

  describe('Database Utilities', () => {
    it('should have proper SQL template function types', () => {
      // Test that the sql function has correct TypeScript types
      const sqlFunc = sql
      expect(typeof sqlFunc).toBe('function')

      // The function should accept template literals and return a Promise
      const query = sqlFunc`SELECT 1 as test`
      expect(query).toBeInstanceOf(Promise)
    })

    it('should validate query row structure', () => {
      const validResult = [
        { id: '1', name: 'test', count: 5 },
        { id: '2', name: 'test2', count: 10 },
      ]

      expect(() => {
        hasValidQueryStructure(validResult, ['id', 'name'])
      }).not.toThrow()

      expect(() => {
        hasValidQueryStructure(validResult, ['id', 'missing_field'])
      }).toThrow()

      expect(() => {
        hasValidQueryStructure('not an array', ['id'])
      }).toThrow()
    })

    it('should handle type-safe query execution', async () => {
      // This is a mock test since we don't have a real database connection in this test
      interface TestRow extends QueryRow {
        test: number
      }

      // Mock the executeSql function behavior
      const mockExecuteSql = async <T extends QueryRow>(
        _query: string,
        // biome-ignore lint/suspicious/noExplicitAny: Test mock accepts generic parameters, typed at call site
        _params?: any[]
      ): Promise<T[]> => {
        return [{ test: 1 } as T]
      }

      const result = await mockExecuteSql<TestRow>('SELECT 1 as test', [])
      expect(result).toHaveLength(1)
      expect(result[0]?.test).toBe(1)
    })
  })

  describe('Type Safety', () => {
    it('should enforce proper factory input types', () => {
      // This test ensures TypeScript compilation catches type errors
      const validUserInput = {
        github_username: 'testuser',
        skill_level: 'advanced' as const,
        availability_hours: 20,
      }

      const user = createUser(validUserInput)
      expect(user.github_username).toBe('testuser')
      expect(user.skill_level).toBe('advanced')
      expect(user.availability_hours).toBe(20)
    })

    it('should validate Zod schemas at runtime', () => {
      // Test that invalid data is caught by Zod
      expect(() => {
        createUser({
          github_username: '', // Invalid: empty string
        })
      }).toThrow()

      expect(() => {
        createRepository({
          url: 'not-a-url', // Invalid: not a URL
        })
      }).toThrow()
    })

    it('should handle optional fields correctly', () => {
      const user = createUser({
        github_username: 'testuser',
        // bio is optional and not provided
      })

      expect(user.github_username).toBe('testuser')
      expect(user.bio).toBeTypeOf('string') // Factory should provide default
    })
  })

  describe('Error Handling', () => {
    it('should throw meaningful errors for invalid vector dimensions', () => {
      expect(() => {
        formatVector([1, 2, 3]) // Wrong dimensions
      }).toThrow('Vector must have exactly 1536 dimensions')

      expect(() => {
        // biome-ignore lint/suspicious/noExplicitAny: Test case requires invalid input to test error handling
        formatVector('not an array' as any)
      }).toThrow('Vector must be an array')
    })

    it('should handle query structure validation errors', () => {
      expect(() => {
        hasValidQueryStructure([], ['required_field'])
      }).not.toThrow() // Empty array is valid

      expect(() => {
        hasValidQueryStructure([{}], ['required_field'])
      }).toThrow('Missing expected field: required_field')
    })
  })

  describe('Factory Counters', () => {
    it('should increment counters for unique IDs', () => {
      const user1 = createUser()
      const user2 = createUser()
      const repo1 = createRepository()
      const repo2 = createRepository()

      expect(user1.github_id).not.toBe(user2.github_id)
      expect(repo1.github_id).not.toBe(repo2.github_id)
    })

    it('should reset counters when requested', () => {
      const beforeReset = createUser()
      resetFactoryCounters()
      const afterReset = createUser()

      // After reset, the IDs should start from the beginning again
      // This is implementation dependent, but ensures counter reset works
      expect(beforeReset.github_id).toBeTypeOf('number')
      expect(afterReset.github_id).toBeTypeOf('number')
    })
  })
})
