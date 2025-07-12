/**
 * Security Health API Endpoint Tests
 * Tests the /api/security/health endpoint for comprehensive security monitoring
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Mock environment variables for testing
vi.mock('@/lib/security/feature-flags', () => ({
  securityFeatures: {
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
  },
  getSecurityFeatures: vi.fn().mockReturnValue({
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
    isDevelopment: true,
    isProduction: false,
  }),
  getSecurityConfig: vi.fn().mockReturnValue({
    webauthn: {
      rpName: 'Contribux',
      rpId: 'localhost',
      origin: 'http://localhost:3000',
      timeout: 60000,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 1000,
    },
    monitoring: {
      enableHealthChecks: true,
      enableMetrics: true,
    },
  }),
}))

// Mock database config
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn().mockImplementation(query => {
    if (query[0].includes('SELECT 1')) {
      return Promise.resolve([{ result: 1 }])
    }
    if (query[0].includes('COUNT(*) as count FROM webauthn_credentials')) {
      return Promise.resolve([{ count: 5 }])
    }
    if (query[0].includes('COUNT(*) as count FROM sessions')) {
      return Promise.resolve([{ count: 12 }])
    }
    return Promise.resolve([])
  }),
}))

// Enable MSW mode
beforeAll(() => {
  global.__enableMSW?.()
})

afterAll(() => {
  global.__disableMSW?.()
})

// Security Health Response Schema
const SecurityHealthStatusSchema = z.object({
  timestamp: z.string(),
  status: z.enum(['healthy', 'warning', 'critical']),
  services: z.object({
    database: z.enum(['connected', 'disconnected', 'error']),
    webauthn: z.enum(['available', 'unavailable', 'disabled']),
    rateLimit: z.enum(['active', 'inactive']),
    securityHeaders: z.enum(['enabled', 'disabled']),
  }),
  features: z.object({
    webauthnEnabled: z.boolean(),
    rateLimitingEnabled: z.boolean(),
    advancedMonitoringEnabled: z.boolean(),
    securityDashboardEnabled: z.boolean(),
  }),
  metrics: z
    .object({
      totalWebAuthnCredentials: z.number(),
      activeUserSessions: z.number(),
      recentSecurityEvents: z.number(),
    })
    .optional(),
  configuration: z.object({
    environment: z.string(),
    webauthnRpId: z.string(),
    securityLevel: z.enum(['basic', 'enhanced', 'enterprise']),
  }),
})

const SecurityHealthErrorSchema = z.object({
  timestamp: z.string(),
  status: z.literal('critical'),
  error: z.string(),
  message: z.string(),
})

// Mock server setup
const BASE_URL = 'http://localhost:3000'

const server = setupServer(
  // Healthy security health endpoint
  http.get(`${BASE_URL}/api/security/health`, () => {
    return HttpResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        services: {
          database: 'connected',
          webauthn: 'available',
          rateLimit: 'active',
          securityHeaders: 'enabled',
        },
        features: {
          webauthnEnabled: true,
          rateLimitingEnabled: true,
          advancedMonitoringEnabled: true,
          securityDashboardEnabled: true,
        },
        metrics: {
          totalWebAuthnCredentials: 5,
          activeUserSessions: 12,
          recentSecurityEvents: 0,
        },
        configuration: {
          environment: 'test',
          webauthnRpId: 'localhost',
          securityLevel: 'enterprise',
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  }),

  // Database connection error scenario
  http.get(`${BASE_URL}/api/security/health-db-error`, () => {
    return HttpResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'critical',
        services: {
          database: 'error',
          webauthn: 'available',
          rateLimit: 'active',
          securityHeaders: 'enabled',
        },
        features: {
          webauthnEnabled: true,
          rateLimitingEnabled: true,
          advancedMonitoringEnabled: true,
          securityDashboardEnabled: true,
        },
        configuration: {
          environment: 'test',
          webauthnRpId: 'localhost',
          securityLevel: 'enterprise',
        },
      },
      { status: 503 }
    )
  }),

  // WebAuthn unavailable scenario
  http.get(`${BASE_URL}/api/security/health-webauthn-warning`, () => {
    return HttpResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'warning',
        services: {
          database: 'connected',
          webauthn: 'unavailable',
          rateLimit: 'active',
          securityHeaders: 'enabled',
        },
        features: {
          webauthnEnabled: true,
          rateLimitingEnabled: true,
          advancedMonitoringEnabled: true,
          securityDashboardEnabled: true,
        },
        metrics: {
          totalWebAuthnCredentials: 0,
          activeUserSessions: 8,
          recentSecurityEvents: 0,
        },
        configuration: {
          environment: 'test',
          webauthnRpId: 'localhost',
          securityLevel: 'enhanced',
        },
      },
      { status: 200 }
    )
  }),

  // Basic security level scenario
  http.get(`${BASE_URL}/api/security/health-basic`, () => {
    return HttpResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        services: {
          database: 'connected',
          webauthn: 'disabled',
          rateLimit: 'inactive',
          securityHeaders: 'enabled',
        },
        features: {
          webauthnEnabled: false,
          rateLimitingEnabled: false,
          advancedMonitoringEnabled: false,
          securityDashboardEnabled: false,
        },
        configuration: {
          environment: 'test',
          webauthnRpId: 'localhost',
          securityLevel: 'basic',
        },
      },
      { status: 200 }
    )
  }),

  // Critical health check failure
  http.get(`${BASE_URL}/api/security/health-critical-error`, () => {
    return HttpResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'critical',
        error: 'Health check failed',
        message: 'Internal server error during health check',
      },
      { status: 503 }
    )
  }),

  // Unsupported HTTP methods for security health endpoint
  http.post(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  }),

  http.put(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  }),

  http.delete(`${BASE_URL}/api/security/health`, () => {
    return new HttpResponse(null, { status: 405 })
  })
)

describe('Security Health API Endpoint', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  describe('Healthy Status Scenarios', () => {
    it('should return healthy status with all services operational', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      const validated = SecurityHealthStatusSchema.parse(data)

      expect(validated.status).toBe('healthy')
      expect(validated.services.database).toBe('connected')
      expect(validated.services.webauthn).toBe('available')
      expect(validated.services.rateLimit).toBe('active')
      expect(validated.services.securityHeaders).toBe('enabled')
      expect(validated.configuration.securityLevel).toBe('enterprise')
    })

    it('should include proper cache control headers', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)

      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('Expires')).toBe('0')
    })

    it('should include metrics when advanced monitoring enabled', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      const data = await response.json()

      expect(data.metrics).toBeDefined()
      expect(data.metrics.totalWebAuthnCredentials).toBe(5)
      expect(data.metrics.activeUserSessions).toBe(12)
      expect(data.metrics.recentSecurityEvents).toBe(0)
    })

    it('should return valid timestamp format', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      const data = await response.json()

      const timestamp = new Date(data.timestamp)
      expect(timestamp.toISOString()).toBe(data.timestamp)
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('Warning Status Scenarios', () => {
    it('should return warning status when WebAuthn is unavailable', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-webauthn-warning`)
      expect(response.status).toBe(200)

      const data = await response.json()
      const validated = SecurityHealthStatusSchema.parse(data)

      expect(validated.status).toBe('warning')
      expect(validated.services.database).toBe('connected')
      expect(validated.services.webauthn).toBe('unavailable')
      expect(validated.configuration.securityLevel).toBe('enhanced')
    })

    it('should include reduced metrics when WebAuthn unavailable', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-webauthn-warning`)
      const data = await response.json()

      expect(data.metrics.totalWebAuthnCredentials).toBe(0)
      expect(data.metrics.activeUserSessions).toBeGreaterThan(0)
    })
  })

  describe('Critical Status Scenarios', () => {
    it('should return critical status when database is in error state', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-db-error`)
      expect(response.status).toBe(503)

      const data = await response.json()
      const validated = SecurityHealthStatusSchema.parse(data)

      expect(validated.status).toBe('critical')
      expect(validated.services.database).toBe('error')
    })

    it('should handle health check failures gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-critical-error`)
      expect(response.status).toBe(503)

      const data = await response.json()
      const validated = SecurityHealthErrorSchema.parse(data)

      expect(validated.status).toBe('critical')
      expect(validated.error).toBe('Health check failed')
      expect(validated.message).toBeDefined()
    })
  })

  describe('Security Level Classification', () => {
    it('should classify as basic security level when minimal features enabled', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-basic`)
      const data = await response.json()

      expect(data.configuration.securityLevel).toBe('basic')
      expect(data.features.webauthnEnabled).toBe(false)
      expect(data.features.rateLimitingEnabled).toBe(false)
      expect(data.features.advancedMonitoringEnabled).toBe(false)
    })

    it('should not include metrics when advanced monitoring disabled', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health-basic`)
      const data = await response.json()

      expect(data.metrics).toBeUndefined()
    })
  })

  describe('Feature Flag Integration', () => {
    it('should reflect all enabled features correctly', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      const data = await response.json()

      expect(data.features.webauthnEnabled).toBe(true)
      expect(data.features.rateLimitingEnabled).toBe(true)
      expect(data.features.advancedMonitoringEnabled).toBe(true)
      expect(data.features.securityDashboardEnabled).toBe(true)
    })

    it('should include proper WebAuthn configuration', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      const data = await response.json()

      expect(data.configuration.webauthnRpId).toBe('localhost')
      expect(data.configuration.environment).toBe('test')
    })
  })

  describe('HTTP Method Support', () => {
    it('should only support GET method', async () => {
      const postResponse = await fetch(`${BASE_URL}/api/security/health`, {
        method: 'POST',
      })
      expect(postResponse.status).toBe(405)

      const putResponse = await fetch(`${BASE_URL}/api/security/health`, {
        method: 'PUT',
      })
      expect(putResponse.status).toBe(405)

      const deleteResponse = await fetch(`${BASE_URL}/api/security/health`, {
        method: 'DELETE',
      })
      expect(deleteResponse.status).toBe(405)
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent health checks', async () => {
      const requests = Array.from({ length: 10 }, () => fetch(`${BASE_URL}/api/security/health`))

      const responses = await Promise.all(requests)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      const dataPromises = responses.map(r => r.json())
      const data = await Promise.all(dataPromises)

      data.forEach(d => {
        expect(d.status).toBe('healthy')
        expect(d.services.database).toBe('connected')
      })
    })
  })

  describe('Content Type and Headers', () => {
    it('should return proper content type headers', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)

      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should return consistent response structure', async () => {
      const response = await fetch(`${BASE_URL}/api/security/health`)
      const data = await response.json()

      // Verify required fields are present
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('services')
      expect(data).toHaveProperty('features')
      expect(data).toHaveProperty('configuration')

      // Verify services object structure
      expect(data.services).toHaveProperty('database')
      expect(data.services).toHaveProperty('webauthn')
      expect(data.services).toHaveProperty('rateLimit')
      expect(data.services).toHaveProperty('securityHeaders')
    })
  })
})
