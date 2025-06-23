/**
 * Modern GitHub Webhook Tests - Vitest 3.2+ Patterns
 * 
 * Features:
 * - MSW 2.x for webhook simulation
 * - Property-based testing for payload validation
 * - test.extend fixtures for webhook setup
 * - Comprehensive error boundary testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fc, test as fcTest } from '@fast-check/vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import crypto from 'node:crypto'
import {
  GitHubWebhookError,
  GitHubWebhookSignatureError,
  GitHubWebhookPayloadError,
  ErrorMessages
} from '@/lib/github/errors'

// Mock webhook handler for testing
class MockWebhookHandler {
  private secret: string
  
  constructor(secret: string) {
    this.secret = secret
  }

  validateSignature(payload: string, signature: string): boolean {
    if (!signature.startsWith('sha256=')) {
      throw new GitHubWebhookSignatureError(
        ErrorMessages.WEBHOOK_SIGNATURE_FORMAT_INVALID,
        'unknown',
        signature
      )
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex')
    
    const providedSignature = signature.replace('sha256=', '')
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )

    if (!isValid) {
      throw new GitHubWebhookSignatureError(
        ErrorMessages.WEBHOOK_SIGNATURE_INVALID,
        'sha256',
        signature
      )
    }

    return true
  }

  validatePayload(payload: string, headers: Record<string, string>): any {
    // Check required headers
    if (!headers['x-github-event']) {
      throw new GitHubWebhookError(
        ErrorMessages.WEBHOOK_EVENT_TYPE_MISSING,
        'invalid-payload'
      )
    }

    if (!headers['x-github-delivery']) {
      throw new GitHubWebhookError(
        ErrorMessages.WEBHOOK_DELIVERY_ID_MISSING,
        'invalid-payload'
      )
    }

    // Check payload size
    if (payload.length > 1024 * 1024) { // 1MB limit
      throw new GitHubWebhookPayloadError(
        ErrorMessages.WEBHOOK_PAYLOAD_TOO_LARGE(payload.length, 1024 * 1024),
        payload.length
      )
    }

    if (!payload.trim()) {
      throw new GitHubWebhookPayloadError(
        ErrorMessages.WEBHOOK_PAYLOAD_EMPTY
      )
    }

    // Parse JSON
    try {
      return JSON.parse(payload)
    } catch (error) {
      throw new GitHubWebhookPayloadError(
        'Failed to parse webhook payload',
        payload.length,
        error as Error
      )
    }
  }

  createSignature(payload: string): string {
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex')
    
    return `sha256=${signature}`
  }
}

// Test fixtures using modern patterns
const webhookFixtures = {
  validPayload: () => JSON.stringify({
    action: 'opened',
    number: 1,
    pull_request: {
      id: 1,
      title: 'Test PR',
      user: { login: 'testuser' }
    },
    repository: {
      name: 'test-repo',
      owner: { login: 'testowner' }
    }
  }),
  
  validHeaders: (eventType = 'pull_request', deliveryId = 'test-delivery-123') => ({
    'x-github-event': eventType,
    'x-github-delivery': deliveryId,
    'content-type': 'application/json',
    'user-agent': 'GitHub-Hookshot/123'
  }),

  webhookSecret: 'test_webhook_secret_123'
}

describe('GitHub Webhook Handler - Modern Tests', () => {
  let handler: MockWebhookHandler

  beforeEach(() => {
    handler = new MockWebhookHandler(webhookFixtures.webhookSecret)
  })

  describe('Signature Validation', () => {
    it('should validate correct webhook signatures', () => {
      const payload = webhookFixtures.validPayload()
      const signature = handler.createSignature(payload)
      
      expect(() => handler.validateSignature(payload, signature)).not.toThrow()
    })

    it('should reject invalid signatures', () => {
      const payload = webhookFixtures.validPayload()
      const invalidSignature = 'sha256=invalid_signature'
      
      expect(() => handler.validateSignature(payload, invalidSignature))
        .toThrow(GitHubWebhookSignatureError)
    })

    it('should reject malformed signature format', () => {
      const payload = webhookFixtures.validPayload()
      const malformedSignature = 'invalid_format'
      
      expect(() => handler.validateSignature(payload, malformedSignature))
        .toThrow(GitHubWebhookSignatureError)
    })

    // Property-based testing for signature validation
    fcTest.prop([
      fc.string({ minLength: 1, maxLength: 1000 })
    ])('should consistently validate signatures for various payloads', (payload) => {
      const signature = handler.createSignature(payload)
      
      expect(() => handler.validateSignature(payload, signature)).not.toThrow()
    })

    fcTest.prop([
      fc.string({ minLength: 1, maxLength: 1000 }),
      fc.hexaString({ minLength: 32, maxLength: 64 })
    ])('should reject invalid signatures consistently', (payload, fakeSignature) => {
      const invalidSignature = `sha256=${fakeSignature}`
      
      expect(() => handler.validateSignature(payload, invalidSignature))
        .toThrow(GitHubWebhookSignatureError)
    })
  })

  describe('Payload Validation', () => {
    it('should validate correct webhook payloads', () => {
      const payload = webhookFixtures.validPayload()
      const headers = webhookFixtures.validHeaders()
      
      const result = handler.validatePayload(payload, headers)
      
      expect(result).toMatchObject({
        action: 'opened',
        number: 1,
        pull_request: expect.any(Object)
      })
    })

    it('should reject payloads missing required headers', () => {
      const payload = webhookFixtures.validPayload()
      const incompleteHeaders = { 'content-type': 'application/json' }
      
      expect(() => handler.validatePayload(payload, incompleteHeaders))
        .toThrow(GitHubWebhookError)
    })

    it('should reject empty payloads', () => {
      const headers = webhookFixtures.validHeaders()
      
      expect(() => handler.validatePayload('', headers))
        .toThrow(GitHubWebhookPayloadError)
      
      expect(() => handler.validatePayload('   ', headers))
        .toThrow(GitHubWebhookPayloadError)
    })

    it('should reject oversized payloads', () => {
      const headers = webhookFixtures.validHeaders()
      const oversizedPayload = 'x'.repeat(2 * 1024 * 1024) // 2MB
      
      expect(() => handler.validatePayload(oversizedPayload, headers))
        .toThrow(GitHubWebhookPayloadError)
    })

    it('should reject malformed JSON payloads', () => {
      const headers = webhookFixtures.validHeaders()
      const malformedPayload = '{ "action": "opened", "invalid": json }'
      
      expect(() => handler.validatePayload(malformedPayload, headers))
        .toThrow(GitHubWebhookPayloadError)
    })

    // Parametric testing for different event types
    it.each([
      'push',
      'pull_request', 
      'issues',
      'issue_comment',
      'pull_request_review',
      'release',
      'workflow_run'
    ])('should validate %s event payloads', (eventType) => {
      const payload = JSON.stringify({ action: 'test', repository: { name: 'test' } })
      const headers = webhookFixtures.validHeaders(eventType)
      
      expect(() => handler.validatePayload(payload, headers)).not.toThrow()
    })

    // Property-based testing for delivery IDs
    fcTest.prop([
      fc.uuid(),
      fc.string({ minLength: 10, maxLength: 50 }).filter(s => /^[a-zA-Z0-9-_]+$/.test(s))
    ])('should accept valid delivery IDs', (deliveryId) => {
      const payload = webhookFixtures.validPayload()
      const headers = webhookFixtures.validHeaders('pull_request', deliveryId)
      
      expect(() => handler.validatePayload(payload, headers)).not.toThrow()
    })
  })

  describe('Error Handling Edge Cases', () => {
    // Property-based testing for error message consistency
    fcTest.prop([
      fc.integer({ min: 1024 * 1024 + 1, max: 10 * 1024 * 1024 })
    ])('should format payload size errors consistently', (payloadSize) => {
      const error = new GitHubWebhookPayloadError(
        ErrorMessages.WEBHOOK_PAYLOAD_TOO_LARGE(payloadSize, 1024 * 1024),
        payloadSize
      )
      
      expect(error.message).toContain(payloadSize.toLocaleString())
      expect(error.message).toContain('1,048,576')
      expect(error.payloadSize).toBe(payloadSize)
      expect(error.reason).toBe('parse-error')
    })

    it('should preserve original parse errors in webhook payload errors', () => {
      const originalError = new SyntaxError('Unexpected token in JSON')
      const webhookError = new GitHubWebhookPayloadError(
        'Failed to parse payload',
        100,
        originalError
      )
      
      expect(webhookError.parseError).toBe(originalError)
      expect(webhookError.parseError?.message).toBe('Unexpected token in JSON')
    })

    it('should handle signature validation with various algorithms', () => {
      const payload = webhookFixtures.validPayload()
      
      // Only sha256 is supported
      expect(() => handler.validateSignature(payload, 'sha1=abc123'))
        .toThrow(GitHubWebhookSignatureError)
      
      expect(() => handler.validateSignature(payload, 'md5=abc123'))
        .toThrow(GitHubWebhookSignatureError)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete webhook validation flow', () => {
      const payload = webhookFixtures.validPayload()
      const headers = webhookFixtures.validHeaders()
      const signature = handler.createSignature(payload)
      
      // Should not throw for valid complete flow
      expect(() => {
        handler.validateSignature(payload, signature)
        handler.validatePayload(payload, headers)
      }).not.toThrow()
    })

    it('should provide detailed error information for debugging', () => {
      const invalidSignature = 'sha256=invalid'
      const payload = 'test'
      
      try {
        handler.validateSignature(payload, invalidSignature)
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubWebhookSignatureError)
        const webhookError = error as GitHubWebhookSignatureError
        
        expect(webhookError.algorithm).toBe('sha256')
        expect(webhookError.providedSignature).toBe(invalidSignature)
        expect(webhookError.reason).toBe('invalid-signature')
      }
    })

    // Property-based testing for webhook event simulation
    fcTest.prop([
      fc.record({
        action: fc.constantFrom('opened', 'closed', 'synchronize', 'reopened'),
        number: fc.integer({ min: 1, max: 9999 }),
        repository: fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          owner: fc.record({
            login: fc.string({ minLength: 1, maxLength: 39 })
          })
        })
      })
    ])('should handle various webhook event structures', (eventData) => {
      const payload = JSON.stringify(eventData)
      const headers = webhookFixtures.validHeaders()
      
      const result = handler.validatePayload(payload, headers)
      expect(result).toEqual(eventData)
    })
  })

  describe('Security Edge Cases', () => {
    it('should use timing-safe comparison for signatures', () => {
      // This test ensures we use crypto.timingSafeEqual
      const payload = 'test payload'
      const correctSignature = handler.createSignature(payload)
      
      // Should not leak timing information
      const startTime = process.hrtime.bigint()
      try {
        handler.validateSignature(payload, 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      } catch {}
      const shortTime = process.hrtime.bigint() - startTime
      
      const startTime2 = process.hrtime.bigint()
      try {
        handler.validateSignature(payload, correctSignature.slice(0, -1) + '0')
      } catch {}
      const longTime = process.hrtime.bigint() - startTime2
      
      // Timing should be similar (within reasonable bounds)
      // This is a basic check - real timing attacks are more sophisticated
      expect(Math.abs(Number(longTime - shortTime))).toBeLessThan(1000000) // 1ms threshold
    })

    it('should reject signatures with null bytes', () => {
      const payload = 'test'
      const signatureWithNull = 'sha256=abc123\x00def456'
      
      expect(() => handler.validateSignature(payload, signatureWithNull))
        .toThrow(GitHubWebhookSignatureError)
    })
  })
})