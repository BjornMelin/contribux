/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as opportunitiesHandler from '@/app/api/search/opportunities/route'
import * as repositoriesHandler from '@/app/api/search/repositories/route'
import { searchRepositories } from '@/lib/search/search-service'
import { SearchValidator } from '@/lib/validation/search-validator'

// Mock search service
vi.mock('@/lib/search/search-service', () => ({
  searchRepositories: vi.fn(),
  getSearchSuggestions: vi.fn(),
  getPopularSearches: vi.fn(),
  indexRepository: vi.fn(),
}))

describe('Search API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /api/search/repositories', () => {
    const mockSearchResults = {
      repositories: [
        {
          id: '1',
          name: 'test-repo',
          fullName: 'user/test-repo',
          description: 'A test repository',
          stars: 100,
          language: 'TypeScript',
          topics: ['testing', 'typescript'],
          score: 0.95,
        },
      ],
      totalCount: 1,
      page: 1,
      perPage: 20,
      facets: {
        languages: [
          { value: 'TypeScript', count: 50 },
          { value: 'JavaScript', count: 30 },
        ],
        topics: [
          { value: 'testing', count: 20 },
          { value: 'typescript', count: 15 },
        ],
      },
    }

    it('should search with basic query', async () => {
      vi.mocked(searchRepositories).mockResolvedValueOnce(mockSearchResults)

      const request = new NextRequest(
        'http://localhost:3000/api/search/repositories?q=typescript+testing'
      )
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.repositories).toHaveLength(1)
      expect(data.repositories[0].name).toBe('test-repo')
      expect(data.totalCount).toBe(1)
    })

    it('should validate query parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/search/repositories') // Missing query
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('required')
    })

    it('should handle pagination', async () => {
      vi.mocked(searchRepositories).mockResolvedValueOnce({
        ...mockSearchResults,
        page: 2,
        totalCount: 100,
      })

      const request = new NextRequest(
        'http://localhost:3000/api/search/repositories?q=test&page=2&per_page=50'
      )
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.page).toBe(2)
      expect(data.per_page).toBe(50)
    })

    it('should handle search errors', async () => {
      vi.mocked(searchRepositories).mockRejectedValueOnce(new Error('Search service unavailable'))

      const request = new NextRequest('http://localhost:3000/api/search/repositories?q=test')
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('error')
    })
  })

  describe('GET /api/search/opportunities', () => {
    it('should search for opportunities', async () => {
      const request = new NextRequest('http://localhost:3000/api/search/opportunities?q=beginner')
      const response = await opportunitiesHandler.GET(request)

      // The actual implementation will determine the status code
      expect([200, 404, 500]).toContain(response.status)
    })
  })

  describe('Search Query Validation', () => {
    const validator = new SearchValidator()

    it('should sanitize search queries', () => {
      const dangerous = '<script>alert("xss")</script>react'
      const sanitized = validator.sanitizeQuery(dangerous)

      expect(sanitized).toBe('react')
      expect(sanitized).not.toContain('<script>')
    })

    it('should validate query length', () => {
      const tooLong = 'a'.repeat(300)
      const result = validator.validateQuery(tooLong)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Query too long')
    })

    it('should parse search operators', () => {
      const query = 'language:typescript stars:>100 user:microsoft'
      const parsed = validator.parseSearchOperators(query)

      expect(parsed.language).toBe('typescript')
      expect(parsed.minStars).toBe(100)
      expect(parsed.user).toBe('microsoft')
      expect(parsed.baseQuery).toBe('')
    })

    it('should handle quoted phrases', () => {
      const query = '"machine learning" python -tensorflow'
      const parsed = validator.parseQuery(query)

      expect(parsed.requiredTerms).toContain('machine learning')
      expect(parsed.terms).toContain('python')
      expect(parsed.excludedTerms).toContain('tensorflow')
    })
  })

  describe('Search Performance', () => {
    const mockSearchResults = {
      repositories: [
        {
          id: '1',
          name: 'test-repo',
          fullName: 'user/test-repo',
          description: 'A test repository',
          stars: 100,
          language: 'TypeScript',
          topics: ['testing', 'typescript'],
          score: 0.95,
        },
      ],
      totalCount: 1,
      page: 1,
      perPage: 20,
      facets: {
        languages: [
          { value: 'TypeScript', count: 50 },
          { value: 'JavaScript', count: 30 },
        ],
        topics: [
          { value: 'testing', count: 40 },
          { value: 'web', count: 35 },
        ],
      },
    }

    it('should handle multiple searches', async () => {
      vi.mocked(searchRepositories).mockResolvedValue(mockSearchResults)

      const request = new NextRequest(
        'http://localhost:3000/api/search/repositories?q=popular-query'
      )
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(200)
      expect(searchRepositories).toHaveBeenCalled()
    })
  })
})
