/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest } from 'next/server'
import * as healthHandler from '@/app/api/health/route'
import * as liveHandler from '@/app/api/health/live/route'
import * as readyHandler from '@/app/api/health/ready/route'
import { checkDatabaseConnection } from '@/lib/db/health'
import { checkCacheConnection } from '@/lib/cache/health'
import { checkQueueConnection } from '@/lib/queue/health'
import { getSystemMetrics } from '@/lib/monitoring/metrics'
import { testApiHandler } from 'next-test-api-route-handler'

// Mock health check dependencies
vi.mock('@/lib/db/health', () => ({
  checkDatabaseConnection: vi.fn(),
  getDatabaseMetrics: vi.fn()
}))

vi.mock('@/lib/cache/health', () => ({
  checkCacheConnection: vi.fn(),
  getCacheMetrics: vi.fn()
}))

vi.mock('@/lib/queue/health', () => ({
  checkQueueConnection: vi.fn(),
  getQueueMetrics: vi.fn()
}))

vi.mock('@/lib/monitoring/metrics', () => ({
  getSystemMetrics: vi.fn(),
  getApplicationMetrics: vi.fn()
}))

describe('Health Check API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful health checks
    vi.mocked(checkDatabaseConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 15,
      version: 'PostgreSQL 16.1'
    })
    
    vi.mocked(checkCacheConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 5,
      version: 'Redis 7.2'
    })
    
    vi.mocked(checkQueueConnection).mockResolvedValue({
      status: 'healthy',
      responseTime: 8,
      jobs: { pending: 10, processing: 2, completed: 1000 }
    })
    
    vi.mocked(getSystemMetrics).mockResolvedValue({
      cpu: { usage: 45, cores: 4 },
      memory: { used: 2048, total: 8192, percentage: 25 },
      uptime: 86400,
      loadAverage: [1.5, 1.2, 1.0]
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /api/health', () => {
    it('should return healthy status when all services are up', async () => {
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          
          expect(data).toMatchObject({
            status: 'healthy',
            timestamp: expect.any(String),
            services: {
              database: { status: 'healthy', responseTime: 15 },
              cache: { status: 'healthy', responseTime: 5 },
              queue: { status: 'healthy', responseTime: 8 }
            },
            system: {
              cpu: { usage: 45 },
              memory: { percentage: 25 },
              uptime: 86400
            }
          })
        }
      })
    })

    it('should return degraded status when a service is slow', async () => {
      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        status: 'degraded',
        responseTime: 500,
        warning: 'High response time'
      })
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.status).toBe('degraded')
          expect(data.services.database.status).toBe('degraded')
        }
      })
    })

    it('should return unhealthy status when a critical service is down', async () => {
      vi.mocked(checkDatabaseConnection).mockRejectedValue(new Error('Connection refused'))
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(503)
          const data = await response.json()
          expect(data.status).toBe('unhealthy')
          expect(data.services.database.status).toBe('unhealthy')
          expect(data.services.database.error).toContain('Connection refused')
        }
      })
    })

    it('should include detailed metrics when verbose query param is set', async () => {
      await testApiHandler({
        handler: healthHandler.GET,
        url: '/api/health?verbose=true',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          
          expect(data.details).toBeDefined()
          expect(data.details.database).toMatchObject({
            version: 'PostgreSQL 16.1',
            connections: expect.any(Object)
          })
          expect(data.details.cache).toBeDefined()
          expect(data.details.queue).toMatchObject({
            jobs: { pending: 10, processing: 2, completed: 1000 }
          })
        }
      })
    })

    it('should handle partial service failures gracefully', async () => {
      vi.mocked(checkCacheConnection).mockRejectedValue(new Error('Redis connection failed'))
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          // Should still return 200 if non-critical service fails
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.status).toBe('degraded')
          expect(data.services.cache.status).toBe('unhealthy')
          expect(data.services.database.status).toBe('healthy')
        }
      })
    })
  })

  describe('GET /api/health/live', () => {
    it('should return 200 for liveness check', async () => {
      await testApiHandler({
        handler: liveHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data).toEqual({
            status: 'ok',
            timestamp: expect.any(String)
          })
        }
      })
    })

    it('should be fast and lightweight', async () => {
      const start = Date.now()
      
      await testApiHandler({
        handler: liveHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          const end = Date.now()
          
          expect(response.status).toBe(200)
          expect(end - start).toBeLessThan(50) // Should respond in < 50ms
        }
      })
    })
  })

  describe('GET /api/health/ready', () => {
    it('should return ready when all dependencies are available', async () => {
      await testApiHandler({
        handler: readyHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data).toMatchObject({
            status: 'ready',
            checks: {
              database: 'ready',
              cache: 'ready',
              queue: 'ready'
            }
          })
        }
      })
      
      expect(checkDatabaseConnection).toHaveBeenCalled()
      expect(checkCacheConnection).toHaveBeenCalled()
      expect(checkQueueConnection).toHaveBeenCalled()
    })

    it('should return 503 when critical dependencies are not ready', async () => {
      vi.mocked(checkDatabaseConnection).mockRejectedValue(new Error('Not ready'))
      
      await testApiHandler({
        handler: readyHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(503)
          const data = await response.json()
          expect(data.status).toBe('not_ready')
          expect(data.checks.database).toBe('not_ready')
        }
      })
    })

    it('should allow non-critical services to be unavailable', async () => {
      vi.mocked(checkCacheConnection).mockRejectedValue(new Error('Cache not ready'))
      
      await testApiHandler({
        handler: readyHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          // Cache is non-critical, so app is still ready
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.status).toBe('ready')
          expect(data.checks.cache).toBe('degraded')
        }
      })
    })
  })

  describe('Health Check Performance', () => {
    it('should timeout slow health checks', async () => {
      vi.mocked(checkDatabaseConnection).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 6000))
      )
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(503)
          const data = await response.json()
          expect(data.services.database.status).toBe('unhealthy')
          expect(data.services.database.error).toContain('timeout')
        }
      })
    })

    it('should cache health check results', async () => {
      // First request
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response1 = await fetch({ method: 'GET' })
          expect(response1.status).toBe(200)
        }
      })
      
      // Second request within cache window
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response2 = await fetch({ method: 'GET' })
          expect(response2.status).toBe(200)
          expect(response2.headers.get('x-cache')).toBe('hit')
        }
      })
      
      // Health checks should only be called once due to caching
      expect(checkDatabaseConnection).toHaveBeenCalledTimes(1)
    })
  })

  describe('Health Check Monitoring', () => {
    it('should track health check metrics', async () => {
      const metricsSpy = vi.spyOn(metrics, 'increment')
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          await fetch({ method: 'GET' })
        }
      })
      
      expect(metricsSpy).toHaveBeenCalledWith('health_check.requests', {
        endpoint: 'main',
        status: 'healthy'
      })
    })

    it('should alert on critical service failures', async () => {
      const alertSpy = vi.spyOn(alerting, 'critical')
      vi.mocked(checkDatabaseConnection).mockRejectedValue(new Error('Database down'))
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          await fetch({ method: 'GET' })
        }
      })
      
      expect(alertSpy).toHaveBeenCalledWith('Health check failed', {
        service: 'database',
        error: 'Database down'
      })
    })
  })

  describe('Custom Health Checks', () => {
    it('should support custom health check functions', async () => {
      const customCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
        customMetric: 42
      })
      
      await testApiHandler({
        handler: healthHandler.GET,
        url: '/api/health?include=custom',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET',
            headers: {
              'x-custom-check': 'true'
            }
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.services.custom).toMatchObject({
            status: 'healthy',
            customMetric: 42
          })
        }
      })
    })

    it('should validate health check response format', async () => {
      vi.mocked(checkDatabaseConnection).mockResolvedValue({
        // Invalid response - missing status
        responseTime: 10
      } as any)
      
      await testApiHandler({
        handler: healthHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(503)
          const data = await response.json()
          expect(data.services.database.error).toContain('Invalid health check response')
        }
      })
    })
  })
})