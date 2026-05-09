/**
 * @vitest-environment node
 */

import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { enhancedRateLimitMiddleware } from '@/lib/security/rate-limiter'
import { config, middleware } from '../../src/middleware'

vi.mock('@/lib/auth/jwt', () => ({
  verifyAccessToken: vi.fn(),
}))

vi.mock('@/lib/security/csp', () => ({
  buildCSP: vi.fn(
    (_directives, nonce: string) => `default-src 'self'; script-src 'nonce-${nonce}'`
  ),
  generateNonce: vi.fn(() => 'test-nonce'),
  getCSPDirectives: vi.fn(() => ({})),
}))

vi.mock('@/lib/security/rate-limiter', () => ({
  enhancedRateLimitMiddleware: vi.fn(),
}))

vi.mock('@/lib/validation/env', () => ({
  env: {
    NEXTAUTH_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
  isProduction: vi.fn(() => false),
}))

function createRequest(url: string, init: RequestInit = {}) {
  return new NextRequest(url, init)
}

function allowRequest() {
  vi.mocked(enhancedRateLimitMiddleware).mockResolvedValue(NextResponse.next())
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allowRequest()
    vi.mocked(verifyAccessToken).mockReset()
  })

  it('bypasses static assets and internal Next.js routes', async () => {
    const response = await middleware(createRequest('https://example.com/_next/static/app.js'))

    expect(response.status).toBe(200)
    expect(enhancedRateLimitMiddleware).not.toHaveBeenCalled()
    expect(response.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('short-circuits rate-limited requests', async () => {
    const rateLimited = NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    rateLimited.headers.set('X-RateLimit-Remaining', '0')
    vi.mocked(enhancedRateLimitMiddleware).mockResolvedValue(rateLimited)

    const response = await middleware(createRequest('https://example.com/api/search/repositories'))

    expect(response.status).toBe(429)
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(verifyAccessToken).not.toHaveBeenCalled()
  })

  it('allows public pages and applies security headers', async () => {
    const response = await middleware(createRequest('https://example.com/about'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Security-Policy')).toContain('nonce-test-nonce')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe('test-nonce')
    expect(response.headers.get('x-middleware-request-content-security-policy')).toContain(
      'nonce-test-nonce'
    )
  })

  it('allows public repository search API with CORS headers', async () => {
    const response = await middleware(
      createRequest('https://example.com/api/search/repositories', {
        headers: { origin: 'http://localhost:3000' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })

  it('requires a token for protected routes', async () => {
    const response = await middleware(createRequest('https://example.com/dashboard'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' })
    expect(verifyAccessToken).not.toHaveBeenCalled()
  })

  it('rejects invalid bearer tokens', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null)

    const response = await middleware(
      createRequest('https://example.com/dashboard', {
        headers: { authorization: 'Bearer invalid-token' },
      })
    )

    expect(response.status).toBe(401)
    expect(verifyAccessToken).toHaveBeenCalledWith('invalid-token')
  })

  it('allows valid bearer tokens through protected routes', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: 'user-123' })

    const response = await middleware(
      createRequest('https://example.com/dashboard', {
        headers: { authorization: 'Bearer valid-token' },
      })
    )

    expect(response.status).toBe(200)
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token')
    expect(response.headers.get('Content-Security-Policy')).toContain('nonce-test-nonce')
  })

  it('matches active app and API routes while excluding static assets', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)'])

    const matcher = /^\/((?!_next\/static|_next\/image|favicon\.ico).*)/
    expect(matcher.test('/')).toBe(true)
    expect(matcher.test('/api/search/repositories')).toBe(true)
    expect(matcher.test('/dashboard')).toBe(true)
    expect(matcher.test('/_next/static/app.js')).toBe(false)
    expect(matcher.test('/_next/image')).toBe(false)
    expect(matcher.test('/favicon.ico')).toBe(false)
  })
})
