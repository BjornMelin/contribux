/**
 * GitHub Webhook API Endpoint
 *
 * Secure webhook handler implementing comprehensive security measures:
 * - HMAC signature verification with timing-safe comparison
 * - Rate limiting and abuse protection
 * - Payload validation and sanitization
 * - Security event logging and monitoring
 * - Proper error handling and responses
 */

import type { NextRequest } from 'next/server'
import { ErrorClassifier } from '@/lib/errors/error-classification'
import { errorMonitor } from '@/lib/errors/error-monitoring'
import {
  createWebhookErrorResponse,
  type WebhookError,
  webhookRetryQueue,
  withWebhookErrorBoundary,
} from '@/lib/errors/webhook-error-boundary'
import {
  createWebhookSecurityResponse,
  createWebhookValidator,
  type WebhookSecurityResult,
} from '@/lib/security/webhook-security'
import type { GitHubWebhookPayload } from '@/types/github-integration'

// Lazy-load webhook security validator to avoid module initialization issues
let webhookValidator: ReturnType<typeof createWebhookValidator> | null = null

function getWebhookValidator() {
  if (!webhookValidator) {
    webhookValidator = createWebhookValidator()
  }
  return webhookValidator
}

/**
 * Handle GitHub webhook POST requests with comprehensive security and error handling
 */
export async function POST(request: NextRequest) {
  let securityResult: WebhookSecurityResult
  let deliveryId: string | undefined
  let event: string | undefined

  try {
    // Comprehensive security validation (lazy-loaded)
    const validator = getWebhookValidator()
    securityResult = await validator.validateWebhook(request)

    if (!securityResult.success) {
      // Return appropriate security response
      return createWebhookSecurityResponse(securityResult)
    }

    // Extract validated data
    deliveryId = securityResult.deliveryId
    event = securityResult.event
    const payload = securityResult.payload

    if (!event || !deliveryId || !payload) {
      return createWebhookSecurityResponse({
        success: false,
        error: 'Missing required webhook data after validation',
      })
    }

    // Process webhook with error boundary
    const result = await withWebhookErrorBoundary(
      async () => {
        // Process webhook based on event type
        const processResult = await processWebhookEvent(
          event as string,
          payload as GitHubWebhookPayload,
          deliveryId || 'unknown'
        )

        if (!processResult.success) {
          throw new Error(processResult.error || 'Webhook processing failed')
        }

        return processResult
      },
      {
        event,
        deliveryId,
        repository: (payload as GitHubWebhookPayload)?.repository?.full_name,
        source: 'github',
        attemptNumber: 1,
      }
    )

    // Handle retry if needed
    if (!result.success && result.retryable && result.nextRetryDelay) {
      const webhookError = new Error(result.error || 'Webhook processing failed') as WebhookError
      webhookError.webhookEvent = event
      webhookError.deliveryId = deliveryId
      webhookError.repository = (payload as GitHubWebhookPayload)?.repository?.full_name
      webhookError.attemptNumber = 1
      webhookError.isRetryable = true

      await webhookRetryQueue.enqueue(
        webhookError,
        {
          event,
          deliveryId,
          repository: (payload as GitHubWebhookPayload)?.repository?.full_name,
          source: 'github',
          attemptNumber: 1,
        },
        result.nextRetryDelay
      )
    }

    return createWebhookErrorResponse(result)
  } catch (error) {
    // Track unexpected errors
    const classification = ErrorClassifier.classify(error)

    await errorMonitor.track(error, classification, {
      url: request.url,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        event,
        deliveryId,
        source: 'github-webhook',
      },
    })

    return createWebhookSecurityResponse({
      success: false,
      error: 'Internal webhook processing error',
      securityFlags: {
        suspiciousActivity: true,
        rateLimit: false,
        invalidSignature: false,
        payloadTooLarge: false,
        eventNotAllowed: false,
      },
    })
  }
}

/**
 * Process webhook events based on type
 */
async function processWebhookEvent(
  event: string,
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (event) {
      case 'ping':
        return await handlePingEvent(payload, deliveryId)

      case 'push':
        return await handlePushEvent(payload, deliveryId)

      case 'pull_request':
        return await handlePullRequestEvent(payload, deliveryId)

      case 'issues':
        return await handleIssuesEvent(payload, deliveryId)

      case 'issue_comment':
        return await handleIssueCommentEvent(payload, deliveryId)

      case 'repository':
        return await handleRepositoryEvent(payload, deliveryId)

      case 'star':
      case 'watch':
      case 'fork':
        return await handleRepositoryActivityEvent(event, payload, deliveryId)

      case 'release':
        return await handleReleaseEvent(payload, deliveryId)

      default:
        return { success: true } // Don't fail for unknown events
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Event processing failed'
    return { success: false, error: errorMessage }
  }
}

/**
 * Handle ping events (webhook setup verification)
 */
async function handlePingEvent(
  payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // Validate that we can process the repository
  if (!payload.repository?.full_name) {
    return { success: false, error: 'Invalid repository data in ping event' }
  }

  // Ping events don't require database operations, just acknowledge
  return { success: true }
}

/**
 * Handle push events (new commits)
 */
async function handlePushEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Update repository metadata
  // - Trigger re-analysis of opportunities
  // - Update health scores based on activity

  // For now, just log and acknowledge
  return { success: true }
}

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Update opportunity counts when PRs are opened/closed
  // - Track contributor activity
  // - Update repository health metrics

  return { success: true }
}

/**
 * Handle issues events (created, updated, closed, etc.)
 */
async function handleIssuesEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Add new opportunities when issues are created
  // - Update opportunities when issues are modified
  // - Remove opportunities when issues are closed
  // - Update difficulty/labels based on changes

  return { success: true }
}

/**
 * Handle issue comment events
 */
async function handleIssueCommentEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Update issue activity timestamps
  // - Track community engagement
  // - Update maintainer response metrics

  return { success: true }
}

/**
 * Handle repository events (created, updated, etc.)
 */
async function handleRepositoryEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Add new repositories to the database
  // - Update repository metadata
  // - Trigger initial health analysis

  return { success: true }
}

/**
 * Handle repository activity events (stars, watches, forks)
 */
async function handleRepositoryActivityEvent(
  _event: string,
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Update star/fork/watch counts
  // - Update repository popularity metrics
  // - Trigger health score recalculation

  return { success: true }
}

/**
 * Handle release events
 */
async function handleReleaseEvent(
  _payload: GitHubWebhookPayload,
  _deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  // In a real implementation, you might:
  // - Update repository activity metrics
  // - Track release frequency for health scores
  // - Update "latest release" information

  return { success: true }
}

/**
 * Handle unsupported HTTP methods
 */
export async function GET() {
  return createWebhookSecurityResponse({
    success: false,
    error: 'Method not allowed. Webhooks must use POST.',
  })
}

export async function PUT() {
  return createWebhookSecurityResponse({
    success: false,
    error: 'Method not allowed. Webhooks must use POST.',
  })
}

export async function DELETE() {
  return createWebhookSecurityResponse({
    success: false,
    error: 'Method not allowed. Webhooks must use POST.',
  })
}
