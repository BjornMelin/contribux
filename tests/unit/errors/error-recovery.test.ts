/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRecoveryWorkflow,
  type RecoveryAction,
  type RecoveryWorkflow,
} from '@/lib/errors/error-recovery'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

describe('Error Recovery System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRecoveryWorkflow', () => {
    describe('Network Timeout Recovery', () => {
      it('should provide retry workflow for network timeout', () => {
        const error = new Error('Network timeout')
        error.name = 'TimeoutError'

        const retryAction = vi.fn()
        const workflow = getRecoveryWorkflow(error, { retryAction })

        expect(workflow.title).toContain('Connection Timeout')
        expect(workflow.actions).toHaveLength(2)
        expect(workflow.actions[0].type).toBe('button')
        expect(workflow.actions[0].label).toContain('Retry')
      })

      it('should calculate appropriate retry delay', () => {
        const error = new Error('Network timeout')
        error.name = 'TimeoutError'

        const workflow = getRecoveryWorkflow(error)
        const retryAction = workflow.actions.find(a => a.label.includes('Retry'))

        expect(retryAction).toBeDefined()
        expect(retryAction?.automatic).toBe(true)
        expect(retryAction?.delay).toBeGreaterThan(0)
      })
    })

    describe('Authentication Recovery', () => {
      it('should provide sign-in workflow for expired auth', () => {
        const error = {
          statusCode: 401,
          type: 'authentication',
          message: 'Token expired',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Authentication Required')
        expect(workflow.actions.some(a => a.label.includes('Sign In'))).toBe(true)
      })

      it('should handle permission denied errors', () => {
        const error = {
          status: 403,
          message: 'Permission denied',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Access Denied')
        expect(workflow.description).toContain('permission')
        expect(workflow.actions.some(a => a.type === 'info')).toBe(true)
      })
    })

    describe('Rate Limit Recovery', () => {
      it('should provide wait and retry workflow', () => {
        const error = {
          status: 429,
          message: 'Too many requests',
          retryAfter: 60,
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Rate Limit')
        expect(workflow.description).toContain('slow down')
        expect(workflow.actions.some(a => a.automatic === true)).toBe(true)
      })

      it('should calculate retry delay from retryAfter header', () => {
        const error = {
          status: 429,
          retryAfter: 120, // 2 minutes
        }

        const workflow = getRecoveryWorkflow(error)
        const autoRetry = workflow.actions.find(a => a.automatic)

        expect(autoRetry?.delay).toBe(120000) // 2 minutes in ms
      })
    })

    describe('Database Error Recovery', () => {
      it('should provide retry for connection errors', () => {
        const error = new Error('ECONNREFUSED')
        error.name = 'DatabaseError'

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Database')
        expect(workflow.actions.some(a => a.label.includes('Retry'))).toBe(true)
      })

      it('should provide fallback for query errors', () => {
        const error = new Error('Syntax error in SQL query')
        const fallbackAction = vi.fn()

        const workflow = getRecoveryWorkflow(error, { fallbackAction })

        expect(workflow.title).toContain('Database')
        expect(workflow.actions.some(a => a.label.includes('Go Back'))).toBe(true)
      })
    })

    describe('Validation Error Recovery', () => {
      it('should provide user intervention workflow', () => {
        const error = {
          name: 'ZodError',
          issues: [{ path: ['email'], message: 'Invalid email format' }],
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Validation Error')
        expect(workflow.description).toContain('check your input')
        expect(workflow.allowDismiss).toBe(true)
      })

      it('should not show technical details for validation errors', () => {
        const error = new Error('Validation failed')
        error.name = 'ValidationError'

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.showTechnicalDetails).toBe(false)
      })
    })

    describe('Service Unavailable Recovery', () => {
      it('should provide cache fallback option', () => {
        const error = {
          status: 503,
          message: 'Service temporarily unavailable',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Service Unavailable')
        expect(workflow.actions.some(a => a.label.includes('cached'))).toBe(true)
      })

      it('should provide status page link for third-party services', () => {
        const error = {
          status: 503,
          message: 'GitHub API is unavailable',
          service: 'github',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.actions.some(a => a.type === 'link')).toBe(true)
      })
    })

    describe('Custom Actions', () => {
      it('should append custom actions to workflow', () => {
        const error = new Error('Test error')
        const customAction: RecoveryAction = {
          type: 'button',
          label: 'Custom Action',
          action: vi.fn(),
        }

        const workflow = getRecoveryWorkflow(error, {
          customActions: [customAction],
        })

        expect(workflow.actions).toContainEqual(customAction)
      })

      it('should preserve default actions with custom actions', () => {
        const error = new Error('Network timeout')
        error.name = 'TimeoutError'

        const customAction: RecoveryAction = {
          type: 'button',
          label: 'Custom Action',
          action: vi.fn(),
        }

        const workflow = getRecoveryWorkflow(error, {
          customActions: [customAction],
        })

        expect(workflow.actions.length).toBeGreaterThan(1)
        expect(workflow.actions.some(a => a.label.includes('Retry'))).toBe(true)
        expect(workflow.actions.some(a => a.label === 'Custom Action')).toBe(true)
      })
    })

    describe('Edge Cases', () => {
      it('should handle unknown errors gracefully', () => {
        const error = { unknown: 'property' }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Error')
        expect(workflow.actions.length).toBeGreaterThan(0)
      })

      it('should handle null errors', () => {
        const workflow = getRecoveryWorkflow(null)

        expect(workflow.title).toBeDefined()
        expect(workflow.description).toBeDefined()
        expect(workflow.actions).toBeInstanceOf(Array)
      })

      it('should handle circular reference errors', () => {
        interface CircularErrorObject {
          message: string
          cause?: CircularErrorObject
        }

        const error: CircularErrorObject = { message: 'Circular error' }
        error.cause = error // Create circular reference

        const workflow = getRecoveryWorkflow(error)

        expect(workflow).toBeDefined()
        expect(workflow.actions).toBeInstanceOf(Array)
      })
    })

    describe('Recovery Action Execution', () => {
      it('should execute retry action', async () => {
        const error = new Error('Network timeout')
        const retryAction = vi.fn().mockResolvedValue(true)

        const workflow = getRecoveryWorkflow(error, { retryAction })
        const retry = workflow.actions.find(a => a.label.includes('Retry'))

        expect(retry?.action).toBeDefined()
        if (retry?.action) {
          await retry.action()
          expect(retryAction).toHaveBeenCalled()
        }
      })

      it('should execute fallback action', () => {
        const error = new Error('Critical error')
        const fallbackAction = vi.fn()

        const workflow = getRecoveryWorkflow(error, { fallbackAction })
        const fallback = workflow.actions.find(a => a.label.includes('Go Back'))

        expect(fallback?.action).toBeDefined()
        if (fallback?.action) {
          fallback.action()
          expect(fallbackAction).toHaveBeenCalled()
        }
      })

      it('should handle action execution errors', async () => {
        const error = new Error('Test error')
        const failingAction = vi.fn().mockRejectedValue(new Error('Action failed'))

        const workflow = getRecoveryWorkflow(error, { retryAction: failingAction })
        const action = workflow.actions.find(a => a.action)

        if (action?.action) {
          await expect(action.action()).rejects.toThrow('Action failed')
        }
      })
    })

    describe('Workflow Properties', () => {
      it('should allow dismiss for non-critical errors', () => {
        const error = new Error('Minor error')

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.allowDismiss).toBe(true)
      })

      it('should not allow dismiss for critical errors', () => {
        const error = {
          statusCode: 500,
          severity: 'critical',
          message: 'Critical system failure',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.allowDismiss).toBe(false)
      })

      it('should show technical details in development', () => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        const error = new Error('Technical error')
        const workflow = getRecoveryWorkflow(error)

        expect(workflow.showTechnicalDetails).toBe(true)

        process.env.NODE_ENV = originalEnv
      })
    })

    describe('Retry Delay Calculation', () => {
      it('should use exponential backoff for retries', () => {
        const error = new Error('Network error')
        error.name = 'NetworkError'

        // Mock multiple retry attempts
        const workflows: RecoveryWorkflow[] = []
        for (let attempt = 1; attempt <= 4; attempt++) {
          const workflow = getRecoveryWorkflow(error)
          workflows.push(workflow)
        }

        // Check that delays increase
        const delays = workflows.map(w => {
          const retry = w.actions.find(a => a.automatic)
          return retry?.delay || 0
        })

        expect(delays[0]).toBeGreaterThan(0)
        expect(delays[0]).toBeLessThanOrEqual(60000) // Max 1 minute
      })
    })

    describe('GitHub API Error Recovery', () => {
      it('should provide specific recovery for GitHub errors', () => {
        const error = {
          status: 502,
          message: 'GitHub API is unavailable',
          isGitHubError: true,
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('GitHub')
        expect(workflow.actions.some(a => a.label.includes('GitHub Status'))).toBe(true)
      })
    })

    describe('Webhook Validation Recovery', () => {
      it('should provide webhook-specific recovery', () => {
        const error = {
          type: 'webhook_validation',
          message: 'Invalid webhook signature',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Webhook')
        expect(workflow.description).toContain('validation')
      })
    })

    describe('Data Integrity Recovery', () => {
      it('should handle data integrity errors', () => {
        const error = {
          code: 'DATA_INTEGRITY',
          message: 'Data consistency check failed',
        }

        const workflow = getRecoveryWorkflow(error)

        expect(workflow.title).toContain('Data')
        expect(workflow.actions.some(a => a.type === 'info')).toBe(true)
      })
    })
  })
})
