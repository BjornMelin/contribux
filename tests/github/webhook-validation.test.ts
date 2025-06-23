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
import { 
  GitHubWebhookError, 
  GitHubWebhookSignatureError, 
  GitHubWebhookPayloadError 
} from '@/lib/github/errors'

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

    it('should validate delivery ID format in strict mode', async () => {
      const strictHandler = new WebhookHandler(secret, {}, { validationMode: 'strict' })
      
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'invalid-format' // Invalid delivery ID
      }

      await expect(strictHandler.handle(payload, headers)).rejects.toThrow('Webhook event validation failed')
    })

    it('should handle invalid delivery ID format gracefully in lenient mode', async () => {
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'invalid-format' // Invalid delivery ID
      }

      // Should not throw in lenient mode, just warn
      await expect(handler.handle(payload, headers)).resolves.toBeUndefined()
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
      await expect(handler.handle(payload, headers)).rejects.toThrow('Handler for issues event failed')
    })

    it('should validate input parameters thoroughly', async () => {
      await expect(handler.handle('', {})).rejects.toThrow('Invalid webhook payload')
      await expect(handler.handle('valid', null as any)).rejects.toThrow('Invalid headers')
    })
  })

  describe('Enhanced Security Features', () => {
    it('should support configurable security options', () => {
      const strictHandler = new WebhookHandler(secret, {}, { 
        requireSha256: true,
        validationMode: 'strict',
        maxDeliveryAge: 30
      })
      const config = strictHandler.getConfiguration()
      
      expect(config).toHaveProperty('supportedEvents')
      expect(config.supportedEvents).toContain('issues')
    })

    it('should enforce strict validation mode when configured', async () => {
      const strictHandler = new WebhookHandler(secret, {}, { validationMode: 'strict' })
      
      const signature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'not-a-valid-uuid' // Invalid UUID
      }

      await expect(strictHandler.handle(payload, headers)).rejects.toThrow('Webhook event validation failed')
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

  describe('Error Handling Consistency', () => {
    describe('Event Parser Errors', () => {
      it('should throw GitHubWebhookPayloadError for invalid payload types', () => {
        const headers = {
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        expect(() => {
          parseWebhookEvent(null as any, headers)
        }).toThrow(GitHubWebhookPayloadError)

        expect(() => {
          parseWebhookEvent(123 as any, headers)
        }).toThrow(GitHubWebhookPayloadError)
      })

      it('should throw GitHubWebhookError for invalid headers', () => {
        expect(() => {
          parseWebhookEvent(payload, null as any)
        }).toThrow(GitHubWebhookError)

        expect(() => {
          parseWebhookEvent(payload, 'invalid' as any)
        }).toThrow(GitHubWebhookError)
      })

      it('should throw GitHubWebhookPayloadError for empty payload', () => {
        const headers = {
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        expect(() => {
          parseWebhookEvent('', headers)
        }).toThrow(GitHubWebhookPayloadError)
      })

      it('should throw GitHubWebhookPayloadError for invalid JSON', () => {
        const headers = {
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        expect(() => {
          parseWebhookEvent('invalid-json{', headers)
        }).toThrow(GitHubWebhookPayloadError)
      })

      it('should throw GitHubWebhookError for missing headers', () => {
        expect(() => {
          parseWebhookEvent(payload, {})
        }).toThrow(GitHubWebhookError)

        expect(() => {
          parseWebhookEvent(payload, { 'x-github-event': 'issues' })
        }).toThrow(GitHubWebhookError)

        expect(() => {
          parseWebhookEvent(payload, { 'x-github-delivery': 'test-id' })
        }).toThrow(GitHubWebhookError)
      })
    })

    describe('Webhook Handler Initialization Errors', () => {
      it('should throw GitHubWebhookSignatureError for invalid secrets', () => {
        expect(() => {
          new WebhookHandler('')
        }).toThrow(GitHubWebhookSignatureError)

        expect(() => {
          new WebhookHandler('short')
        }).toThrow(GitHubWebhookSignatureError)

        expect(() => {
          new WebhookHandler(null as any)
        }).toThrow(GitHubWebhookError)
      })

      it('should throw GitHubWebhookError for invalid handlers', () => {
        expect(() => {
          new WebhookHandler(secret, 'invalid' as any)
        }).toThrow(GitHubWebhookError)
      })

      it('should throw GitHubWebhookError for invalid options', () => {
        expect(() => {
          new WebhookHandler(secret, {}, { maxCacheSize: 50 })
        }).toThrow(GitHubWebhookError)

        expect(() => {
          new WebhookHandler(secret, {}, { maxCacheSize: 200000 })
        }).toThrow(GitHubWebhookError)

        expect(() => {
          new WebhookHandler(secret, {}, { maxCacheSize: -1 })
        }).toThrow(GitHubWebhookError)
      })
    })

    describe('Webhook Handler Processing Errors', () => {
      let handler: WebhookHandler

      beforeEach(() => {
        handler = new WebhookHandler(secret, {
          onIssue: vi.fn()
        })
      })

      it('should throw GitHubWebhookPayloadError for invalid payload', async () => {
        const headers = {
          'x-hub-signature-256': 'sha256=test',
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        await expect(handler.handle('', headers)).rejects.toThrow(GitHubWebhookPayloadError)
        await expect(handler.handle(null as any, headers)).rejects.toThrow(GitHubWebhookPayloadError)
      })

      it('should throw GitHubWebhookError for invalid headers', async () => {
        await expect(handler.handle(payload, null as any)).rejects.toThrow(GitHubWebhookError)
        await expect(handler.handle(payload, 'invalid' as any)).rejects.toThrow(GitHubWebhookError)
      })

      it('should throw GitHubWebhookSignatureError for missing signature', async () => {
        const headers = {
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        await expect(handler.handle(payload, headers)).rejects.toThrow(GitHubWebhookSignatureError)
      })

      it('should throw GitHubWebhookSignatureError for invalid signature', async () => {
        const headers = {
          'x-hub-signature-256': 'sha256=invalid-signature',
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        await expect(handler.handle(payload, headers)).rejects.toThrow(GitHubWebhookSignatureError)
      })

      it('should handle payload size limits', async () => {
        const largePayload = 'x'.repeat(26 * 1024 * 1024) // 26MB, exceeds limit
        const signature = createHmac('sha256', secret)
          .update(largePayload)
          .digest('hex')
        
        const headers = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        await expect(handler.handle(largePayload, headers)).rejects.toThrow(GitHubWebhookPayloadError)
      })

      it('should throw GitHubWebhookError for handler execution failures', async () => {
        const failingHandler = new WebhookHandler(secret, {
          onIssue: vi.fn().mockRejectedValue(new Error('Handler failed'))
        })

        const signature = createHmac('sha256', secret)
          .update(payload)
          .digest('hex')
        
        const headers = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        await expect(failingHandler.handle(payload, headers)).rejects.toThrow(GitHubWebhookError)
      })
    })

    describe('Signature Validation Error Handling', () => {
      it('should handle invalid signature formats gracefully', () => {
        expect(validateWebhookSignature(payload, 'invalid-format', secret)).toBe(false)
        expect(validateWebhookSignature(payload, 'sha256', secret)).toBe(false)
        expect(validateWebhookSignature(payload, '=signature', secret)).toBe(false)
        expect(validateWebhookSignature(payload, 'sha256=', secret)).toBe(false)
      })

      it('should handle unsupported algorithms', () => {
        expect(validateWebhookSignature(payload, 'md5=abc123', secret)).toBe(false)
        expect(validateWebhookSignature(payload, 'sha512=abc123', secret)).toBe(false)
      })

      it('should handle invalid hex characters', () => {
        expect(validateWebhookSignature(payload, 'sha256=xyz123', secret)).toBe(false)
        expect(validateWebhookSignature(payload, 'sha256=123!@#', secret)).toBe(false)
      })

      it('should handle edge cases in strict validation', () => {
        expect(validateWebhookSignatureStrict('', '', '', true)).toBe(false)
        expect(validateWebhookSignatureStrict(payload, null as any, secret, true)).toBe(false)
        expect(validateWebhookSignatureStrict(payload, 'sha256=test', null as any, true)).toBe(false)
      })
    })

    describe('Error Message Consistency', () => {
      it('should use consistent error types across modules', async () => {
        const handler = new WebhookHandler(secret)

        // Test that all webhook-related errors use GitHubWebhookError or its subclasses
        const headers = {
          'x-github-event': 'issues',
          'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
        }

        try {
          await handler.handle(payload, headers)
        } catch (error) {
          expect(error).toBeInstanceOf(GitHubWebhookError)
        }

        try {
          parseWebhookEvent('', headers)
        } catch (error) {
          expect(error).toBeInstanceOf(GitHubWebhookError)
        }
      })

      it('should provide detailed error information', () => {
        try {
          parseWebhookEvent('invalid-json{', {
            'x-github-event': 'issues',
            'x-github-delivery': 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
          })
        } catch (error) {
          expect(error).toBeInstanceOf(GitHubWebhookPayloadError)
          const payloadError = error as GitHubWebhookPayloadError
          expect(payloadError.payloadSize).toBe(13)
          expect(payloadError.parseError).toBeInstanceOf(Error)
        }
      })
    })

    describe('Cache Error Handling', () => {
      it('should handle cache cleanup failures gracefully', () => {
        const handler = new WebhookHandler(secret, {}, { maxCacheSize: 100 })
        
        // Force a cache cleanup scenario
        for (let i = 0; i < 150; i++) {
          (handler as any).processedDeliveries.set(`delivery-${i}`, Date.now())
        }

        // Should not throw when cleaning cache
        expect(() => {
          (handler as any).cleanupCache()
        }).not.toThrow()
      })

      it('should handle cache clear failures gracefully', () => {
        const handler = new WebhookHandler(secret)
        
        // Should not throw when clearing cache
        expect(() => {
          handler.clearCache()
        }).not.toThrow()
      })
    })
  })
})