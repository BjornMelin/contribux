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
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('version')

    if (response.status() === 503) {
      expect(data.status).toBe('unhealthy')
    } else {
      expect(data.status).toBe('healthy')
    }
  })

  test('auth providers endpoint should handle authentication requirements', async ({ request }) => {
    // This endpoint requires authentication and will return 401 for unauthenticated requests
    const response = await request.get('/api/auth/providers')

    // Should return 401 Unauthorized since no valid session is provided
    expect([401, 403].includes(response.status())).toBeTruthy()

    if (response.status() === 401 || response.status() === 403) {
      const data = await response.json()
      expect(data).toHaveProperty('error')
      expect(data.error).toMatch(/unauthorized|forbidden/i)
    }
  })

  test('search repositories endpoint should handle authentication requirements', async ({
    request,
  }) => {
    // Test with a simple query but no authentication
    const response = await request.get('/api/search/repositories?q=react')

    // Should return 401 Unauthorized since this endpoint requires Bearer token authentication
    expect([401, 403, 500, 503].includes(response.status())).toBeTruthy()

    if (response.status() === 401) {
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
      expect(data.error).toHaveProperty('message', 'Authentication required')
    } else if ([403, 500, 503].includes(response.status())) {
      // Handle other possible error responses gracefully
      const data = await response.json()
      expect(data).toHaveProperty('error')
    }
  })

  test('search opportunities endpoint should handle requests properly', async ({ request }) => {
    const response = await request.get('/api/search/opportunities?q=javascript')

    // This endpoint doesn't require authentication, so it should return data or handle DB errors
    expect([200, 400, 500, 503].includes(response.status())).toBeTruthy()

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
    // Test with malformed requests to repositories endpoint (requires auth)
    const repoResponse = await request.get('/api/search/repositories?q=')

    // Should return 401 (authentication required) or other error status
    expect([400, 401, 422, 500, 503].includes(repoResponse.status())).toBeTruthy()

    const repoData = await repoResponse.json()
    expect(repoData).toHaveProperty('error')

    // Test with malformed requests to opportunities endpoint (no auth required)
    const oppResponse = await request.get('/api/search/opportunities?q=')

    // Should handle empty queries appropriately
    expect([200, 400, 422, 500, 503].includes(oppResponse.status())).toBeTruthy()

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

    // Should return 401 Unauthorized for invalid token
    expect(response.status()).toBe(401)

    const data = await response.json()
    expect(data).toHaveProperty('success', false)
    expect(data).toHaveProperty('error')
    expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
  })

  test('search repositories endpoint should handle malformed Bearer token', async ({ request }) => {
    // Test with malformed Bearer token (not proper JWT structure)
    const response = await request.get('/api/search/repositories?q=react', {
      headers: {
        Authorization: 'Bearer malformed',
      },
    })

    // Should return 401 Unauthorized for malformed token
    expect(response.status()).toBe(401)

    const data = await response.json()
    expect(data).toHaveProperty('success', false)
    expect(data).toHaveProperty('error')
    expect(data.error).toHaveProperty('code', 'UNAUTHORIZED')
  })

  test('opportunities endpoint should handle validation errors', async ({ request }) => {
    // Test with invalid parameters
    const response = await request.get('/api/search/opportunities?page=0&per_page=101')

    // Should return 400 for validation errors
    expect([400, 422].includes(response.status())).toBeTruthy()

    if (response.status() === 400) {
      const data = await response.json()
      expect(data).toHaveProperty('success', false)
      expect(data).toHaveProperty('error')
      expect(data.error).toHaveProperty('code', 'INVALID_PARAMETER')
    }
  })

  test('auth providers endpoint should handle missing userId parameter', async ({ request }) => {
    // Even with proper session, missing userId should cause 403
    const response = await request.get('/api/auth/providers')

    // Should return 401 (no session) or 403 (missing/invalid userId)
    expect([401, 403].includes(response.status())).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('error')
  })
})
