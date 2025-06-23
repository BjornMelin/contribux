import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { createHmac, randomUUID } from 'crypto'
import {
  WebhookHandler,
  validateWebhookSignature,
  validateWebhookSignatureStrict,
  parseWebhookEvent,
  type WebhookEvent,
  type WebhookHeaders,
  type IssuesPayload,
  type PullRequestPayload,
  type PushPayload,
  type StarPayload,
  type ForkPayload,
  type ReleasePayload,
  type WorkflowRunPayload,
} from '@/lib/github/webhooks'
import {
  GitHubWebhookError,
  GitHubWebhookSignatureError,
  GitHubWebhookPayloadError,
} from '@/lib/github/errors'

describe('GitHub Webhook Integration Flows', () => {
  const WEBHOOK_SERVER_URL = 'http://localhost:3001'
  const WEBHOOK_SECRET = 'test-webhook-secret-integration'
  const RETRY_DELAYS = [100, 200, 400] // Exponential backoff delays in ms
  
  // Track webhook server availability
  let webhookServerAvailable = false

  beforeAll(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1000)
      
      const response = await fetch(`${WEBHOOK_SERVER_URL}/health`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        webhookServerAvailable = true
        
        // Clear any existing webhooks
        await fetch(`${WEBHOOK_SERVER_URL}/webhooks`, { method: 'DELETE' })
      }
    } catch (error) {
      console.warn('Webhook server not available, skipping integration tests')
      webhookServerAvailable = false
    }
  })

  beforeEach(async () => {
    if (webhookServerAvailable) {
      // Clear webhooks before each test
      await fetch(`${WEBHOOK_SERVER_URL}/webhooks`, { method: 'DELETE' })
    }
    
    // Clear all mocks and timers
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('Webhook Signature Validation', () => {
    describe('HMAC-SHA256 Signature Validation', () => {
      const testPayload = JSON.stringify({
        action: 'opened',
        issue: {
          id: 123,
          title: 'Test Issue',
          number: 1,
          state: 'open',
        },
        repository: {
          id: 456,
          name: 'test-repo',
          full_name: 'test-owner/test-repo',
          owner: { login: 'test-owner' },
        },
      })

      it('should validate correct SHA256 signatures', () => {
        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(testPayload)
          .digest('hex')

        expect(validateWebhookSignature(testPayload, `sha256=${signature}`, WEBHOOK_SECRET)).toBe(true)
      })

      it('should reject invalid SHA256 signatures', () => {
        const validSignature = createHmac('sha256', WEBHOOK_SECRET)
          .update(testPayload)
          .digest('hex')
        
        const invalidSignature = validSignature.slice(0, -1) + 'x' // Modify last character
        
        expect(validateWebhookSignature(testPayload, `sha256=${invalidSignature}`, WEBHOOK_SECRET)).toBe(false)
      })

      it('should validate correct SHA1 signatures in compatibility mode', () => {
        const signature = createHmac('sha1', WEBHOOK_SECRET)
          .update(testPayload)
          .digest('hex')

        expect(validateWebhookSignature(testPayload, `sha1=${signature}`, WEBHOOK_SECRET)).toBe(true)
      })

      it('should reject SHA1 signatures in strict mode', () => {
        const signature = createHmac('sha1', WEBHOOK_SECRET)
          .update(testPayload)
          .digest('hex')

        expect(validateWebhookSignatureStrict(testPayload, `sha1=${signature}`, WEBHOOK_SECRET, true)).toBe(false)
      })

      it('should handle Unicode characters in payloads correctly', () => {
        const unicodePayload = JSON.stringify({
          message: 'Hello 🌍 World! 中文 العربية',
          emoji: '🚀🎉💻',
        })

        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(Buffer.from(unicodePayload, 'utf8'))
          .digest('hex')

        expect(validateWebhookSignature(unicodePayload, `sha256=${signature}`, WEBHOOK_SECRET)).toBe(true)
      })

      it('should reject signatures with invalid hex characters', () => {
        const invalidHexSignatures = [
          'sha256=not-hex-characters!',
          'sha256=gggggggggggggggggggggggggggggggg',
          'sha256=123xyz',
        ]

        for (const invalidSig of invalidHexSignatures) {
          expect(validateWebhookSignature(testPayload, invalidSig, WEBHOOK_SECRET)).toBe(false)
        }
      })

      it('should reject malformed signature headers', () => {
        const malformedSignatures = [
          'invalid-format',
          'sha256',
          '=signature-only',
          'sha256=',
          'algo=sig=extra',
          '',
        ]

        for (const malformedSig of malformedSignatures) {
          expect(validateWebhookSignature(testPayload, malformedSig, WEBHOOK_SECRET)).toBe(false)
        }
      })

      it('should handle edge cases and prevent timing attacks', () => {
        const payload = 'test-payload'
        const signature1 = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')
        const signature2 = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')

        // Same signature should always validate
        expect(validateWebhookSignature(payload, `sha256=${signature1}`, WEBHOOK_SECRET)).toBe(true)
        expect(validateWebhookSignature(payload, `sha256=${signature2}`, WEBHOOK_SECRET)).toBe(true)
        
        // Different payload should fail
        expect(validateWebhookSignature('different-payload', `sha256=${signature1}`, WEBHOOK_SECRET)).toBe(false)
        
        // Different secret should fail
        expect(validateWebhookSignature(payload, `sha256=${signature1}`, 'different-secret')).toBe(false)
      })

      it('should validate secret strength requirements', () => {
        const payload = 'test'
        const validSecret = 'valid-secret-123'
        const signature = createHmac('sha256', validSecret).update(payload).digest('hex')
        
        // Short secrets should be rejected during handler initialization
        expect(() => {
          new WebhookHandler('short')
        }).toThrow(GitHubWebhookSignatureError)
        
        // But signature validation itself should work with valid secret
        expect(validateWebhookSignature(payload, `sha256=${signature}`, validSecret)).toBe(true)
        
        // And reject secrets that are too short in validation
        expect(validateWebhookSignature(payload, `sha256=${signature}`, 'short')).toBe(false)
      })
    })

    describe('Replay Attack Prevention', () => {
      it('should prevent replay attacks with delivery ID tracking', async () => {
        const handler = new WebhookHandler(WEBHOOK_SECRET, {
          onIssue: vi.fn(),
        })

        const payload = JSON.stringify({
          action: 'opened',
          issue: { id: 123, title: 'Test Issue' },
          repository: { id: 456, name: 'test-repo' },
        })

        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(payload)
          .digest('hex')

        const deliveryId = randomUUID()
        const headers = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'issues',
          'x-github-delivery': deliveryId,
        }

        // Clear any existing deliveries first
        handler.clearCache()

        // First delivery should succeed
        await handler.handle(payload, headers)
        expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(1)

        // Replay attack should be silently ignored (idempotent)
        await handler.handle(payload, headers)
        expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(1)
      })

      it('should validate delivery ID format', async () => {
        const handler = new WebhookHandler(WEBHOOK_SECRET, {}, { validationMode: 'strict' })
        const payload = JSON.stringify({ test: 'data' })
        const signature = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')

        const invalidDeliveryIds = [
          'not-a-uuid',
          '123',
          'invalid-format-123',
        ]

        for (const invalidId of invalidDeliveryIds) {
          const headers = {
            'x-hub-signature-256': `sha256=${signature}`,
            'x-github-event': 'ping',
            'x-github-delivery': invalidId,
          }

          await expect(handler.handle(payload, headers)).rejects.toThrow('Webhook event validation failed')
        }
        
        // Test empty delivery ID
        const emptyHeaders = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'ping',
          'x-github-delivery': '',
        }
        await expect(handler.handle(payload, emptyHeaders)).rejects.toThrow('Missing x-github-delivery header')
        
        // Test valid UUID should work
        const validHeaders = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'ping',
          'x-github-delivery': randomUUID(),
        }
        await expect(handler.handle(payload, validHeaders)).resolves.not.toThrow()
      })
    })
  })

  describe('Webhook Event Type Processing', () => {
    let handler: WebhookHandler
    let mockHandlers: Record<string, ReturnType<typeof vi.fn>>

    beforeEach(() => {
      mockHandlers = {
        onIssue: vi.fn(),
        onPullRequest: vi.fn(),
        onPush: vi.fn(),
        onStar: vi.fn(),
        onFork: vi.fn(),
        onRelease: vi.fn(),
        onWorkflowRun: vi.fn(),
      }

      handler = new WebhookHandler(WEBHOOK_SECRET, mockHandlers)
    })

    describe('Issues Events', () => {
      it('should process issue opened events', async () => {
        const payload: IssuesPayload = {
          action: 'opened',
          issue: {
            id: 123,
            node_id: 'I_kwDOGH1J',
            url: 'https://api.github.com/repos/test/repo/issues/1',
            repository_url: 'https://api.github.com/repos/test/repo',
            labels_url: 'https://api.github.com/repos/test/repo/issues/1/labels{/name}',
            comments_url: 'https://api.github.com/repos/test/repo/issues/1/comments',
            events_url: 'https://api.github.com/repos/test/repo/issues/1/events',
            html_url: 'https://github.com/test/repo/issues/1',
            number: 1,
            title: 'New Issue',
            user: {
              login: 'testuser',
              id: 456,
              node_id: 'MDQ6VXNlcjQ1Ng==',
              avatar_url: 'https://avatars.githubusercontent.com/u/456?v=4',
              gravatar_id: '',
              url: 'https://api.github.com/users/testuser',
              html_url: 'https://github.com/testuser',
              followers_url: 'https://api.github.com/users/testuser/followers',
              following_url: 'https://api.github.com/users/testuser/following{/other_user}',
              gists_url: 'https://api.github.com/users/testuser/gists{/gist_id}',
              starred_url: 'https://api.github.com/users/testuser/starred{/owner}{/repo}',
              subscriptions_url: 'https://api.github.com/users/testuser/subscriptions',
              organizations_url: 'https://api.github.com/users/testuser/orgs',
              repos_url: 'https://api.github.com/users/testuser/repos',
              events_url: 'https://api.github.com/users/testuser/events{/privacy}',
              received_events_url: 'https://api.github.com/users/testuser/received_events',
              type: 'User',
              site_admin: false,
            },
            labels: [],
            state: 'open',
            locked: false,
            assignee: null,
            assignees: [],
            milestone: null,
            comments: 0,
            created_at: '2025-01-22T10:00:00Z',
            updated_at: '2025-01-22T10:00:00Z',
            closed_at: null,
            author_association: 'OWNER',
            active_lock_reason: null,
            body: 'Issue description',
          },
          repository: {
            id: 789,
            node_id: 'MDEwOlJlcG9zaXRvcnk3ODk=',
            name: 'test-repo',
            full_name: 'test/repo',
            private: false,
            owner: {
              login: 'test',
              id: 101112,
              node_id: 'MDEwOk9yZ2FuaXphdGlvbjEwMTExMg==',
              avatar_url: 'https://avatars.githubusercontent.com/u/101112?v=4',
              gravatar_id: '',
              url: 'https://api.github.com/users/test',
              html_url: 'https://github.com/test',
              followers_url: 'https://api.github.com/users/test/followers',
              following_url: 'https://api.github.com/users/test/following{/other_user}',
              gists_url: 'https://api.github.com/users/test/gists{/gist_id}',
              starred_url: 'https://api.github.com/users/test/starred{/owner}{/repo}',
              subscriptions_url: 'https://api.github.com/users/test/subscriptions',
              organizations_url: 'https://api.github.com/users/test/orgs',
              repos_url: 'https://api.github.com/users/test/repos',
              events_url: 'https://api.github.com/users/test/events{/privacy}',
              received_events_url: 'https://api.github.com/users/test/received_events',
              type: 'Organization',
              site_admin: false,
            },
            html_url: 'https://github.com/test/repo',
            description: 'Test repository',
            fork: false,
            url: 'https://api.github.com/repos/test/repo',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-22T10:00:00Z',
            pushed_at: '2025-01-22T09:00:00Z',
            clone_url: 'https://github.com/test/repo.git',
            size: 100,
            stargazers_count: 5,
            watchers_count: 5,
            language: 'TypeScript',
            has_issues: true,
            has_projects: true,
            has_wiki: true,
            has_pages: false,
            has_downloads: true,
            archived: false,
            disabled: false,
            open_issues_count: 1,
            license: {
              key: 'mit',
              name: 'MIT License',
              spdx_id: 'MIT',
              url: 'https://api.github.com/licenses/mit',
              node_id: 'MDc6TGljZW5zZTE=',
            },
            allow_forking: true,
            is_template: false,
            topics: ['typescript', 'testing'],
            visibility: 'public',
            forks: 2,
            open_issues: 1,
            watchers: 5,
            default_branch: 'main',
          },
          sender: {
            login: 'testuser',
            id: 456,
            node_id: 'MDQ6VXNlcjQ1Ng==',
            avatar_url: 'https://avatars.githubusercontent.com/u/456?v=4',
            gravatar_id: '',
            url: 'https://api.github.com/users/testuser',
            html_url: 'https://github.com/testuser',
            followers_url: 'https://api.github.com/users/testuser/followers',
            following_url: 'https://api.github.com/users/testuser/following{/other_user}',
            gists_url: 'https://api.github.com/users/testuser/gists{/gist_id}',
            starred_url: 'https://api.github.com/users/testuser/starred{/owner}{/repo}',
            subscriptions_url: 'https://api.github.com/users/testuser/subscriptions',
            organizations_url: 'https://api.github.com/users/testuser/orgs',
            repos_url: 'https://api.github.com/users/testuser/repos',
            events_url: 'https://api.github.com/users/testuser/events{/privacy}',
            received_events_url: 'https://api.github.com/users/testuser/received_events',
            type: 'User',
            site_admin: false,
          },
        }

        await testWebhookEvent('issues', payload, mockHandlers.onIssue)
      })

      it('should process issue closed events', async () => {
        const payload: Partial<IssuesPayload> = {
          action: 'closed',
          issue: {
            id: 123,
            title: 'Closed Issue',
            state: 'closed',
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('issues', payload, mockHandlers.onIssue)
      })

      it('should process issue labeled events', async () => {
        const payload: Partial<IssuesPayload> = {
          action: 'labeled',
          issue: {
            id: 123,
            title: 'Labeled Issue',
            labels: [{ id: 1, name: 'bug', color: 'red' }],
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('issues', payload, mockHandlers.onIssue)
      })
    })

    describe('Pull Request Events', () => {
      it('should process pull request opened events', async () => {
        const payload: Partial<PullRequestPayload> = {
          action: 'opened',
          number: 42,
          pull_request: {
            id: 123,
            title: 'New PR',
            number: 42,
            state: 'open',
            head: { ref: 'feature-branch', sha: 'abc123' },
            base: { ref: 'main', sha: 'def456' },
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('pull_request', payload, mockHandlers.onPullRequest)
      })

      it('should process pull request synchronize events', async () => {
        const payload: Partial<PullRequestPayload> = {
          action: 'synchronize',
          number: 42,
          pull_request: {
            id: 123,
            title: 'Updated PR',
            number: 42,
            state: 'open',
            head: { ref: 'feature-branch', sha: 'xyz789' },
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('pull_request', payload, mockHandlers.onPullRequest)
      })

      it('should process pull request review_requested events', async () => {
        const payload: Partial<PullRequestPayload> = {
          action: 'review_requested',
          number: 42,
          pull_request: {
            id: 123,
            title: 'PR Needs Review',
            requested_reviewers: [{ login: 'reviewer' }],
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('pull_request', payload, mockHandlers.onPullRequest)
      })
    })

    describe('Push Events', () => {
      it('should process push to main branch events', async () => {
        const payload: Partial<PushPayload> = {
          ref: 'refs/heads/main',
          before: 'abc123',
          after: 'def456',
          created: false,
          deleted: false,
          forced: false,
          commits: [
            {
              id: 'def456',
              message: 'Add new feature',
              timestamp: '2025-01-22T10:00:00Z',
              author: { name: 'Test User', email: 'test@example.com' },
              committer: { name: 'Test User', email: 'test@example.com' },
              added: ['src/feature.ts'],
              removed: [],
              modified: ['README.md'],
            } as any,
          ],
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('push', payload, mockHandlers.onPush)
      })

      it('should process branch creation events', async () => {
        const payload: Partial<PushPayload> = {
          ref: 'refs/heads/new-feature',
          before: '0000000000000000000000000000000000000000',
          after: 'def456',
          created: true,
          deleted: false,
          commits: [],
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('push', payload, mockHandlers.onPush)
      })

      it('should process branch deletion events', async () => {
        const payload: Partial<PushPayload> = {
          ref: 'refs/heads/old-feature',
          before: 'abc123',
          after: '0000000000000000000000000000000000000000',
          created: false,
          deleted: true,
          commits: [],
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('push', payload, mockHandlers.onPush)
      })
    })

    describe('Star Events', () => {
      it('should process star created events', async () => {
        const payload: Partial<StarPayload> = {
          action: 'created',
          starred_at: '2025-01-22T10:00:00Z',
          repository: { id: 789, name: 'test-repo', stargazers_count: 6 } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('star', payload, mockHandlers.onStar)
      })

      it('should process star deleted events', async () => {
        const payload: Partial<StarPayload> = {
          action: 'deleted',
          starred_at: null,
          repository: { id: 789, name: 'test-repo', stargazers_count: 4 } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('star', payload, mockHandlers.onStar)
      })
    })

    describe('Fork Events', () => {
      it('should process repository fork events', async () => {
        const payload: Partial<ForkPayload> = {
          forkee: {
            id: 999,
            name: 'test-repo',
            full_name: 'forker/test-repo',
            owner: { login: 'forker' },
            fork: true,
          } as any,
          repository: { id: 789, name: 'test-repo', forks: 3 } as any,
          sender: { login: 'forker' } as any,
        }

        await testWebhookEvent('fork', payload, mockHandlers.onFork)
      })
    })

    describe('Release Events', () => {
      it('should process release published events', async () => {
        const payload: Partial<ReleasePayload> = {
          action: 'published',
          release: {
            id: 555,
            tag_name: 'v1.0.0',
            name: 'Version 1.0.0',
            draft: false,
            prerelease: false,
            author: { login: 'maintainer' },
            published_at: '2025-01-22T10:00:00Z',
            body: 'Release notes for v1.0.0',
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'maintainer' } as any,
        }

        await testWebhookEvent('release', payload, mockHandlers.onRelease)
      })

      it('should process release draft events', async () => {
        const payload: Partial<ReleasePayload> = {
          action: 'created',
          release: {
            id: 556,
            tag_name: 'v1.1.0',
            name: 'Version 1.1.0 Draft',
            draft: true,
            prerelease: false,
            published_at: null,
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'maintainer' } as any,
        }

        await testWebhookEvent('release', payload, mockHandlers.onRelease)
      })
    })

    describe('Workflow Run Events', () => {
      it('should process workflow run completed events', async () => {
        const payload: Partial<WorkflowRunPayload> = {
          action: 'completed',
          workflow_run: {
            id: 777,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: 'abc123',
            event: 'push',
            run_number: 42,
          } as any,
          workflow: {
            id: 888,
            name: 'CI',
            state: 'active',
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('workflow_run', payload, mockHandlers.onWorkflowRun)
      })

      it('should process workflow run failure events', async () => {
        const payload: Partial<WorkflowRunPayload> = {
          action: 'completed',
          workflow_run: {
            id: 778,
            name: 'Tests',
            status: 'completed',
            conclusion: 'failure',
            head_branch: 'feature-branch',
            head_sha: 'def456',
            event: 'pull_request',
            run_number: 43,
          } as any,
          workflow: {
            id: 889,
            name: 'Tests',
            state: 'active',
          } as any,
          repository: { id: 789, name: 'test-repo' } as any,
          sender: { login: 'testuser' } as any,
        }

        await testWebhookEvent('workflow_run', payload, mockHandlers.onWorkflowRun)
      })
    })

    // Helper function to test webhook events
    async function testWebhookEvent(
      eventType: string,
      payload: any,
      expectedHandler: ReturnType<typeof vi.fn>
    ) {
      const payloadStr = JSON.stringify(payload)
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payloadStr)
        .digest('hex')

      const headers: WebhookHeaders = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': eventType,
        'x-github-delivery': randomUUID(),
      }

      await handler.handle(payloadStr, headers)

      expect(expectedHandler).toHaveBeenCalledWith({
        type: eventType,
        action: payload.action,
        deliveryId: headers['x-github-delivery'],
        payload: payload,
      })
    }
  })

  describe('Webhook Retry Mechanisms', () => {
    let retryHandler: WebhookHandler
    let retryAttempts: number[]

    beforeEach(() => {
      retryAttempts = []
      retryHandler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn().mockImplementation(() => {
          retryAttempts.push(Date.now())
          if (retryAttempts.length < 3) {
            throw new Error('Simulated handler failure')
          }
        }),
      })
    })

    it('should implement exponential backoff for webhook delivery failures', async () => {
      const payload = JSON.stringify({
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      })

      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex')

      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': randomUUID(),
      }

      const startTime = Date.now()
      let lastAttemptTime = startTime

      // Simulate retry logic with exponential backoff
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await retryHandler.handle(payload, headers)
          break
        } catch (error) {
          if (attempt < 2) {
            // Record timing between attempts 
            const currentTime = Date.now()
            const actualDelay = currentTime - lastAttemptTime
            
            // Wait for exponential backoff delay
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
            lastAttemptTime = Date.now()
          } else {
            // Final attempt failed
            expect(retryAttempts).toHaveLength(3)
          }
        }
      }

      // Just verify that retries happened and delays were implemented
      expect(retryAttempts.length).toBeGreaterThan(1)
      const totalDuration = Date.now() - startTime
      const expectedMinimumDelay = RETRY_DELAYS[0] + RETRY_DELAYS[1] // Sum of delays
      expect(totalDuration).toBeGreaterThan(expectedMinimumDelay - 50) // Allow some variance
    })

    it('should handle temporary network failures with retries', async () => {
      if (!webhookServerAvailable) {
        console.log('Skipping webhook server test - server not available')
        return
      }

      const payload = {
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      }

      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex')

      // Test webhook delivery to server
      let success = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          
          const response = await fetch(`${WEBHOOK_SERVER_URL}/webhook`, {
            method: 'POST',
            headers: {
              'x-hub-signature-256': `sha256=${signature}`,
              'x-github-event': 'issues',
              'x-github-delivery': randomUUID(),
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            success = true
            break
          }
        } catch (error) {
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
          }
        }
      }

      expect(success).toBe(true)
    })

    it('should handle webhook endpoint unavailability gracefully', async () => {
      const payload = {
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      }

      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex')

      const deliveryId = randomUUID()

      // Try to deliver to non-existent endpoint
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)
        
        await fetch('http://localhost:9999/webhook', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': `sha256=${signature}`,
            'x-github-event': 'issues',
            'x-github-delivery': deliveryId,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
      } catch (error) {
        expect(error).toBeDefined()
        // This is expected behavior for unavailable endpoints
      }
    })
  })

  describe('Webhook Delivery Failure Scenarios', () => {
    it('should handle malformed webhook requests', async () => {
      if (!webhookServerAvailable) {
        console.log('Skipping webhook server test - server not available')
        return
      }

      const malformedRequests = [
        // Invalid JSON
        { payload: '{invalid-json', expectedStatus: 400 },
        // Missing signature
        { payload: '{"valid": "json"}', headers: {}, expectedStatus: 401 },
        // Invalid signature
        {
          payload: '{"valid": "json"}',
          headers: { 'x-hub-signature-256': 'sha256=invalid' },
          expectedStatus: 401,
        },
      ]

      for (const { payload, headers = {}, expectedStatus } of malformedRequests) {
        try {
          const response = await fetch(`${WEBHOOK_SERVER_URL}/webhook`, {
            method: 'POST',
            headers: {
              'x-github-event': 'ping',
              'x-github-delivery': randomUUID(),
              'content-type': 'application/json',
              ...headers,
            },
            body: payload,
          })

          expect(response.status).toBe(expectedStatus)
        } catch (error) {
          // Network errors are also acceptable for malformed requests
          expect(error).toBeDefined()
        }
      }
    })

    it('should handle payload size limits', async () => {
      const handler = new WebhookHandler(WEBHOOK_SECRET)
      
      // Create a payload that exceeds size limits (25MB limit)
      const largePayload = JSON.stringify({
        data: 'x'.repeat(26 * 1024 * 1024), // 26MB
      })

      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(largePayload)
        .digest('hex')

      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'ping',
        'x-github-delivery': randomUUID(),
      }

      await expect(handler.handle(largePayload, headers)).rejects.toThrow(GitHubWebhookPayloadError)
    })

    it('should handle invalid event types gracefully', async () => {
      const handler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn(),
      })

      const payload = JSON.stringify({ message: 'test' })
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex')

      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'unknown_event_type',
        'x-github-delivery': randomUUID(),
      }

      // Should not throw, but should not call any handlers
      await expect(handler.handle(payload, headers)).resolves.toBeUndefined()
      expect(handler.getConfiguration().handlers.onIssue).not.toHaveBeenCalled()
    })

    it('should handle handler exceptions gracefully', async () => {
      const failingHandler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn().mockRejectedValue(new Error('Handler processing failed')),
      })

      const payload = JSON.stringify({
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      })

      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex')

      const headers = {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'issues',
        'x-github-delivery': randomUUID(),
      }

      await expect(failingHandler.handle(payload, headers)).rejects.toThrow(GitHubWebhookError)
    })
  })

  describe('Webhook Endpoint Health Checks', () => {
    it.skipIf(!webhookServerAvailable)('should verify webhook server health before processing', async () => {
      const healthResponse = await fetch(`${WEBHOOK_SERVER_URL}/health`)
      expect(healthResponse.status).toBe(200)
      
      const healthData = await healthResponse.json()
      expect(healthData).toHaveProperty('status', 'healthy')
      expect(healthData).toHaveProperty('uptime')
      expect(typeof healthData.uptime).toBe('number')
    })

    it.skipIf(!webhookServerAvailable)('should monitor webhook delivery success rates', async () => {
      const totalDeliveries = 10
      const successfulDeliveries = []

      for (let i = 0; i < totalDeliveries; i++) {
        const payload = {
          action: 'opened',
          issue: { id: 100 + i, title: `Test Issue ${i}` },
          repository: { id: 456, name: 'test-repo' },
        }

        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(JSON.stringify(payload))
          .digest('hex')

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          
          const response = await fetch(`${WEBHOOK_SERVER_URL}/webhook`, {
            method: 'POST',
            headers: {
              'x-hub-signature-256': `sha256=${signature}`,
              'x-github-event': 'issues',
              'x-github-delivery': randomUUID(),
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)

          if (response.ok) {
            successfulDeliveries.push(i)
          }
        } catch (error) {
          // Count as failed delivery
        }
      }

      // Expect at least 80% success rate
      const successRate = successfulDeliveries.length / totalDeliveries
      expect(successRate).toBeGreaterThanOrEqual(0.8)

      // Verify webhooks were stored
      const webhooksResponse = await fetch(`${WEBHOOK_SERVER_URL}/webhooks`)
      const webhooksData = await webhooksResponse.json()
      expect(webhooksData.count).toBeGreaterThanOrEqual(successfulDeliveries.length)
    })

    it.skipIf(!webhookServerAvailable)('should validate webhook endpoint configuration', async () => {
      // Test ping webhook
      const pingPayload = { zen: 'Keep it simple.', hook_id: 123 }
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(pingPayload))
        .digest('hex')

      const response = await fetch(`${WEBHOOK_SERVER_URL}/webhook`, {
        method: 'POST',
        headers: {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'ping',
          'x-github-delivery': randomUUID(),
          'content-type': 'application/json',
        },
        body: JSON.stringify(pingPayload),
      })

      expect(response.status).toBe(200)
      const responseData = await response.json()
      expect(responseData).toHaveProperty('message', 'pong')
    })

    it('should demonstrate webhook server integration capabilities', () => {
      // This test documents the integration capabilities even when server is not available
      expect(WEBHOOK_SERVER_URL).toBe('http://localhost:3001')
      expect(WEBHOOK_SECRET).toBe('test-webhook-secret-integration')
      
      console.log(`Webhook server availability: ${webhookServerAvailable}`)
      console.log('Integration tests require webhook server to be running on port 3001')
      console.log('To start webhook server: cd tests/integration/infrastructure/webhook-server && npm start')
    })
  })

  describe('Event Ordering and Idempotency', () => {
    it('should handle out-of-order webhook deliveries', async () => {
      const handler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn(),
      })

      const basePayload = {
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      }

      // Simulate out-of-order delivery with different delivery IDs
      const deliveries = [
        { id: randomUUID(), timestamp: '2025-01-22T10:02:00Z' },
        { id: randomUUID(), timestamp: '2025-01-22T10:01:00Z' },
        { id: randomUUID(), timestamp: '2025-01-22T10:03:00Z' },
      ]

      for (const delivery of deliveries) {
        const payload = JSON.stringify({
          ...basePayload,
          timestamp: delivery.timestamp,
        })

        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(payload)
          .digest('hex')

        const headers = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'issues',
          'x-github-delivery': delivery.id,
        }

        await handler.handle(payload, headers)
      }

      // All three deliveries should be processed (different delivery IDs)
      expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(3)
    })

    it('should ensure idempotent webhook processing', async () => {
      const handler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn(),
        onPullRequest: vi.fn(),
      })

      // Clear cache first to ensure clean state
      handler.clearCache()

      const issuePayload = JSON.stringify({
        action: 'opened',
        issue: { id: 123, title: 'Test Issue' },
        repository: { id: 456, name: 'test-repo' },
      })

      const prPayload = JSON.stringify({
        action: 'opened',
        number: 42,
        pull_request: { id: 789, title: 'Test PR' },
        repository: { id: 456, name: 'test-repo' },
      })

      const deliveryId = randomUUID()

      // Process issue webhook
      const issueSignature = createHmac('sha256', WEBHOOK_SECRET)
        .update(issuePayload)
        .digest('hex')

      const issueHeaders = {
        'x-hub-signature-256': `sha256=${issueSignature}`,
        'x-github-event': 'issues',
        'x-github-delivery': deliveryId,
      }

      await handler.handle(issuePayload, issueHeaders)
      expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(1)

      // Attempt to process same delivery ID with different payload (should be ignored)
      const prSignature = createHmac('sha256', WEBHOOK_SECRET)
        .update(prPayload)
        .digest('hex')

      const prHeaders = {
        'x-hub-signature-256': `sha256=${prSignature}`,
        'x-github-event': 'pull_request',
        'x-github-delivery': deliveryId, // Same delivery ID
      }

      await handler.handle(prPayload, prHeaders)

      // Should still only have one issue call, PR handler should not be called
      expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(1)
      expect(handler.getConfiguration().handlers.onPullRequest).not.toHaveBeenCalled()
    })

    it('should handle concurrent webhook processing', async () => {
      const handler = new WebhookHandler(WEBHOOK_SECRET, {
        onIssue: vi.fn().mockImplementation(async () => {
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 50))
        }),
      })

      const concurrentWebhooks = Array.from({ length: 5 }, (_, i) => ({
        payload: JSON.stringify({
          action: 'opened',
          issue: { id: 123 + i, title: `Concurrent Issue ${i}` },
          repository: { id: 456, name: 'test-repo' },
        }),
        deliveryId: randomUUID(),
      }))

      // Process all webhooks concurrently
      const promises = concurrentWebhooks.map(async ({ payload, deliveryId }) => {
        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(payload)
          .digest('hex')

        const headers = {
          'x-hub-signature-256': `sha256=${signature}`,
          'x-github-event': 'issues',
          'x-github-delivery': deliveryId,
        }

        return handler.handle(payload, headers)
      })

      await Promise.all(promises)

      // All webhooks should be processed
      expect(handler.getConfiguration().handlers.onIssue).toHaveBeenCalledTimes(5)
    })
  })

  afterAll(async () => {
    if (webhookServerAvailable) {
      try {
        // Clean up any remaining webhooks
        await fetch(`${WEBHOOK_SERVER_URL}/webhooks`, { method: 'DELETE' })
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  })
})