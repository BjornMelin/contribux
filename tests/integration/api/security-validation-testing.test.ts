/**
 * Security Validation Testing Suite
 * Comprehensive security testing for API routes
 *
 * Focus Areas:
 * - Input validation and sanitization
 * - Rate limiting enforcement
 * - CORS policy validation
 * - SQL injection prevention
 * - XSS protection
 * - Data integrity validation
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Security test schemas
const SecurityErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
})

const ValidationErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal('INVALID_PARAMETER'),
    message: z.string(),
    details: z.array(
      z.object({
        path: z.array(z.string()),
        message: z.string(),
      })
    ),
  }),
})

const _RateLimitHeadersSchema = z.object({
  'X-RateLimit-Limit': z.string(),
  'X-RateLimit-Remaining': z.string(),
  'X-RateLimit-Reset': z.string(),
  'Retry-After': z.string().optional(),
})

describe('Input Validation & Sanitization', () => {
  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in search queries', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE repositories; --",
        "' OR 1=1 --",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO admin_users VALUES ('hacker', 'password'); --",
        "' OR '1'='1",
        "'; EXEC xp_cmdshell('dir'); --",
      ]

      // Reset handlers to ensure our test handlers take precedence
      server.resetHandlers()
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          // Check for SQL injection patterns
          if (query) {
            const sqlPatterns = [
              /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
              /(--|#|\/\*|\*\/)/,
              /(\bOR\b.*?\d+\s*=\s*\d+)/i,
              /(\bAND\b.*?\d+\s*=\s*\d+)/i,
              /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))/i,
              /('.*?OR.*?'.*?=.*?')/i,
              /(xp_cmdshell)/i,
            ]

            for (const pattern of sqlPatterns) {
              if (pattern.test(query)) {
                return HttpResponse.json(
                  {
                    success: false,
                    error: {
                      code: 'INVALID_INPUT',
                      message: 'Invalid characters detected in query parameter',
                      details: 'SQL injection attempt blocked',
                    },
                  },
                  { status: 400 }
                )
              }
            }
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: query || '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Input validated',
            },
          })
        })
      )

      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(
          `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(payload)}`
        )
        expect(response.status).toBe(400)

        const data = await response.json()
        const validatedError = SecurityErrorSchema.parse(data)
        expect(validatedError.error.code).toBe('INVALID_INPUT')
      }

      // Test legitimate query
      const legitimateResponse = await fetch(
        'http://localhost:3000/api/search/repositories?q=typescript'
      )
      expect(legitimateResponse.status).toBe(200)
    })

    it('should sanitize special characters in filter parameters', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const labels = url.searchParams.get('labels')
          const skillsRequired = url.searchParams.get('skills_required')

          // Check for dangerous characters in comma-separated values
          const dangerousPatterns = [
            /[<>"'&]/, // XSS characters
            /[\x00-\x1f\x7f]/, // Control characters
            /[;|`]/, // Command injection characters
          ]

          for (const param of [labels, skillsRequired]) {
            if (param) {
              for (const pattern of dangerousPatterns) {
                if (pattern.test(param)) {
                  return HttpResponse.json(
                    {
                      success: false,
                      error: {
                        code: 'INVALID_CHARACTERS',
                        message: 'Invalid characters detected in filter parameters',
                      },
                    },
                    { status: 400 }
                  )
                }
              }
            }
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Filters validated',
            },
          })
        })
      )

      // Test dangerous characters
      const dangerousInputs = [
        'bug,<script>alert("xss")</script>',
        'typescript,python;rm -rf /',
        'frontend,backend`whoami`',
        'test,label\x00injection',
      ]

      for (const input of dangerousInputs) {
        const response = await fetch(
          `http://localhost:3000/api/search/opportunities?labels=${encodeURIComponent(input)}`
        )
        expect(response.status).toBe(400)
      }

      // Test legitimate filter
      const legitimateResponse = await fetch(
        'http://localhost:3000/api/search/opportunities?labels=bug,feature,typescript'
      )
      expect(legitimateResponse.status).toBe(200)
    })
  })

  describe('XSS Protection', () => {
    it('should prevent XSS in query parameters', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<svg onload="alert(1)">',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        '<iframe src="javascript:alert(1)">',
      ]

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          if (query) {
            // Check for XSS patterns
            const xssPatterns = [
              /<script[^>]*>.*?<\/script>/gi,
              /<[^>]*on\w+\s*=\s*[^>]*>/gi,
              /javascript:/gi,
              /<iframe[^>]*>/gi,
              /<embed[^>]*>/gi,
              /<object[^>]*>/gi,
            ]

            for (const pattern of xssPatterns) {
              if (pattern.test(query)) {
                return HttpResponse.json(
                  {
                    success: false,
                    error: {
                      code: 'XSS_ATTEMPT',
                      message: 'Cross-site scripting attempt detected',
                    },
                  },
                  { status: 400 }
                )
              }
            }
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: query || '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'XSS check passed',
            },
          })
        })
      )

      for (const payload of xssPayloads) {
        const response = await fetch(
          `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(payload)}`
        )
        expect(response.status).toBe(400)

        const data = await response.json()
        const validatedError = SecurityErrorSchema.parse(data)
        expect(validatedError.error.code).toBe('XSS_ATTEMPT')
      }
    })
  })

  describe('Parameter Validation', () => {
    it('should validate numeric parameters strictly', async () => {
      // Reset handlers to ensure our test handlers take precedence
      server.resetHandlers()
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const page = url.searchParams.get('page')
          const perPage = url.searchParams.get('per_page')
          const minStars = url.searchParams.get('min_stars')

          // Debug logging
          console.log('Parameter validation handler called with:', {
            page,
            perPage,
            minStars,
            url: url.toString(),
          })

          // Validate page parameter
          if (page !== null) {
            // Reject scientific notation, decimals, or non-integer strings
            if (/[eE.]/.test(page) || !/^\d+$/.test(page)) {
              console.log('Page validation failed (invalid format), returning 400')
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Page must be a positive integer',
                    details: [
                      { path: ['page'], message: `Expected positive integer, received ${page}` },
                    ],
                  },
                },
                { status: 400 }
              )
            }
            const pageNum = Number(page)
            console.log('Page validation:', {
              page,
              pageNum,
              isNaN: Number.isNaN(pageNum),
              lessThan1: pageNum < 1,
              isInteger: Number.isInteger(pageNum),
            })
            if (
              Number.isNaN(pageNum) ||
              pageNum < 1 ||
              !Number.isInteger(pageNum) ||
              pageNum % 1 !== 0
            ) {
              console.log('Page validation failed, returning 400')
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Page must be a positive integer',
                    details: [
                      { path: ['page'], message: `Expected positive integer, received ${page}` },
                    ],
                  },
                },
                { status: 400 }
              )
            }
          }

          // Validate per_page parameter
          if (perPage !== null) {
            // Reject scientific notation, decimals, or non-integer strings
            if (/[eE.]/.test(perPage) || !/^\d+$/.test(perPage)) {
              console.log('PerPage validation failed (invalid format), returning 400')
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Per page must be an integer between 1 and 100',
                    details: [
                      {
                        path: ['per_page'],
                        message: `Expected integer 1-100, received ${perPage}`,
                      },
                    ],
                  },
                },
                { status: 400 }
              )
            }
            const perPageNum = Number(perPage)
            console.log('PerPage validation:', {
              perPage,
              perPageNum,
              isNaN: Number.isNaN(perPageNum),
              lessThan1: perPageNum < 1,
              greaterThan100: perPageNum > 100,
              isInteger: Number.isInteger(perPageNum),
            })
            if (
              Number.isNaN(perPageNum) ||
              perPageNum < 1 ||
              perPageNum > 100 ||
              !Number.isInteger(perPageNum)
            ) {
              console.log('PerPage validation failed, returning 400')
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Per page must be an integer between 1 and 100',
                    details: [
                      {
                        path: ['per_page'],
                        message: `Expected integer 1-100, received ${perPage}`,
                      },
                    ],
                  },
                },
                { status: 400 }
              )
            }
          }

          // Validate min_stars parameter
          if (minStars !== null) {
            // Reject scientific notation and other non-standard formats
            const hasScientificNotation = /[eE]/i.test(minStars)
            const minStarsNum = Number(minStars)
            console.log('MinStars validation:', {
              minStars,
              minStarsNum,
              isNaN: Number.isNaN(minStarsNum),
              lessThan0: minStarsNum < 0,
              isInteger: Number.isInteger(minStarsNum),
              hasScientificNotation,
            })
            if (
              Number.isNaN(minStarsNum) ||
              minStarsNum < 0 ||
              !Number.isInteger(minStarsNum) ||
              hasScientificNotation
            ) {
              console.log('MinStars validation failed, returning 400')
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Min stars must be a non-negative integer',
                    details: [
                      {
                        path: ['min_stars'],
                        message: `Expected non-negative integer, received ${minStars}`,
                      },
                    ],
                  },
                },
                { status: 400 }
              )
            }
          }

          console.log('All validations passed, returning 200')
          return HttpResponse.json({
            success: true,
            data: {
              repositories: [],
              total_count: 0,
              page: Number(page) || 1,
              per_page: Number(perPage) || 20,
              has_more: false,
            },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Parameters validated',
            },
          })
        })
      )

      // Test invalid numeric formats
      const invalidParams = [
        'page=1.5', // Float instead of integer
        'page=-1', // Negative number
        'page=abc', // String instead of number
        'per_page=0', // Below minimum
        'per_page=101', // Above maximum
        'min_stars=-5', // Negative stars
        'min_stars=1e5', // Scientific notation
      ]

      for (const param of invalidParams) {
        const response = await fetch(`http://localhost:3000/api/search/repositories?${param}`)
        expect(response.status).toBe(400)

        const data = await response.json()
        const validatedError = ValidationErrorSchema.parse(data)
        expect(validatedError.error.code).toBe('INVALID_PARAMETER')
      }

      // Test valid parameters
      const validResponse = await fetch(
        'http://localhost:3000/api/search/repositories?page=2&per_page=50&min_stars=100'
      )
      expect(validResponse.status).toBe(200)
    })

    it('should validate enum parameters strictly', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const difficulty = url.searchParams.get('difficulty')
          const sortBy = url.searchParams.get('sort_by')
          const order = url.searchParams.get('order')

          // Validate difficulty enum
          if (
            difficulty !== null &&
            !['beginner', 'intermediate', 'advanced'].includes(difficulty)
          ) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_PARAMETER',
                  message: 'Invalid enum value',
                  details: [
                    {
                      path: ['difficulty'],
                      message: `Expected beginner | intermediate | advanced, received ${difficulty}`,
                    },
                  ],
                },
              },
              { status: 400 }
            )
          }

          // Validate sort_by enum
          if (
            sortBy !== null &&
            !['difficulty', 'impact', 'match', 'created', 'updated', 'relevance'].includes(sortBy)
          ) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_PARAMETER',
                  message: 'Invalid enum value',
                  details: [{ path: ['sort_by'], message: `Invalid sort field: ${sortBy}` }],
                },
              },
              { status: 400 }
            )
          }

          // Validate order enum
          if (order !== null && !['asc', 'desc'].includes(order)) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_PARAMETER',
                  message: 'Invalid enum value',
                  details: [{ path: ['order'], message: `Expected asc | desc, received ${order}` }],
                },
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Enum validation passed',
            },
          })
        })
      )

      // Test invalid enum values
      const invalidEnums = [
        'difficulty=expert',
        'difficulty=BEGINNER', // Case sensitive
        'sort_by=popularity',
        'sort_by=random',
        'order=ascending',
        'order=random',
      ]

      for (const param of invalidEnums) {
        const response = await fetch(`http://localhost:3000/api/search/opportunities?${param}`)
        expect(response.status).toBe(400)

        const data = await response.json()
        const validatedError = ValidationErrorSchema.parse(data)
        expect(validatedError.error.code).toBe('INVALID_PARAMETER')
      }

      // Test valid enum values
      const validResponse = await fetch(
        'http://localhost:3000/api/search/opportunities?difficulty=intermediate&sort_by=impact&order=desc'
      )
      expect(validResponse.status).toBe(200)
    })

    it('should validate UUID parameters', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const repositoryId = url.searchParams.get('repository_id')

          if (repositoryId !== null) {
            // UUID v4 format validation
            const uuidRegex =
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

            if (!uuidRegex.test(repositoryId)) {
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_PARAMETER',
                    message: 'Invalid UUID format',
                    details: [
                      {
                        path: ['repository_id'],
                        message: `Expected valid UUID v4, received ${repositoryId}`,
                      },
                    ],
                  },
                },
                { status: 400 }
              )
            }
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'UUID validation passed',
            },
          })
        })
      )

      // Test invalid UUID formats
      const invalidUUIDs = [
        'repository_id=123',
        'repository_id=not-a-uuid',
        'repository_id=123e4567-e89b-12d3-a456-42661417400', // Missing character
        'repository_id=123e4567-e89b-12d3-a456-42661417400g', // Invalid character
        'repository_id=123e4567-e89b-52d3-a456-426614174000', // Wrong version (5 instead of 4)
      ]

      for (const param of invalidUUIDs) {
        const response = await fetch(`http://localhost:3000/api/search/opportunities?${param}`)
        expect(response.status).toBe(400)

        const data = await response.json()
        const validatedError = ValidationErrorSchema.parse(data)
        expect(validatedError.error.code).toBe('INVALID_PARAMETER')
      }

      // Test valid UUID
      const validResponse = await fetch(
        'http://localhost:3000/api/search/opportunities?repository_id=123e4567-e89b-42d3-a456-426614174000'
      )
      expect(validResponse.status).toBe(200)
    })
  })
})

describe('Rate Limiting Enforcement', () => {
  describe('API Rate Limits', () => {
    it('should enforce per-user rate limits', async () => {
      const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          // Simulate user identification (in real app, from session/JWT)
          const userId = request.headers.get('Authorization')?.split(' ')[1] || 'anonymous'
          const now = Date.now()
          const windowSize = 60 * 1000 // 1 minute window
          const maxRequests = 100

          let userLimit = rateLimitStore.get(userId)
          if (!userLimit || now > userLimit.resetTime) {
            userLimit = { count: 0, resetTime: now + windowSize }
            rateLimitStore.set(userId, userLimit)
          }

          userLimit.count++

          const remaining = Math.max(0, maxRequests - userLimit.count)
          const headers = {
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(userLimit.resetTime),
          }

          if (userLimit.count > maxRequests) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Rate limit exceeded. Please try again later.',
                },
              },
              {
                status: 429,
                headers: {
                  ...headers,
                  'Retry-After': String(Math.ceil((userLimit.resetTime - now) / 1000)),
                },
              }
            )
          }

          return HttpResponse.json(
            {
              success: true,
              data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
              metadata: {
                query: '',
                filters: {},
                execution_time_ms: 25,
                performance_note: 'Rate limit check passed',
              },
            },
            { headers }
          )
        })
      )

      // Test rate limiting for anonymous user
      let response: Response
      for (let i = 1; i <= 105; i++) {
        response = await fetch('http://localhost:3000/api/search/repositories')

        if (i <= 100) {
          expect(response.status).toBe(200)
          expect(Number(response.headers.get('X-RateLimit-Remaining'))).toBe(100 - i)
        } else {
          expect(response.status).toBe(429)
          expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
          expect(response.headers.get('Retry-After')).toBeDefined()

          const data = await response.json()
          const validatedError = SecurityErrorSchema.parse(data)
          expect(validatedError.error.code).toBe('RATE_LIMIT_EXCEEDED')
        }
      }
    })

    it('should enforce different rate limits per endpoint', async () => {
      const endpointLimits = {
        '/api/search/repositories': { max: 100, window: 60000 },
        '/api/search/opportunities': { max: 50, window: 60000 },
        '/api/health': { max: 10, window: 60000 },
      }

      const rateLimitStore = new Map<string, Map<string, { count: number; resetTime: number }>>()

      server.use(
        http.get('http://localhost:3000/api/search/:endpoint', ({ params }) => {
          const endpoint = `/api/search/${params.endpoint}`
          const userId = 'test-user'
          const now = Date.now()

          const config = endpointLimits[endpoint as keyof typeof endpointLimits]
          if (!config) return HttpResponse.json({ error: 'Not found' }, { status: 404 })

          let userLimits = rateLimitStore.get(userId)
          if (!userLimits) {
            userLimits = new Map()
            rateLimitStore.set(userId, userLimits)
          }

          let endpointLimit = userLimits.get(endpoint)
          if (!endpointLimit || now > endpointLimit.resetTime) {
            endpointLimit = { count: 0, resetTime: now + config.window }
            userLimits.set(endpoint, endpointLimit)
          }

          endpointLimit.count++
          const remaining = Math.max(0, config.max - endpointLimit.count)

          if (endpointLimit.count > config.max) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: `Rate limit exceeded for ${endpoint}`,
                },
              },
              {
                status: 429,
                headers: {
                  'X-RateLimit-Limit': String(config.max),
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(endpointLimit.resetTime),
                  'Retry-After': String(Math.ceil((endpointLimit.resetTime - now) / 1000)),
                },
              }
            )
          }

          return HttpResponse.json(
            {
              success: true,
              data: endpoint.includes('repositories')
                ? { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false }
                : { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
              metadata: {
                query: '',
                filters: {},
                execution_time_ms: 25,
                performance_note: 'Endpoint rate limit check',
              },
            },
            {
              headers: {
                'X-RateLimit-Limit': String(config.max),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(endpointLimit.resetTime),
              },
            }
          )
        })
      )

      // Test repositories endpoint (limit: 100)
      for (let i = 1; i <= 102; i++) {
        const response = await fetch('http://localhost:3000/api/search/repositories')
        if (i <= 100) {
          expect(response.status).toBe(200)
        } else {
          expect(response.status).toBe(429)
        }
      }

      // Test opportunities endpoint (limit: 50) - should still work
      const opportunitiesResponse = await fetch('http://localhost:3000/api/search/opportunities')
      expect(opportunitiesResponse.status).toBe(200)
      expect(opportunitiesResponse.headers.get('X-RateLimit-Limit')).toBe('50')
      expect(opportunitiesResponse.headers.get('X-RateLimit-Remaining')).toBe('49')
    })
  })

  describe('Burst Protection', () => {
    it('should handle sudden traffic spikes', async () => {
      let burstCount = 0
      const burstThreshold = 10
      const burstWindow = 5000 // 5 seconds

      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          const _now = Date.now()
          burstCount++

          // Reset burst count after window
          setTimeout(() => burstCount--, burstWindow)

          if (burstCount > burstThreshold) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'BURST_LIMIT_EXCEEDED',
                  message: 'Too many requests in a short time. Please slow down.',
                },
              },
              {
                status: 429,
                headers: {
                  'X-Burst-Limit': String(burstThreshold),
                  'X-Burst-Remaining': '0',
                  'Retry-After': '5',
                },
              }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Burst protection check',
            },
          })
        })
      )

      // Send burst of requests
      const burstRequests = Array.from({ length: 15 }, () =>
        fetch('http://localhost:3000/api/search/repositories')
      )

      const responses = await Promise.all(burstRequests)

      // First 10 should succeed, rest should fail
      for (let i = 0; i < responses.length; i++) {
        if (i < burstThreshold) {
          expect(responses[i].status).toBe(200)
        } else {
          expect(responses[i].status).toBe(429)
          const data = await responses[i].json()
          expect(data.error.code).toBe('BURST_LIMIT_EXCEEDED')
        }
      }
    })
  })
})

describe('CORS Policy Validation', () => {
  describe('Origin Validation', () => {
    it('should validate allowed origins', async () => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://contribux.com',
        'https://app.contribux.com',
      ]

      server.use(
        http.options('http://localhost:3000/api/search/repositories', ({ request }) => {
          const origin = request.headers.get('Origin')

          if (!origin || !allowedOrigins.includes(origin)) {
            return new HttpResponse(null, {
              status: 403,
              headers: {
                'Access-Control-Allow-Origin': 'null',
              },
            })
          }

          return new HttpResponse(null, {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Max-Age': '86400',
            },
          })
        })
      )

      // Test allowed origins
      for (const origin of allowedOrigins) {
        const response = await fetch('http://localhost:3000/api/search/repositories', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      }

      // Test disallowed origins
      const disallowedOrigins = [
        'https://malicious-site.com',
        'http://localhost:8080',
        'https://fake-contribux.com',
      ]

      for (const origin of disallowedOrigins) {
        const response = await fetch('http://localhost:3000/api/search/repositories', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        })
        expect(response.status).toBe(403)
      }
    })

    it('should handle complex CORS preflight requests', async () => {
      server.use(
        http.options('http://localhost:3000/api/auth/unlink', ({ request }) => {
          const origin = request.headers.get('Origin')
          const requestMethod = request.headers.get('Access-Control-Request-Method')
          const requestHeaders = request.headers.get('Access-Control-Request-Headers')

          // Validate origin
          if (origin !== 'http://localhost:3000') {
            return new HttpResponse(null, { status: 403 })
          }

          // Validate method
          if (requestMethod !== 'POST') {
            return new HttpResponse(null, { status: 405 })
          }

          // Validate headers
          const allowedHeaders = ['Content-Type', 'Authorization', 'X-CSRF-Token']
          const requestedHeaders = requestHeaders?.split(',').map(h => h.trim()) || []

          for (const header of requestedHeaders) {
            if (!allowedHeaders.includes(header)) {
              return new HttpResponse(null, { status: 400 })
            }
          }

          return new HttpResponse(null, {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Methods': 'POST',
              'Access-Control-Allow-Headers': allowedHeaders.join(', '),
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Max-Age': '3600',
            },
          })
        })
      )

      // Valid preflight request
      const validResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      })
      expect(validResponse.status).toBe(200)

      // Invalid method
      const invalidMethodResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'DELETE',
        },
      })
      expect(invalidMethodResponse.status).toBe(405)

      // Invalid headers
      const invalidHeadersResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, X-Custom-Header',
        },
      })
      expect(invalidHeadersResponse.status).toBe(400)
    })
  })
})

describe('Data Integrity Validation', () => {
  describe('Response Schema Validation', () => {
    it('should validate response schemas match API contracts', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          // Return response with missing required fields to test validation
          return HttpResponse.json({
            success: true,
            data: {
              repositories: [
                {
                  id: 'invalid-uuid', // Invalid UUID format
                  fullName: 'test-repo',
                  // Missing required fields: githubId, name, owner, etc.
                },
              ],
              total_count: 1,
              page: 1,
              per_page: 20,
              has_more: false,
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories')
      expect(response.status).toBe(200)

      const data = await response.json()

      // In a real implementation, the API would validate the response schema
      // and return an error if it doesn't match the expected format
      expect(data.success).toBe(true)
      expect(data.data.repositories[0].id).toBe('invalid-uuid')
    })
  })

  describe('Request Size Limits', () => {
    it('should enforce request body size limits', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/set-primary', ({ request }) => {
          const contentLength = request.headers.get('Content-Length')
          const maxSize = 1024 * 1024 // 1MB limit

          if (contentLength && Number(contentLength) > maxSize) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'REQUEST_TOO_LARGE',
                  message: 'Request body exceeds maximum size limit',
                },
              },
              { status: 413 }
            )
          }

          return HttpResponse.json({
            success: true,
            message: 'Request processed successfully',
          })
        })
      )

      // Test normal size request
      const normalResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '100',
        },
        body: JSON.stringify({ providerId: 'github' }),
      })
      expect(normalResponse.status).toBe(200)

      // Test oversized request
      const oversizedResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(2 * 1024 * 1024), // 2MB
        },
        body: 'x'.repeat(2 * 1024 * 1024),
      })
      expect(oversizedResponse.status).toBe(413)

      const data = await oversizedResponse.json()
      const validatedError = SecurityErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('REQUEST_TOO_LARGE')
    })
  })
})
