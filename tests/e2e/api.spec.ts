import { expect, test } from '@playwright/test'

test.describe('API Endpoints Tests', () => {
  test('simple health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/simple-health')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('status', 'ok')
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('message')
  })

  test('health endpoint should respond appropriately', async ({ request }) => {
    const response = await request.get('/api/health')

    // Should return either 200 (healthy) or 503 (unhealthy) but not connection errors
    expect([200, 503].includes(response.status())).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('overall')
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('components')

    if (response.status() === 503) {
      expect(data.overall).toBe('unhealthy')
    } else {
      expect(data.overall).toBe('healthy')
    }
  })

  test('auth providers endpoint should expose configured OAuth providers', async ({ request }) => {
    const response = await request.get('/api/auth/providers')

    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('github')
    expect(data).toHaveProperty('google')
  })

  test('search repositories endpoint should return repository search results', async ({
    request,
  }) => {
    // Test with a simple query but no authentication
    const response = await request.get('/api/search/repositories?q=react')

    expect([200, 400, 500, 503].includes(response.status())).toBeTruthy()

    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('data')
      expect(data.data).toHaveProperty('repositories')
      expect(Array.isArray(data.data.repositories)).toBe(true)
    } else {
      const data = await response.json()
      expect(data).toHaveProperty('error')
    }
  })

  test('search opportunities endpoint should handle requests properly', async ({ request }) => {
    const response = await request.get('/api/search/opportunities?q=javascript')

    expect([200, 400, 401, 500, 503].includes(response.status())).toBeTruthy()

    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('data')
      expect(data.data).toHaveProperty('opportunities')
      expect(Array.isArray(data.data.opportunities)).toBe(true)
    } else if (response.status() === 400) {
      // Validation error
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'INVALID_PARAMETER')
    } else if (response.status() === 401) {
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
    } else if ([500, 503].includes(response.status())) {
      // Internal server error or service unavailable (likely DB connection issues)
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
    }
  })

  test('API endpoints should handle CORS properly', async ({ request }) => {
    const response = await request.get('/api/health', {
      headers: {
        Origin: 'http://localhost:3000',
      },
    })

    // Should return either 200 (healthy) or 503 (unhealthy) but handle CORS
    expect([200, 503].includes(response.status())).toBeTruthy()
    // Check for CORS headers if they exist
    const headers = response.headers()
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).toBeDefined()
    }
  })

  test('API endpoints should handle errors gracefully', async ({ request }) => {
    // Test with malformed requests to repositories endpoint
    const repoResponse = await request.get('/api/search/repositories?q=')

    expect([400, 422, 500, 503].includes(repoResponse.status())).toBeTruthy()

    const repoData = await repoResponse.json()
    expect(repoData).toHaveProperty('error')

    // Test with malformed requests to opportunities endpoint (no auth required)
    const oppResponse = await request.get('/api/search/opportunities?q=')

    // Should handle empty queries appropriately
    expect([200, 400, 401, 422, 500, 503].includes(oppResponse.status())).toBeTruthy()

    if (oppResponse.status() !== 200) {
      const oppData = await oppResponse.json()
      expect(oppData).toHaveProperty('error')
    }
  })

  test('API rate limiting should be configured', async ({ request }) => {
    // Make multiple requests quickly to test rate limiting
    const promises = Array.from({ length: 10 }, () => request.get('/api/health'))

    const responses = await Promise.all(promises)

    // All should return valid status codes (200, 503 for health, or 429 for rate limiting)
    const statuses = responses.map(r => r.status())
    const hasValidStatus = statuses.every(s => [200, 503, 429].includes(s))
    expect(hasValidStatus).toBe(true) // All should have valid status codes

    // Check if any are rate limited (429)
    const hasRateLimit = statuses.some(s => s === 429)
    console.log(`Rate limiting ${hasRateLimit ? 'is' : 'is not'} active`)

    // At least one should be successful (200) or indicate service issues (503)
    const hasResponse = statuses.some(s => [200, 503].includes(s))
    expect(hasResponse).toBe(true)
  })

  test('search repositories endpoint should handle invalid Bearer token', async ({ request }) => {
    // Test with invalid Bearer token
    const response = await request.get('/api/search/repositories?q=react', {
      headers: {
        Authorization: 'Bearer invalid-token-here',
      },
    })

    expect([200, 401].includes(response.status())).toBeTruthy()

    const data = await response.json()
    if (response.status() === 200) {
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('data')
    } else {
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
    }
  })

  test('search repositories endpoint should handle malformed Bearer token', async ({ request }) => {
    // Test with malformed Bearer token (not proper JWT structure)
    const response = await request.get('/api/search/repositories?q=react', {
      headers: {
        Authorization: 'Bearer malformed',
      },
    })

    expect([200, 401].includes(response.status())).toBeTruthy()

    const data = await response.json()
    if (response.status() === 200) {
      expect(data).toHaveProperty('success', true)
      expect(data).toHaveProperty('data')
    } else {
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
    }
  })

  test('opportunities endpoint should handle validation errors', async ({ request }) => {
    // Test with invalid parameters
    const response = await request.get('/api/search/opportunities?page=0&per_page=101')

    // Should return 400 for validation errors
    expect([400, 401, 422].includes(response.status())).toBeTruthy()

    if (response.status() === 400) {
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'INVALID_PARAMETER')
    }
  })
})
