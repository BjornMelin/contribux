/**
 * API Test Utilities
 * Reusable utilities for API route testing
 *
 * Features:
 * - Request builders with type safety
 * - Response validators
 * - Performance measurement
 * - Error simulation
 * - Authentication helpers
 * - Rate limiting simulation
 */

import type { HttpHandler } from 'msw'
import { http, HttpResponse } from 'msw'
import { expect } from 'vitest'
import { z } from 'zod'

// Type definitions for better type safety
interface RequestMetadata extends Record<string, unknown> {
  requestId?: string
  userAgent?: string
  timestamp?: string
}

interface JWTPayload extends Record<string, unknown> {
  sub?: string
  email?: string
  iat?: number
  exp?: number
  [key: string]: unknown
}

type RequestBody = Record<string, unknown> | string | null | undefined

// Common API response schemas
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  metadata: z
    .object({
      query: z.string().optional(),
      filters: z.record(z.any()).optional(),
      execution_time_ms: z.number().optional(),
      performance_note: z.string().optional(),
    })
    .optional(),
})

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string().optional(),
})

export const PaginatedResponseSchema = z.object({
  page: z.number(),
  per_page: z.number(),
  total_count: z.number(),
  has_more: z.boolean(),
})

// Performance measurement utilities
interface PerformanceMeasurement {
  endpoint: string
  method: string
  duration: number
  status: number
  timestamp: Date
  metadata?: RequestMetadata
}

class ApiPerformanceTracker {
  private measurements: PerformanceMeasurement[] = []

  async measureRequest<_T>(
    endpoint: string,
    method: string,
    requestFn: () => Promise<Response>,
    metadata?: RequestMetadata
  ): Promise<{ response: Response; measurement: PerformanceMeasurement }> {
    const start = performance.now()
    const response = await requestFn()
    const duration = performance.now() - start

    const measurement: PerformanceMeasurement = {
      endpoint,
      method,
      duration,
      status: response.status,
      timestamp: new Date(),
      metadata,
    }

    this.measurements.push(measurement)
    return { response, measurement }
  }

  getMeasurements(): PerformanceMeasurement[] {
    return [...this.measurements]
  }

  getAverageDuration(endpoint?: string): number {
    const filtered = endpoint
      ? this.measurements.filter(m => m.endpoint === endpoint)
      : this.measurements

    if (filtered.length === 0) return 0

    return filtered.reduce((sum, m) => sum + m.duration, 0) / filtered.length
  }

  getSlowRequests(threshold = 1000): PerformanceMeasurement[] {
    return this.measurements.filter(m => m.duration > threshold)
  }

  clear(): void {
    this.measurements = []
  }

  generateReport(): {
    totalRequests: number
    averageDuration: number
    slowRequests: number
    errorRate: number
    byEndpoint: Record<
      string,
      {
        count: number
        averageDuration: number
        errorRate: number
      }
    >
  } {
    const total = this.measurements.length
    const errors = this.measurements.filter(m => m.status >= 400).length
    const slow = this.getSlowRequests().length

    const byEndpoint = this.measurements.reduce(
      (acc, measurement) => {
        if (!acc[measurement.endpoint]) {
          acc[measurement.endpoint] = {
            measurements: [],
            errors: 0,
          }
        }

        acc[measurement.endpoint].measurements.push(measurement)
        if (measurement.status >= 400) {
          acc[measurement.endpoint].errors++
        }

        return acc
      },
      {} as Record<string, { measurements: PerformanceMeasurement[]; errors: number }>
    )

    const endpointStats = Object.entries(byEndpoint).reduce(
      (acc, [endpoint, data]) => {
        acc[endpoint] = {
          count: data.measurements.length,
          averageDuration:
            data.measurements.reduce((sum, m) => sum + m.duration, 0) / data.measurements.length,
          errorRate: data.errors / data.measurements.length,
        }
        return acc
      },
      {} as Record<string, { count: number; averageDuration: number; errorRate: number }>
    )

    return {
      totalRequests: total,
      averageDuration: this.getAverageDuration(),
      slowRequests: slow,
      errorRate: total > 0 ? errors / total : 0,
      byEndpoint: endpointStats,
    }
  }
}

// Request builders
export class ApiRequestBuilder {
  private baseUrl: string
  private headers: Record<string, string> = {}

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
  }

  withAuth(token: string): this {
    this.headers.Authorization = `Bearer ${token}`
    return this
  }

  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers }
    return this
  }

  withContentType(type: string): this {
    this.headers['Content-Type'] = type
    return this
  }

  async get(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value))
      })
    }

    return fetch(url.toString(), {
      method: 'GET',
      headers: this.headers,
    })
  }

  async post(endpoint: string, body?: RequestBody): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async put(endpoint: string, body?: RequestBody): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete(endpoint: string): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.headers,
    })
  }
}

// Response validators
export async function validateSuccessResponse(
  response: Response
): Promise<z.infer<typeof ApiSuccessResponseSchema>> {
  expect(response.status).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(400)

  const data = await response.json()
  return ApiSuccessResponseSchema.parse(data)
}

export async function validateErrorResponse(
  response: Response,
  expectedStatus?: number
): Promise<z.infer<typeof ApiErrorResponseSchema>> {
  if (expectedStatus) {
    expect(response.status).toBe(expectedStatus)
  } else {
    expect(response.status).toBeGreaterThanOrEqual(400)
  }

  const data = await response.json()
  return ApiErrorResponseSchema.parse(data)
}

export async function validatePaginatedResponse(
  response: Response
): Promise<
  z.infer<typeof ApiSuccessResponseSchema> & { data: z.infer<typeof PaginatedResponseSchema> }
> {
  const validatedResponse = await validateSuccessResponse(response)
  const paginationData = PaginatedResponseSchema.parse(validatedResponse.data)

  return {
    ...validatedResponse,
    data: paginationData,
  }
}

export function validatePerformance(
  measurement: PerformanceMeasurement,
  thresholds: {
    maxDuration?: number
    minDuration?: number
    expectedStatus?: number
  }
): void {
  if (thresholds.maxDuration) {
    expect(measurement.duration).toBeLessThanOrEqual(thresholds.maxDuration)
  }

  if (thresholds.minDuration) {
    expect(measurement.duration).toBeGreaterThanOrEqual(thresholds.minDuration)
  }

  if (thresholds.expectedStatus) {
    expect(measurement.status).toBe(thresholds.expectedStatus)
  }
}

export function validateHeaders(
  response: Response,
  expectedHeaders: Record<string, string | RegExp>
): void {
  Object.entries(expectedHeaders).forEach(([headerName, expectedValue]) => {
    const actualValue = response.headers.get(headerName)
    expect(actualValue).toBeDefined()

    if (expectedValue instanceof RegExp) {
      expect(actualValue).toMatch(expectedValue)
    } else {
      expect(actualValue).toBe(expectedValue)
    }
  })
}

// Authentication helpers
export function generateMockJWT(payload: JWTPayload = {}): string {
  // Generate a mock JWT for testing (not cryptographically secure)
  const header = { alg: 'HS256', typ: 'JWT' }
  const defaultPayload = {
    sub: 'test-user-id',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    ...payload,
  }

  const encode = (obj: JWTPayload | { alg: string; typ: string }) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  return `${encode(header)}.${encode(defaultPayload)}.mock-signature`
}

export function generateExpiredJWT(): string {
  return generateMockJWT({
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  })
}

export function generateInvalidJWT(): string {
  return 'invalid.jwt.token'
}

export function createAuthenticatedRequest(token?: string): ApiRequestBuilder {
  const builder = new ApiRequestBuilder()
  return builder.withAuth(token || generateMockJWT())
}

export function createUnauthenticatedRequest(): ApiRequestBuilder {
  return new ApiRequestBuilder()
}

// Rate limiting utilities
export class RateLimitSimulator {
  private requestCounts = new Map<string, { count: number; resetTime: number }>()

  createRateLimitedHandler(
    endpoint: string,
    maxRequests: number,
    windowMs: number,
    handler: (request: Request) => Response | Promise<Response>
  ): HttpHandler {
    return http.all(endpoint, async ({ request }) => {
      const clientId =
        request.headers.get('X-Client-ID') || request.headers.get('Authorization') || 'anonymous'

      const now = Date.now()
      let clientData = this.requestCounts.get(clientId)

      if (!clientData || now > clientData.resetTime) {
        clientData = { count: 0, resetTime: now + windowMs }
        this.requestCounts.set(clientId, clientData)
      }

      clientData.count++

      const remaining = Math.max(0, maxRequests - clientData.count)
      const headers = {
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(clientData.resetTime),
      }

      if (clientData.count > maxRequests) {
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
              'Retry-After': String(Math.ceil((clientData.resetTime - now) / 1000)),
            },
          }
        )
      }

      const response = await handler(request)

      if (response instanceof Response) {
        // Add rate limit headers to existing response
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
        return response
      }

      return new Response(response, { headers })
    })
  }

  reset(): void {
    this.requestCounts.clear()
  }
}

// Error simulation utilities
export function createNetworkError(): Promise<never> {
  return Promise.reject(new Error('Network error'))
}

export function createTimeoutError(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), 100)
  })
}

export function create500Error(): HttpResponse {
  return HttpResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    { status: 500 }
  )
}

export function createDatabaseError(): HttpResponse {
  return HttpResponse.json(
    {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection failed',
        details: {
          error_type: 'CONNECTION_FAILED',
          retry_after: 5,
        },
      },
    },
    { status: 503 }
  )
}

export function createValidationError(fields: string[]): HttpResponse {
  return HttpResponse.json(
    {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: fields.map(field => ({
          path: [field],
          message: `${field} is required`,
        })),
      },
    },
    { status: 400 }
  )
}

// Test data generators
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function generateRandomString(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function generateRandomEmail(): string {
  return `${generateRandomString(8)}@${generateRandomString(5)}.com`
}

export function generateRandomNumber(min = 0, max = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function generateRandomBool(): boolean {
  return Math.random() > 0.5
}

export function generatePaginationParams(
  overrides: Partial<{
    page: number
    per_page: number
    total_count: number
  }> = {}
): { page: number; per_page: number; total_count: number; has_more: boolean } {
  const page = overrides.page || 1
  const per_page = overrides.per_page || 20
  const total_count = overrides.total_count || generateRandomNumber(0, 1000)
  const has_more = page * per_page < total_count

  return { page, per_page, total_count, has_more }
}

// Export utilities
export const apiTestUtils = {
  performanceTracker: ApiPerformanceTracker,
  requestBuilder: ApiRequestBuilder,
  responseValidator: {
    validateSuccessResponse,
    validateErrorResponse,
    validatePaginatedResponse,
    validatePerformance,
    validateHeaders,
  },
  authHelper: {
    generateMockJWT,
    generateExpiredJWT,
    generateInvalidJWT,
    createAuthenticatedRequest,
    createUnauthenticatedRequest,
  },
  rateLimitSimulator: RateLimitSimulator,
  errorSimulator: {
    createNetworkError,
    createTimeoutError,
    create500Error,
    createDatabaseError,
    createValidationError,
  },
  dataGenerator: {
    generateUUID,
    generateRandomString,
    generateRandomEmail,
    generateRandomNumber,
    generateRandomBool,
    generatePaginationParams,
  },
}

// Export performance tracker instance for reuse
export const performanceTracker = new ApiPerformanceTracker()

// Type exports
export type { PerformanceMeasurement }
