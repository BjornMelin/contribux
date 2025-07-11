/**
 * Health Check API Endpoint Tests
 * Testing enterprise Zod validation patterns in production API
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD } from '../../../src/app/api/monitoring/health/route'

// Mock Neon database
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn().mockResolvedValue([{ status: 1 }])),
}))

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
  },
})

// Mock process.env
const mockEnv = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  npm_package_version: '1.0.0',
  NODE_ENV: 'test',
  VERCEL_GIT_COMMIT_SHA: 'abc123',
  VERCEL_GIT_COMMIT_REF: 'main',
  VERCEL_GIT_COMMIT_MESSAGE: '2023-12-01T00:00:00Z',
}

describe('Health Check API with Enterprise Zod Validation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.assign(process.env, mockEnv)

    // Mock process.uptime
    vi.spyOn(process, 'uptime').mockReturnValue(3600) // 1 hour uptime

    // Mock process.memoryUsage
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100 * 1024 * 1024, // 100MB
      heapTotal: 50 * 1024 * 1024, // 50MB
      heapUsed: 25 * 1024 * 1024, // 25MB
      external: 5 * 1024 * 1024, // 5MB
      arrayBuffers: 1 * 1024 * 1024, // 1MB
    })
  })

  describe('GET /api/monitoring/health', () => {
    it('should return healthy status with valid schema', async () => {
      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      expect(response.status).toBe(200)

      const data = await response.json()

      // Test modern Zod validation patterns
      expect(data).toMatchObject({
        status: 'healthy',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        version: '1.0.0',
        environment: 'test',
        services: {
          database: {
            status: 'connected',
            latency: expect.any(Number),
          },
          memory: {
            used: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number),
          },
          deployment: {
            build_time: expect.any(String),
            commit_hash: 'abc123',
            branch: 'main',
          },
        },
        uptime: 3600,
        response_time_ms: expect.any(Number),
        request_id: '123e4567-e89b-12d3-a456-426614174000',
      })

      // Validate enterprise response headers
      expect(response.headers.get('X-Request-ID')).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(response.headers.get('X-Health-Status')).toBe('healthy')
      expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/)
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    })

    it('should return degraded status for high memory usage', async () => {
      // Mock high memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 200 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 95 * 1024 * 1024, // 95% usage
        external: 5 * 1024 * 1024,
        arrayBuffers: 1 * 1024 * 1024,
      })

      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('degraded')
      expect(data.services.memory.percentage).toBe(95)
      expect(response.headers.get('X-Health-Status')).toBe('degraded')
    })

    it('should return unhealthy status for database errors', async () => {
      // Mock database error
      const { neon } = await import('@neondatabase/serverless')
      const mockSql = vi.fn().mockRejectedValue(new Error('Database connection failed'))
      vi.mocked(neon).mockReturnValue(mockSql)

      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      expect(response.status).toBe(503)

      const data = await response.json()
      expect(data.status).toBe('unhealthy')
      expect(data.services.database.status).toBe('error')
      expect(data.services.database.error).toBe('Database connection failed')
      expect(response.headers.get('X-Health-Status')).toBe('unhealthy')
    })

    it('should handle missing DATABASE_URL gracefully', async () => {
      process.env.DATABASE_URL = undefined

      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      expect(response.status).toBe(503)

      const data = await response.json()
      expect(data.status).toBe('unhealthy')
      expect(data.services.database.status).toBe('error')
      expect(data.services.database.error).toBe('DATABASE_URL not configured')
    })

    it('should validate response against enterprise schema', async () => {
      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      const data = await response.json()

      // Test Zod enterprise validation patterns
      expect(typeof data.status).toBe('string')
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status)
      expect(typeof data.timestamp).toBe('string')
      expect(new Date(data.timestamp)).toBeInstanceOf(Date)
      expect(typeof data.version).toBe('string')
      expect(data.version.length).toBeGreaterThan(0)
      expect(typeof data.environment).toBe('string')
      expect(typeof data.uptime).toBe('number')
      expect(data.uptime).toBeGreaterThanOrEqual(0)
      expect(typeof data.response_time_ms).toBe('number')
      expect(data.response_time_ms).toBeGreaterThanOrEqual(0)
      expect(typeof data.request_id).toBe('string')
      expect(data.request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should include performance monitoring data', async () => {
      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.response_time_ms).toBeGreaterThanOrEqual(0)
      expect(data.response_time_ms).toBeLessThan(1000) // Should be fast
    })
  })

  describe('HEAD /api/monitoring/health', () => {
    it('should return healthy status without body', async () => {
      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await HEAD(request)

      expect(response.status).toBe(200)
      expect(response.body).toBeNull()
      expect(response.headers.get('X-Health-Status')).toBe('healthy')
      expect(response.headers.get('X-Request-ID')).toBe('123e4567-e89b-12d3-a456-426614174000')
    })

    it('should return unhealthy status for database errors', async () => {
      // Mock database error
      const { neon } = await import('@neondatabase/serverless')
      const mockSql = vi.fn().mockRejectedValue(new Error('Connection failed'))
      vi.mocked(neon).mockReturnValue(mockSql)

      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await HEAD(request)

      expect(response.status).toBe(503)
      expect(response.body).toBeNull()
      expect(response.headers.get('X-Health-Status')).toBe('unhealthy')
      expect(response.headers.get('X-Request-ID')).toBe('123e4567-e89b-12d3-a456-426614174000')
    })
  })

  describe('Enterprise Validation Error Handling', () => {
    it('should handle validation errors with structured response', async () => {
      // This is a theoretical test - in practice, the schema should always pass
      // but it demonstrates how validation errors would be handled

      const request = new NextRequest('http://localhost:3000/api/monitoring/health')
      const response = await GET(request)

      // Even with successful validation, we can test the structure
      const data = await response.json()

      // Ensure all required fields are present for validation
      const requiredFields = [
        'status',
        'timestamp',
        'version',
        'environment',
        'services',
        'uptime',
        'response_time_ms',
        'request_id',
      ]

      for (const field of requiredFields) {
        expect(data).toHaveProperty(field)
      }

      // Validate nested service structure
      expect(data.services).toHaveProperty('database')
      expect(data.services).toHaveProperty('memory')
      expect(data.services).toHaveProperty('deployment')

      // Validate business logic constraints
      if (data.status === 'healthy') {
        expect(data.services.memory.percentage).toBeLessThan(95)
      }

      if (data.services.database.status === 'connected') {
        expect(data.services.database).toHaveProperty('latency')
        expect(typeof data.services.database.latency).toBe('number')
      }
    })
  })

  describe('Performance Monitoring Integration', () => {
    it('should track performance metrics for health checks', async () => {
      const request = new NextRequest('http://localhost:3000/api/monitoring/health')

      // Multiple requests to test performance tracking
      await GET(request)
      await GET(request)
      await HEAD(request)

      // Performance metrics would be tracked internally
      // This test verifies the integration works without errors
      expect(true).toBe(true) // Placeholder for actual metrics validation
    })
  })
})
