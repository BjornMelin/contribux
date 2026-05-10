import { expect, test } from '@playwright/test'

const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy']

test.describe('Database and data API resilience contracts', () => {
  test('surfaces database component health through the canonical health endpoint', async ({
    request,
  }) => {
    const response = await request.get('/api/health?component=database')
    expect([200, 503]).toContain(response.status())

    const payload = await response.json()

    if ('component' in payload) {
      expect(payload.component).toBe('database')
      expect(HEALTH_STATUSES).toContain(payload.status)
      expect(typeof payload.healthy).toBe('boolean')
      return
    }

    expect(payload).toHaveProperty('error')
    expect(payload.error).toHaveProperty('code')
  })

  test('returns system health with component-level database visibility', async ({ request }) => {
    const response = await request.get('/api/health')
    expect([200, 503]).toContain(response.status())

    const payload = await response.json()
    expect(HEALTH_STATUSES).toContain(payload.overall)
    expect(Array.isArray(payload.components)).toBe(true)
    expect(payload.components.length).toBeGreaterThan(0)

    for (const component of payload.components) {
      expect(typeof component.component).toBe('string')
      expect(HEALTH_STATUSES).toContain(component.status)
      expect(typeof component.healthy).toBe('boolean')
    }
  })

  test('exposes Prometheus health metrics for monitoring integrations', async ({ request }) => {
    const response = await request.get('/api/health?format=prometheus')
    expect([200, 503]).toContain(response.status())

    const body = await response.text()
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(body).toContain('contribux_component_health')
  })

  test('keeps Redis and rate-limiter health behind the authenticated API boundary', async ({
    request,
  }) => {
    const response = await request.get('/api/health/redis')
    expect([200, 401, 503]).toContain(response.status())

    const payload = await response.json()
    if (response.status() === 401) {
      expect(payload).toHaveProperty('error', 'Authentication required')
      return
    }

    expect(HEALTH_STATUSES).toContain(payload.status)
    expect(typeof payload.upstashConfigured).toBe('boolean')

    if (payload.rateLimiters) {
      expect(payload.rateLimiters).toHaveProperty('auth')
      expect(payload.rateLimiters).toHaveProperty('api')
      expect(payload.rateLimiters).toHaveProperty('search')
    }
  })

  test('keeps repository search available through deterministic demo data', async ({ request }) => {
    const response = await request.get('/api/search/repositories?q=react')
    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(Array.isArray(payload.data.repositories)).toBe(true)
    expect(payload.data.repositories.length).toBeGreaterThan(0)
    expect(payload.data.repositories[0]).toHaveProperty('fullName')
  })

  test('returns structured validation errors for malformed repository search queries', async ({
    request,
  }) => {
    const response = await request.get('/api/search/repositories?q=')
    expect([400, 422]).toContain(response.status())

    const payload = await response.json()
    expect(payload).toHaveProperty('error')
    expect(payload.error).toHaveProperty('code')
    expect(payload.error).toHaveProperty('message')
  })

  test('does not hit opportunity data queries before authentication succeeds', async ({
    request,
  }) => {
    const response = await request.get('/api/search/opportunities?q=react')
    expect(response.status()).toBe(401)

    const payload = await response.json()
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
      },
    })
  })
})
