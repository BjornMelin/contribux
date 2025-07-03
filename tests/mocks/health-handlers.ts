/**
 * MSW Health and Performance Monitoring Handlers
 * Comprehensive mocking for health check and performance endpoints
 */

import { http, HttpResponse } from 'msw'

// Base URLs
const BASE_URL = 'http://localhost:3000'

// Mock health and performance data
export const mockHealthData = {
  healthyResponse: {
    status: 'healthy',
    timestamp: '2024-07-01T12:00:00.000Z',
    version: '1.0.0',
    environment: 'test',
    uptime: 3600, // 1 hour in seconds
    services: {
      database: {
        status: 'healthy',
        responseTime: 5,
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
      redis: {
        status: 'healthy',
        responseTime: 2,
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
      github: {
        status: 'healthy',
        responseTime: 120,
        rateLimit: {
          remaining: 4500,
          limit: 5000,
          resetAt: '2024-07-01T13:00:00.000Z',
        },
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
    },
    metrics: {
      requestsPerMinute: 45,
      averageResponseTime: 125,
      errorRate: 0.02,
      activeConnections: 12,
    },
  },

  degradedResponse: {
    status: 'degraded',
    timestamp: '2024-07-01T12:00:00.000Z',
    version: '1.0.0',
    environment: 'test',
    uptime: 3600,
    services: {
      database: {
        status: 'healthy',
        responseTime: 15, // Slower than usual
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
      redis: {
        status: 'degraded',
        responseTime: 25, // Much slower
        lastCheck: '2024-07-01T12:00:00.000Z',
        error: 'High latency detected',
      },
      github: {
        status: 'healthy',
        responseTime: 180,
        rateLimit: {
          remaining: 100, // Low rate limit
          limit: 5000,
          resetAt: '2024-07-01T13:00:00.000Z',
        },
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
    },
    metrics: {
      requestsPerMinute: 78,
      averageResponseTime: 450,
      errorRate: 0.08,
      activeConnections: 28,
    },
    warnings: ['Redis response time above threshold', 'GitHub rate limit running low'],
  },

  unhealthyResponse: {
    status: 'unhealthy',
    timestamp: '2024-07-01T12:00:00.000Z',
    version: '1.0.0',
    environment: 'test',
    uptime: 3600,
    services: {
      database: {
        status: 'unhealthy',
        responseTime: null,
        lastCheck: '2024-07-01T12:00:00.000Z',
        error: 'Connection timeout',
      },
      redis: {
        status: 'unhealthy',
        responseTime: null,
        lastCheck: '2024-07-01T12:00:00.000Z',
        error: 'Connection refused',
      },
      github: {
        status: 'healthy',
        responseTime: 95,
        rateLimit: {
          remaining: 4200,
          limit: 5000,
          resetAt: '2024-07-01T13:00:00.000Z',
        },
        lastCheck: '2024-07-01T12:00:00.000Z',
      },
    },
    metrics: {
      requestsPerMinute: 12,
      averageResponseTime: 2500,
      errorRate: 0.45,
      activeConnections: 3,
    },
    errors: ['Database connection failed', 'Redis cache unavailable', 'High error rate detected'],
  },

  performanceMetrics: {
    timestamp: '2024-07-01T12:00:00.000Z',
    server: {
      cpuUsage: 35.2,
      memoryUsage: 68.7,
      diskUsage: 45.1,
      networkIn: 1250000, // bytes per second
      networkOut: 890000,
    },
    application: {
      activeRequests: 8,
      queuedRequests: 2,
      averageResponseTime: 145,
      p95ResponseTime: 380,
      p99ResponseTime: 1200,
      requestsPerSecond: 12.5,
      errorsPerSecond: 0.1,
    },
    database: {
      activeConnections: 15,
      maxConnections: 100,
      queryTime: {
        average: 25,
        p95: 85,
        p99: 250,
      },
      cacheHitRate: 0.87,
      slowQueries: 2,
    },
    memory: {
      heapUsed: 145920000, // bytes
      heapTotal: 268435456,
      external: 2048576,
      rss: 189235200,
    },
    eventLoop: {
      lag: 2.5, // milliseconds
      utilization: 0.12,
    },
  },

  simpleHealthCheck: {
    status: 'ok',
    timestamp: '2024-07-01T12:00:00.000Z',
    uptime: 3600,
  },
}

// Helper to simulate load on the system
const simulateSystemLoad = (loadLevel: 'low' | 'medium' | 'high' = 'low') => {
  const baseMetrics = mockHealthData.performanceMetrics

  const multipliers = {
    low: { cpu: 1, memory: 1, response: 1, requests: 1 },
    medium: { cpu: 2, memory: 1.5, response: 2.5, requests: 3 },
    high: { cpu: 4, memory: 2.5, response: 8, requests: 0.3 },
  }

  const mult = multipliers[loadLevel]

  return {
    ...baseMetrics,
    server: {
      ...baseMetrics.server,
      cpuUsage: Math.min(baseMetrics.server.cpuUsage * mult.cpu, 100),
      memoryUsage: Math.min(baseMetrics.server.memoryUsage * mult.memory, 100),
    },
    application: {
      ...baseMetrics.application,
      averageResponseTime: baseMetrics.application.averageResponseTime * mult.response,
      requestsPerSecond: baseMetrics.application.requestsPerSecond * mult.requests,
      activeRequests: Math.floor(baseMetrics.application.activeRequests * mult.requests),
    },
  }
}

// Basic health check handlers
export const basicHealthHandlers = [
  // GET /api/health - Comprehensive health check
  http.get(`${BASE_URL}/api/health`, ({ request }) => {
    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')
    const includeMetrics = url.searchParams.get('include-metrics') === 'true'

    let response = mockHealthData.healthyResponse
    let status = 200

    switch (scenario) {
      case 'degraded':
        response = mockHealthData.degradedResponse
        status = 200 // Still returns 200 but with degraded status
        break

      case 'unhealthy':
        response = mockHealthData.unhealthyResponse
        status = 503
        break

      case 'timeout':
        return new Promise(() => {
          // Never resolve to simulate timeout
        })

      case 'slow':
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(HttpResponse.json(response, { status }))
          }, 5000)
        })

      case 'error':
        return HttpResponse.json(
          {
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            message: 'Unable to perform health check',
          },
          { status: 500 }
        )
    }

    // Add performance metrics if requested
    if (includeMetrics) {
      response = {
        ...response,
        performance: simulateSystemLoad(scenario as 'low' | 'medium' | 'high'),
      }
    }

    return HttpResponse.json(response, {
      status,
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'X-Health-Check': 'true',
      },
    })
  }),

  // GET /api/simple-health - Simple health check
  http.get(`${BASE_URL}/api/simple-health`, ({ request }) => {
    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    switch (scenario) {
      case 'down':
        return HttpResponse.json(
          {
            status: 'down',
            timestamp: new Date().toISOString(),
          },
          { status: 503 }
        )

      case 'error':
        return HttpResponse.error()

      case 'slow':
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(HttpResponse.json(mockHealthData.simpleHealthCheck))
          }, 3000)
        })

      default:
        return HttpResponse.json(mockHealthData.simpleHealthCheck)
    }
  }),
]

// Performance monitoring handlers
export const performanceHandlers = [
  // GET /api/performance - Performance metrics endpoint
  http.get(`${BASE_URL}/api/performance`, ({ request }) => {
    const url = new URL(request.url)
    const loadLevel = (url.searchParams.get('load') || 'low') as 'low' | 'medium' | 'high'
    const includeHistory = url.searchParams.get('include-history') === 'true'
    const scenario = url.searchParams.get('scenario')

    if (scenario === 'error') {
      return HttpResponse.json(
        {
          error: 'Performance metrics unavailable',
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    if (scenario === 'unauthorized') {
      return HttpResponse.json(
        {
          error: 'Unauthorized access to performance metrics',
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      )
    }

    let response = {
      success: true,
      data: simulateSystemLoad(loadLevel),
    }

    // Add historical data if requested
    if (includeHistory) {
      response = {
        ...response,
        history: {
          last24Hours: Array.from({ length: 24 }, (_, i) => ({
            timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
            ...simulateSystemLoad(Math.random() > 0.7 ? 'medium' : 'low'),
          })),
        },
      }
    }

    return HttpResponse.json(response, {
      headers: {
        'Cache-Control': 'max-age=30', // Cache for 30 seconds
        'X-Performance-Level': loadLevel,
      },
    })
  }),

  // POST /api/performance/benchmark - Performance benchmark test
  http.post(`${BASE_URL}/api/performance/benchmark`, async ({ request }) => {
    try {
      const body = (await request.json()) as {
        test: string
        duration?: number
        concurrency?: number
      }

      const testType = body.test || 'basic'
      const duration = body.duration || 10000 // 10 seconds default
      const concurrency = body.concurrency || 10

      // Simulate running benchmark
      await new Promise(resolve => setTimeout(resolve, Math.min(duration / 10, 1000)))

      const results = {
        testType,
        duration,
        concurrency,
        results: {
          totalRequests: concurrency * Math.floor(duration / 100),
          requestsPerSecond: concurrency * 10,
          averageLatency: 45 + Math.random() * 20,
          p95Latency: 120 + Math.random() * 50,
          p99Latency: 250 + Math.random() * 100,
          errorRate: Math.random() * 0.05,
          throughput: 1024 * 50 + Math.random() * 1024 * 200, // bytes/sec
        },
        systemImpact: {
          peakCpuUsage: 30 + Math.random() * 40,
          peakMemoryUsage: 60 + Math.random() * 30,
          networkUtilization: Math.random() * 50,
        },
        timestamp: new Date().toISOString(),
      }

      return HttpResponse.json({
        success: true,
        data: results,
      })
    } catch {
      return HttpResponse.json(
        {
          success: false,
          error: 'Invalid benchmark configuration',
        },
        { status: 400 }
      )
    }
  }),
]

// Database health handlers
export const databaseHealthHandlers = [
  // GET /api/health/database - Detailed database health
  http.get(`${BASE_URL}/api/health/database`, ({ request }) => {
    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    const healthyDbResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        responseTime: 8,
        activeConnections: 15,
        maxConnections: 100,
        version: 'PostgreSQL 16.0',
        size: '2.4 GB',
      },
      queries: {
        totalQueries: 15420,
        averageQueryTime: 12.5,
        slowQueries: 3,
        failedQueries: 1,
      },
      cache: {
        hitRate: 0.89,
        missRate: 0.11,
        evictions: 45,
      },
      replication: {
        status: 'active',
        lag: '50ms',
        lastSync: new Date().toISOString(),
      },
    }

    switch (scenario) {
      case 'slow':
        return HttpResponse.json({
          ...healthyDbResponse,
          status: 'degraded',
          database: {
            ...healthyDbResponse.database,
            responseTime: 150,
          },
          queries: {
            ...healthyDbResponse.queries,
            averageQueryTime: 250,
            slowQueries: 25,
          },
        })

      case 'connection-issues':
        return HttpResponse.json({
          ...healthyDbResponse,
          status: 'degraded',
          database: {
            ...healthyDbResponse.database,
            activeConnections: 95, // Near max
            responseTime: 50,
          },
          warnings: ['Connection pool near capacity'],
        })

      case 'disconnected':
        return HttpResponse.json(
          {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: {
              connected: false,
              error: 'Connection timeout',
              lastSeen: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
            },
          },
          { status: 503 }
        )

      default:
        return HttpResponse.json(healthyDbResponse)
    }
  }),
]

// Application monitoring handlers
export const applicationMonitoringHandlers = [
  // GET /api/health/application - Application-specific health
  http.get(`${BASE_URL}/api/health/application`, ({ request }) => {
    const url = new URL(request.url)
    const includeFeatures = url.searchParams.get('include-features') === 'true'

    const appHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: 'test',
      features: {
        authentication: 'enabled',
        search: 'enabled',
        webauthn: 'enabled',
        rateLimiting: 'enabled',
        monitoring: 'enabled',
      },
      performance: {
        startupTime: 2500, // milliseconds
        memoryUsage: 145.6, // MB
        activeHandlers: 12,
        backgroundJobs: 3,
      },
      dependencies: {
        nextjs: '15.0.0',
        postgresql: '16.0',
        redis: '7.0',
      },
    }

    if (!includeFeatures) {
      appHealth.features = undefined
    }

    return HttpResponse.json(appHealth)
  }),

  // GET /api/health/dependencies - External dependencies health
  http.get(`${BASE_URL}/api/health/dependencies`, () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      dependencies: {
        github: {
          status: 'healthy',
          responseTime: 95,
          rateLimit: {
            remaining: 4200,
            limit: 5000,
            resetAt: new Date(Date.now() + 3600000).toISOString(),
          },
          lastCheck: new Date().toISOString(),
        },
        openai: {
          status: 'healthy',
          responseTime: 1200,
          lastCheck: new Date().toISOString(),
        },
        vercel: {
          status: 'healthy',
          region: 'us-east-1',
          lastCheck: new Date().toISOString(),
        },
      },
    })
  }),
]

// Combine all health handlers
export const healthHandlers = [
  ...basicHealthHandlers,
  ...performanceHandlers,
  ...databaseHealthHandlers,
  ...applicationMonitoringHandlers,
]

// Export individual handler groups for targeted testing
export default healthHandlers
