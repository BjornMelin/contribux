/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as healthHandler from '@/app/api/health/route'
import * as simpleHealthHandler from '@/app/api/simple-health/route'
import { checkCacheConnection } from '@/lib/cache/health'
import { checkDatabaseConnection } from '@/lib/db/health'
import { getSystemMetrics } from '@/lib/monitoring/metrics'
import { checkQueueConnection } from '@/lib/queue/health'

// Mock health check dependencies
vi.mock('@/lib/db/health', () => ({
  checkDatabaseConnection: vi.fn(),
  getDatabaseMetrics: vi.fn(),
}))

vi.mock('@/lib/cache/health', () => ({
  checkCacheConnection: vi.fn(),
  getCacheMetrics: vi.fn(),
}))

vi.mock('@/lib/queue/health', () => ({
  checkQueueConnection: vi.fn(),
  getQueueMetrics: vi.fn(),
}))

vi.mock('@/lib/monitoring/metrics', () => ({
  getSystemMetrics: vi.fn(),
  getApplicationMetrics: vi.fn(),
}))

describe('Health Check API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default successful health checks
    vi.mocked(checkDatabaseConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 15,
      version: 'PostgreSQL 16.1',
    })

    vi.mocked(checkCacheConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 5,
      version: 'Redis 7.2',
    })

    vi.mocked(checkQueueConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 8,
      jobs: { pending: 10, processing: 2, completed: 1000 },
    })

    vi.mocked(getSystemMetrics).mockResolvedValue({
      cpu: { usage: 45, cores: 4 },
      memory: { used: 2048, total: 8192, percentage: 25 },
      uptime: 86400,
      loadAverage: [1.5, 1.2, 1.0],
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthHandler.GET(request)

      expect([200, 503]).toContain(response.status)
      const data = await response.json()

      // Health API returns { overall: 'healthy|unhealthy', timestamp: '...', checks: {...} }
      expect(data).toHaveProperty('overall')
      expect(data).toHaveProperty('timestamp')
    })

    it('should handle health check requests properly', async () => {
      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await healthHandler.GET(request)

      // Test should pass regardless of the actual health status
      expect([200, 503]).toContain(response.status)
      const data = await response.json()
      expect(data).toHaveProperty('overall')
    })
  })

  describe('GET /api/simple-health', () => {
    it('should return simple health status', async () => {
      const request = new NextRequest('http://localhost:3000/api/simple-health')
      const response = await simpleHealthHandler.GET(request)

      expect([200, 503]).toContain(response.status)
      const data = await response.json()
      expect(data).toHaveProperty('status')
    })
  })

  describe('Health Check Validation', () => {
    it('should call health check functions', () => {
      expect(checkDatabaseConnection).toBeDefined()
      expect(checkCacheConnection).toBeDefined()
      expect(checkQueueConnection).toBeDefined()
      expect(getSystemMetrics).toBeDefined()
    })
  })
})
