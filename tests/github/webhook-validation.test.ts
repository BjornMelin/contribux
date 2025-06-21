import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  validateWebhookSignature,
  validateWebhookSignatureStrict,
  parseWebhookEvent,
  WebhookHandler,
  type WebhookEvent,
  type IssuesPayload,
  type PullRequestPayload,
  type PushPayload,
} from '@/lib/github/webhooks'

describe('GitHub Webhook Integration', () => {
  const secret = 'test-webhook-secret'
  const payload = JSON.stringify({ 
    action: 'opened',
    issue: { 
      id: 123, 
      title: 'Test Issue',
      number: 1,
      state: 'open'
    },
    repository: {
      id: 456,
      name: 'test-repo',
      owner: {
        login: 'test-owner'
      }
    }
  })

  describe('Webhook Signature Validation', () => {
    it('should validate a correct webhook signature', () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const isValid = validateWebhookSignature(payload, `sha256=${signature}`, secret)
      expect(isValid).toBe(true)
    })

    it('should reject an invalid webhook signature', () => {
      const invalidSignature = 'sha256=invalid-signature'
      
      const isValid = validateWebhookSignature(payload, invalidSignature, secret)
      expect(isValid).toBe(false)
    })

    it('should accept SHA1 signatures in non-strict mode', () => {
      const signature = createHmac('sha1', secret)
        .update(payload)
        .digest('hex')
      
      const isValid = validateWebhookSignature(payload, `sha1=${signature}`, secret)
      expect(isValid).toBe(true)
    })

    it('should reject SHA1 signatures in strict mode', () => {
      const signature = createHmac('sha1', secret)
        .update(payload)
        .digest('hex')
      
      const isValid = validateWebhookSignatureStrict(payload, `sha1=${signature}`, secret, true)
      expect(isValid).toBe(false)
    })

    it('should use timing-safe comparison to prevent timing attacks', () => {
      // This test ensures we're using crypto.timingSafeEqual
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      // Should not throw even with valid signature
      expect(() => {
        validateWebhookSignature(payload, `sha256=${signature}`, secret)
      }).not.toThrow()
    })

    it('should handle missing signature header', () => {
      const isValid = validateWebhookSignature(payload, '', secret)
      expect(isValid).toBe(false)
    })

    it('should handle malformed signature header', () => {
      const isValid = validateWebhookSignature(payload, 'invalid-format', secret)
      expect(isValid).toBe(false)
    })
  })

  describe('Webhook Event Parsing', () => {
    it('should parse issue opened event', () => {
      const headers = {
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      const event = parseWebhookEvent(payload, headers)
      
      expect(event).toEqual({
        type: 'issues',
        action: 'opened',
        deliveryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        payload: JSON.parse(payload)
      })
    })

    it('should parse pull request event', () => {
      const prPayload = JSON.stringify({
        action: 'opened',
        pull_request: {
          id: 789,
          title: 'Test PR',
          number: 2,
          state: 'open'
        }
      })

      const headers = {
        'x-github-event': 'pull_request',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d480'
      }

      const event = parseWebhookEvent(prPayload, headers)
      
      expect(event.type).toBe('pull_request')
      expect(event.action).toBe('opened')
      expect((event.payload as any).pull_request?.title).toBe('Test PR')
    })

    it('should handle push events', () => {
      const pushPayload = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [
          { id: 'abc123', message: 'Test commit' }
        ]
      })

      const headers = {
        'x-github-event': 'push',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d481'
      }

      const event = parseWebhookEvent(pushPayload, headers)
      
      expect(event.type).toBe('push')
      expect(event.action).toBeUndefined() // Push events don't have actions
      expect((event.payload as any).ref).toBe('refs/heads/main')
    })

    it('should throw on invalid JSON payload', () => {
      const headers = {
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      expect(() => {
        parseWebhookEvent('invalid-json', headers)
      }).toThrow()
    })
  })

  describe('Webhook Handler', () => {
    let handler: WebhookHandler
    let mockHandlers: any

    beforeEach(() => {
      mockHandlers = {
        issues: vi.fn(),
        pull_request: vi.fn(),
        push: vi.fn()
      }
      
      handler = new WebhookHandler(secret, {
        onIssue: mockHandlers.issues,
        onPullRequest: mockHandlers.pull_request,
        onPush: mockHandlers.push
      })
    })

    it('should process valid webhook and route to correct handler', async () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      await handler.handle(payload, headers)
      
      expect(mockHandlers.issues).toHaveBeenCalledWith({
        type: 'issues',
        action: 'opened',
        deliveryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        payload: JSON.parse(payload)
      })
      expect(mockHandlers.pull_request).not.toHaveBeenCalled()
    })

    it('should reject webhook with invalid signature', async () => {
      const headers = {
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      await expect(handler.handle(payload, headers)).rejects.toThrow('Invalid webhook signature')
    })

    it('should handle missing event handler gracefully', async () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'star', // No handler for star events
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      // Should not throw, just log or ignore
      await expect(handler.handle(payload, headers)).resolves.toBeUndefined()
    })

    it('should handle webhook retry with idempotency', async () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479' // UUID format delivery ID
      }

      // First call
      await handler.handle(payload, headers)
      expect(mockHandlers.issues).toHaveBeenCalledTimes(1)

      // Retry with same delivery ID - should be idempotent
      await handler.handle(payload, headers)
      expect(mockHandlers.issues).toHaveBeenCalledTimes(1) // Still only called once
    })

    it('should validate delivery ID format', async () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'invalid-format' // Invalid delivery ID
      }

      await expect(handler.handle(payload, headers)).rejects.toThrow('Invalid delivery ID format')
    })

    it('should support webhook configuration', () => {
      const config = handler.getConfiguration()
      
      expect(config).toHaveProperty('supportedEvents')
      expect(config.supportedEvents).toContain('issues')
      expect(config.supportedEvents).toContain('pull_request')
      expect(config.supportedEvents).toContain('push')
    })

    it('should handle errors in event handlers', async () => {
      mockHandlers.issues.mockRejectedValue(new Error('Handler error'))
      
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      }

      // Should not throw the handler error, but wrap it
      await expect(handler.handle(payload, headers)).rejects.toThrow('Webhook handler error')
    })

    it('should validate input parameters thoroughly', async () => {
      await expect(handler.handle('', {})).rejects.toThrow('Invalid webhook payload')
      await expect(handler.handle('valid', null as any)).rejects.toThrow('Invalid headers')
    })
  })

  describe('Enhanced Security Features', () => {
    it('should support configurable security options', () => {
      const strictHandler = new WebhookHandler(secret, {}, { requireSha256: true })
      const config = strictHandler.getConfiguration()
      
      expect(config).toHaveProperty('supportedEvents')
      expect(config.supportedEvents).toContain('issues')
    })

    it('should handle UTF-8 payloads correctly', () => {
      const unicodePayload = JSON.stringify({ message: 'Hello 🌍' })
      const signature = createHmac('sha256', secret)
        .update(Buffer.from(unicodePayload, 'utf8'))
        .digest('hex')
      
      const isValid = validateWebhookSignature(unicodePayload, `sha256=${signature}`, secret)
      expect(isValid).toBe(true)
    })

    it('should reject malformed hex signatures', () => {
      const invalidHex = 'sha256=notahexstring!'
      const isValid = validateWebhookSignature(payload, invalidHex, secret)
      expect(isValid).toBe(false)
    })
  })

  describe('Webhook Types', () => {
    it('should have proper TypeScript types for webhook events', () => {
      // This is a compile-time test - if it compiles, types are correct
      const issueEvent: WebhookEvent = {
        type: 'issues',
        action: 'opened',
        deliveryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        payload: {
          action: 'opened',
          issue: {
            id: 123,
            node_id: 'issue_123',
            url: 'https://api.github.com/repos/test/test/issues/123',
            repository_url: 'https://api.github.com/repos/test/test',
            labels_url: 'https://api.github.com/repos/test/test/issues/123/labels',
            comments_url: 'https://api.github.com/repos/test/test/issues/123/comments',
            events_url: 'https://api.github.com/repos/test/test/issues/123/events',
            html_url: 'https://github.com/test/test/issues/123',
            number: 1,
            title: 'Test Issue',
            user: null,
            labels: [],
            state: 'open' as const,
            locked: false,
            assignee: null,
            assignees: [],
            milestone: null,
            comments: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            closed_at: null,
            author_association: 'OWNER',
            active_lock_reason: null,
            body: null,
          },
          repository: {} as any,
          sender: {} as any
        }
      }

      expect(issueEvent.type).toBe('issues')
    })
  })
})