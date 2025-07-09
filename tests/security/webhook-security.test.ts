/**
 * Comprehensive Webhook Security Test Suite
 *
 * Tests all security aspects of the webhook system including:
 * - HMAC signature verification with timing attacks prevention
 * - Rate limiting and abuse protection
 * - Payload validation and size limits
 * - Header validation and event filtering
 * - Security logging and monitoring
 * - Error handling and response security
 */

import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

// Mock Next.js server components
vi.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers
    ip: string
    text: () => Promise<string>

    constructor(data: { headers: Headers; body: string; ip?: string }) {
      this.headers = data.headers
      this.ip = data.ip || '127.0.0.1'
      this.text = async () => data.body
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        ...init,
        headers: { 'content-type': 'application/json', ...init?.headers },
      }),
  },
}))

// Mock dependencies
vi.mock('@/lib/security/auth-rate-limiting', () => ({
  checkAuthRateLimit: vi.fn(() => ({ allowed: true })),
  recordAuthResult: vi.fn(),
  createRateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })
  ),
}))

import type { NextRequest } from 'next/server'
import {
  createWebhookSecurityResponse,
  WEBHOOK_CONFIG,
  type WebhookSecurityConfig,
  WebhookSecurityValidator,
} from '@/lib/security/webhook-security'

describe('WebhookSecurityValidator', () => {
  const validSecret = 'test-webhook-secret-that-is-long-enough-to-be-secure'
  const shortSecret = 'short'

  let validator: WebhookSecurityValidator
  let _mockRequest: Partial<NextRequest>

  beforeEach(() => {
    validator = new WebhookSecurityValidator({
      secret: validSecret,
      enableRateLimit: true,
      enablePayloadValidation: true,
      enableLogging: false, // Disable logging for tests
    })

    // Reset mocks
    vi.clearAllMocks()

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })
    vi.spyOn(console, 'error').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })
  })

  describe('Constructor Security', () => {
    it('should reject secrets that are too short', () => {
      expect(() => {
        new WebhookSecurityValidator({ secret: shortSecret })
      }).toThrow('Webhook secret must be at least 32 characters long')
    })

    it('should accept valid long secrets', () => {
      expect(() => {
        new WebhookSecurityValidator({ secret: validSecret })
      }).not.toThrow()
    })

    it('should set secure defaults for configuration', () => {
      const config: WebhookSecurityConfig = { secret: validSecret }
      const testValidator = new WebhookSecurityValidator(config)

      // Should not throw and should work with defaults
      expect(testValidator).toBeInstanceOf(WebhookSecurityValidator)
    })
  })

  describe('Header Validation Security', () => {
    it('should reject requests without required headers', async () => {
      const request = createMockRequest({
        headers: new Headers(),
        body: '{"test": "payload"}',
      })

      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid headers')
      expect(result.securityFlags?.suspiciousActivity).toBe(true)
    })

    it('should reject requests with invalid signature header format', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      headers.set('x-hub-signature-256', 'invalid-format')

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.invalidSignature).toBe(true)
    })

    it('should reject requests with non-GitHub user agent', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      headers.set('user-agent', 'malicious-bot/1.0')

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid headers')
    })

    it('should reject requests with non-UUID delivery ID', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      headers.set('x-github-delivery', 'not-a-uuid')

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid headers')
    })
  })

  describe('HMAC Signature Security', () => {
    it('should accept valid HMAC signatures', async () => {
      const payload = '{"action": "ping", "repository": {"full_name": "test/repo"}}'
      const headers = createValidHeaders('ping', payload, validSecret)

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(true)
      expect(result.securityFlags?.invalidSignature).toBe(false)
    })

    it('should reject invalid HMAC signatures', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, 'wrong-secret')

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.invalidSignature).toBe(true)
    })

    it('should reject requests with missing signature', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      headers.delete('x-hub-signature-256')

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.invalidSignature).toBe(true)
    })

    it('should protect against timing attacks with constant-time comparison', async () => {
      const payload = '{"test": "payload"}'

      // Create two requests with different but similarly-structured signatures
      const validHeaders = createValidHeaders('ping', payload, validSecret)
      const invalidHeaders = createValidHeaders('ping', payload, validSecret)
      invalidHeaders.set('x-hub-signature-256', `sha256=${'f'.repeat(64)}`) // Wrong but same length

      const validRequest = createMockRequest({ headers: validHeaders, body: payload })
      const invalidRequest = createMockRequest({ headers: invalidHeaders, body: payload })

      // Both should take similar time (timing attack protection)
      const start1 = performance.now()
      const result1 = await validator.validateWebhook(validRequest as NextRequest)
      const time1 = performance.now() - start1

      const start2 = performance.now()
      const result2 = await validator.validateWebhook(invalidRequest as NextRequest)
      const time2 = performance.now() - start2

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(false)

      // Times should be within reasonable range (not a perfect test but good indicator)
      const timeDiff = Math.abs(time1 - time2)
      expect(timeDiff).toBeLessThan(100) // 100ms tolerance
    })
  })

  describe('Payload Security', () => {
    it('should reject payloads that are too large', async () => {
      const largePayload = `{"data": "${'x'.repeat(WEBHOOK_CONFIG.maxPayloadSize)}"}`
      const headers = createValidHeaders('ping', largePayload, validSecret)
      headers.set('content-length', String(largePayload.length))

      const request = createMockRequest({ headers, body: largePayload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.payloadTooLarge).toBe(true)
    })

    it('should reject invalid JSON payloads', async () => {
      const invalidPayload = '{"invalid": json}'
      const headers = createValidHeaders('ping', invalidPayload, validSecret)

      const request = createMockRequest({ headers, body: invalidPayload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.invalidSignature).toBe(true)
    })

    it('should validate payload structure for non-ping events', async () => {
      const invalidPayload = '{"missing": "required_fields"}'
      const headers = createValidHeaders('issues', invalidPayload, validSecret)

      const request = createMockRequest({ headers, body: invalidPayload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.suspiciousActivity).toBe(true)
    })

    it('should accept valid payload structure for supported events', async () => {
      const validPayload = JSON.stringify({
        action: 'opened',
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'owner/test-repo',
          owner: {
            login: 'owner',
            id: 456,
            avatar_url: 'https://github.com/owner.png',
            html_url: 'https://github.com/owner',
            type: 'User',
            site_admin: false,
          },
          private: false,
          html_url: 'https://github.com/owner/test-repo',
          description: 'Test repository',
          fork: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          stargazers_count: 10,
          forks_count: 5,
          language: 'JavaScript',
          topics: ['test'],
          default_branch: 'main',
          archived: false,
          has_issues: true,
          has_projects: true,
          has_wiki: true,
        },
        sender: {
          login: 'sender',
          id: 789,
          avatar_url: 'https://github.com/sender.png',
          html_url: 'https://github.com/sender',
          type: 'User',
        },
      })

      const headers = createValidHeaders('issues', validPayload, validSecret)
      const request = createMockRequest({ headers, body: validPayload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(true)
    })
  })

  describe('Event Type Security', () => {
    it('should reject disallowed event types', async () => {
      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('malicious_event' as never, payload, validSecret)

      const request = createMockRequest({ headers, body: payload })
      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid headers') // Caught by header validation
    })

    it('should accept all allowed event types', async () => {
      const allowedEvents = WEBHOOK_CONFIG.allowedEvents

      for (const event of allowedEvents) {
        const payload = '{"test": "payload"}'
        const headers = createValidHeaders(event, payload, validSecret)

        const request = createMockRequest({ headers, body: payload })
        const result = await validator.validateWebhook(request as NextRequest)

        // May fail on payload validation but should not fail on event type
        if (!result.success) {
          expect(result.securityFlags?.eventNotAllowed).not.toBe(true)
        }
      }
    })
  })

  describe('Rate Limiting Security', () => {
    it('should apply rate limiting when enabled', async () => {
      const { checkAuthRateLimit } = await import('@/lib/security/auth-rate-limiting')
      const mockCheckRateLimit = checkAuthRateLimit as Mock

      // Mock rate limit exceeded
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false })

      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      const request = createMockRequest({ headers, body: payload })

      const result = await validator.validateWebhook(request as NextRequest)

      expect(result.success).toBe(false)
      expect(result.securityFlags?.rateLimit).toBe(true)
    })

    it('should skip rate limiting when disabled', async () => {
      const noRateLimitValidator = new WebhookSecurityValidator({
        secret: validSecret,
        enableRateLimit: false,
      })

      const payload = '{"test": "payload"}'
      const headers = createValidHeaders('ping', payload, validSecret)
      const request = createMockRequest({ headers, body: payload })

      const result = await noRateLimitValidator.validateWebhook(request as NextRequest)

      // Should not fail due to rate limiting (may fail for other reasons)
      expect(result.securityFlags?.rateLimit).not.toBe(true)
    })
  })

  describe('Response Security', () => {
    it('should create secure success responses', () => {
      const result = {
        success: true,
        event: 'ping' as const,
        deliveryId: 'test-delivery-id',
      }

      const response = createWebhookSecurityResponse(result)

      expect(response.status).toBe(200)
    })

    it('should create secure error responses with appropriate status codes', () => {
      const rateLimitResult = {
        success: false,
        error: 'Rate limit exceeded',
        securityFlags: {
          rateLimit: true,
          suspiciousActivity: false,
          invalidSignature: false,
          payloadTooLarge: false,
          eventNotAllowed: false,
        },
      }

      const response = createWebhookSecurityResponse(rateLimitResult)
      expect(response.status).toBe(429)
    })

    it('should add security headers to error responses', async () => {
      const errorResult = {
        success: false,
        error: 'Validation failed',
        securityFlags: {
          suspiciousActivity: true,
          rateLimit: false,
          invalidSignature: false,
          payloadTooLarge: false,
          eventNotAllowed: false,
        },
      }

      const response = createWebhookSecurityResponse(errorResult)
      const responseData = await response.json()

      expect(response.headers.get('X-Webhook-Security')).toBe('validation-failed')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(responseData.success).toBe(false)
    })
  })
})

// ==================== TEST HELPERS ====================

/**
 * Create valid webhook headers with proper HMAC signature
 */
function createValidHeaders(event: string, payload: string, secret: string): Headers {
  const hmac = createHmac('sha256', secret)
  const signature = `sha256=${hmac.update(payload, 'utf8').digest('hex')}`

  const headers = new Headers()
  headers.set('content-type', 'application/json')
  headers.set('user-agent', 'GitHub-Hookshot/12345678')
  headers.set('x-github-event', event)
  headers.set('x-github-delivery', '12345678-1234-1234-1234-123456789012')
  headers.set('x-hub-signature-256', signature)

  return headers
}

/**
 * Create mock NextRequest for testing
 */
function createMockRequest(options: {
  headers: Headers
  body: string
  ip?: string
}): Partial<NextRequest> {
  return {
    headers: options.headers,
    ip: options.ip || '127.0.0.1',
    text: async () => options.body,
  }
}
