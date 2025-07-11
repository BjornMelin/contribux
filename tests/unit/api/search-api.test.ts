/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest } from 'next/server'
import * as searchHandler from '@/app/api/search/route'
import * as advancedSearchHandler from '@/app/api/search/advanced/route'
import * as suggestionsHandler from '@/app/api/search/suggestions/route'
import { searchRepositories } from '@/lib/search/search-service'
import { SearchValidator } from '@/lib/validation/search-validator'
import { testApiHandler } from 'next-test-api-route-handler'

// Mock search service
vi.mock('@/lib/search/search-service', () => ({
  searchRepositories: vi.fn(),
  getSearchSuggestions: vi.fn(),
  getPopularSearches: vi.fn(),
  indexRepository: vi.fn()
}))

describe('Search API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /api/search', () => {
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
          score: 0.95
        }
      ],
      totalCount: 1,
      page: 1,
      perPage: 20,
      facets: {
        languages: [
          { value: 'TypeScript', count: 50 },
          { value: 'JavaScript', count: 30 }
        ],
        topics: [
          { value: 'testing', count: 20 },
          { value: 'typescript', count: 15 }
        ]
      }
    }

    it('should search with basic query', async () => {
      vi.mocked(searchRepositories).mockResolvedValueOnce(mockSearchResults)
      
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=typescript+testing',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.repositories).toHaveLength(1)
          expect(data.repositories[0].name).toBe('test-repo')
          expect(data.totalCount).toBe(1)
        }
      })
      
      expect(searchRepositories).toHaveBeenCalledWith({
        query: 'typescript testing',
        page: 1,
        perPage: 20
      })
    })

    it('should validate query parameters', async () => {
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search', // Missing query
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('Query parameter is required')
        }
      })
    })

    it('should handle pagination', async () => {
      vi.mocked(searchRepositories).mockResolvedValueOnce({
        ...mockSearchResults,
        page: 2,
        totalCount: 100
      })
      
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=test&page=2&per_page=50',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.page).toBe(2)
          expect(data.perPage).toBe(50)
        }
      })
      
      expect(searchRepositories).toHaveBeenCalledWith({
        query: 'test',
        page: 2,
        perPage: 50
      })
    })

    it('should handle search errors', async () => {
      vi.mocked(searchRepositories).mockRejectedValueOnce(new Error('Search service unavailable'))
      
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=test',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(500)
          const data = await response.json()
          expect(data.error).toContain('Search failed')
        }
      })
    })
  })

  describe('POST /api/search/advanced', () => {
    it('should perform advanced search with filters', async () => {
      const advancedResults = {
        repositories: [],
        totalCount: 5,
        aggregations: {
          avgStars: 250,
          languageDistribution: {
            TypeScript: 60,
            JavaScript: 40
          }
        }
      }
      
      vi.mocked(searchRepositories).mockResolvedValueOnce(advancedResults)
      
      await testApiHandler({
        handler: advancedSearchHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: 'react',
              filters: {
                languages: ['TypeScript', 'JavaScript'],
                minStars: 100,
                maxStars: 1000,
                topics: ['frontend', 'ui'],
                hasIssues: true,
                license: 'MIT'
              },
              sort: 'stars',
              order: 'desc'
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.totalCount).toBe(5)
          expect(data.aggregations).toBeDefined()
        }
      })
      
      expect(searchRepositories).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'react',
          filters: expect.objectContaining({
            languages: ['TypeScript', 'JavaScript'],
            minStars: 100
          })
        })
      )
    })

    it('should validate advanced search payload', async () => {
      await testApiHandler({
        handler: advancedSearchHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              // Invalid: minStars > maxStars
              filters: {
                minStars: 1000,
                maxStars: 100
              }
            })
          })
          
          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('Invalid filter')
        }
      })
    })

    it('should handle date range filters', async () => {
      vi.mocked(searchRepositories).mockResolvedValueOnce({
        repositories: [],
        totalCount: 0
      })
      
      await testApiHandler({
        handler: advancedSearchHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: 'machine learning',
              filters: {
                createdAfter: '2023-01-01',
                updatedWithin: '30d',
                pushedAfter: '2023-06-01'
              }
            })
          })
          
          expect(response.status).toBe(200)
        }
      })
    })
  })

  describe('GET /api/search/suggestions', () => {
    it('should get search suggestions', async () => {
      const mockSuggestions = {
        suggestions: [
          { text: 'typescript react', score: 0.9 },
          { text: 'typescript node', score: 0.85 },
          { text: 'typescript express', score: 0.8 }
        ],
        relatedSearches: [
          'javascript frameworks',
          'frontend development'
        ]
      }
      
      vi.mocked(getSearchSuggestions).mockResolvedValueOnce(mockSuggestions)
      
      await testApiHandler({
        handler: suggestionsHandler.GET,
        url: '/api/search/suggestions?q=typescript',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.suggestions).toHaveLength(3)
          expect(data.suggestions[0].text).toBe('typescript react')
          expect(data.relatedSearches).toContain('javascript frameworks')
        }
      })
    })

    it('should get popular searches when no query', async () => {
      const mockPopular = {
        popular: [
          { query: 'react', count: 1000 },
          { query: 'vue', count: 800 },
          { query: 'angular', count: 600 }
        ],
        trending: [
          { query: 'ai tools', growth: 250 },
          { query: 'rust web', growth: 180 }
        ]
      }
      
      vi.mocked(getPopularSearches).mockResolvedValueOnce(mockPopular)
      
      await testApiHandler({
        handler: suggestionsHandler.GET,
        url: '/api/search/suggestions',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.popular).toHaveLength(3)
          expect(data.trending).toHaveLength(2)
        }
      })
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
    it('should cache frequent searches', async () => {
      const cachedResult = { cached: true, repositories: [] }
      
      // First call - cache miss
      vi.mocked(searchRepositories).mockResolvedValueOnce(mockSearchResults)
      
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=popular-query',
        test: async ({ fetch }) => {
          const response = await fetch({ method: 'GET' })
          expect(response.headers.get('x-cache')).toBe('miss')
        }
      })
      
      // Second call - cache hit
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=popular-query',
        test: async ({ fetch }) => {
          const response = await fetch({ method: 'GET' })
          expect(response.headers.get('x-cache')).toBe('hit')
        }
      })
      
      // Service should only be called once
      expect(searchRepositories).toHaveBeenCalledTimes(1)
    })

    it('should implement search rate limiting', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill(null).map(() => 
        fetch('/api/search?q=test', { method: 'GET' })
      )
      
      const responses = await Promise.all(requests)
      const statuses = responses.map(r => r.status)
      
      // Some requests should be rate limited
      expect(statuses.filter(s => s === 429).length).toBeGreaterThan(0)
    })
  })

  describe('Search Analytics', () => {
    it('should track search queries', async () => {
      const trackSpy = vi.spyOn(analytics, 'track')
      
      vi.mocked(searchRepositories).mockResolvedValueOnce(mockSearchResults)
      
      await testApiHandler({
        handler: searchHandler.GET,
        url: '/api/search?q=react+hooks',
        test: async ({ fetch }) => {
          await fetch({ method: 'GET' })
        }
      })
      
      expect(trackSpy).toHaveBeenCalledWith('search_performed', {
        query: 'react hooks',
        resultCount: 1,
        responseTime: expect.any(Number)
      })
    })

    it('should track search refinements', async () => {
      const trackSpy = vi.spyOn(analytics, 'track')
      
      vi.mocked(searchRepositories).mockResolvedValueOnce(mockSearchResults)
      
      await testApiHandler({
        handler: advancedSearchHandler.POST,
        test: async ({ fetch }) => {
          await fetch({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: 'react',
              filters: { language: 'TypeScript' },
              refinedFrom: 'previous-search-id'
            })
          })
        }
      })
      
      expect(trackSpy).toHaveBeenCalledWith('search_refined', 
        expect.objectContaining({
          filters: { language: 'TypeScript' },
          refinedFrom: 'previous-search-id'
        })
      )
    })
  })
})