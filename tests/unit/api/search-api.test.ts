/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import * as opportunitiesHandler from '@/app/api/search/opportunities/route'
import * as repositoriesHandler from '@/app/api/search/repositories/route'
import { SearchValidator } from '@/lib/validation/search-validator'

describe('Search API', () => {
  describe('GET /api/search/repositories', () => {
    it('returns the current public repository search envelope', async () => {
      const request = new NextRequest('http://localhost:3000/api/search/repositories?q=typescript')
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(200)
      const body = await response.json()

      expect(body.success).toBe(true)
      expect(body.data.repositories).toHaveLength(1)
      expect(body.data.repositories[0].fullName).toBe('microsoft/TypeScript')
      expect(body.data.total_count).toBe(1)
      expect(body.metadata.query).toBe('typescript')
    })

    it('returns validation errors as bad requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/search/repositories')
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toBe('Invalid input data provided.')
    })

    it('returns page metadata and total filtered count', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/search/repositories?q=react&page=2&per_page=1'
      )
      const response = await repositoriesHandler.GET(request)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data.page).toBe(2)
      expect(body.data.per_page).toBe(1)
      expect(body.data.total_count).toBe(2)
      expect(body.data.has_more).toBe(false)
    })
  })

  describe('GET /api/search/opportunities', () => {
    it('requires authentication for opportunity search', async () => {
      const request = new NextRequest('http://localhost:3000/api/search/opportunities?q=beginner')
      const response = await opportunitiesHandler.GET(request)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('SearchValidator', () => {
    const validator = new SearchValidator()

    it('sanitizes script payloads from search text', () => {
      const dangerous = '<script>alert("xss")</script>react'
      const sanitized = validator.sanitizeQuery(dangerous)

      expect(sanitized).toBe('react')
      expect(sanitized).not.toContain('<script>')
    })

    it('rejects overlong queries', () => {
      const result = validator.validateQuery('a'.repeat(300))

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Query too long')
    })

    it('parses search operators and quoted phrases', () => {
      expect(
        validator.parseSearchOperators('language:typescript stars:>100 user:microsoft')
      ).toMatchObject({
        baseQuery: '',
        language: 'typescript',
        minStars: 100,
        user: 'microsoft',
      })

      const parsed = validator.parseQuery('"machine learning" python -tensorflow')
      expect(parsed.requiredTerms).toContain('machine learning')
      expect(parsed.terms).toContain('python')
      expect(parsed.excludedTerms).toContain('tensorflow')
    })
  })
})
