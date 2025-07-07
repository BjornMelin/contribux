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

import { NextRequest } from 'next/server'
import { 
  createWebhookValidator, 
  createWebhookSecurityResponse,
  type WebhookSecurityResult 
} from '@/lib/security/webhook-security'
import { GitHubWebhookPayload } from '@/types/github-integration'

// Initialize webhook security validator
const webhookValidator = createWebhookValidator()

/**
 * Handle GitHub webhook POST requests with comprehensive security
 */
export async function POST(request: NextRequest) {
  let securityResult: WebhookSecurityResult

  try {
    // Comprehensive security validation
    securityResult = await webhookValidator.validateWebhook(request)
    
    if (!securityResult.success) {
      // Return appropriate security response
      return createWebhookSecurityResponse(securityResult)
    }

    // Extract validated data
    const { event, deliveryId, payload } = securityResult
    
    if (!event || !deliveryId || !payload) {
      return createWebhookSecurityResponse({
        success: false,
        error: 'Missing required webhook data after validation',
      })
    }

    // Process webhook based on event type
    const processResult = await processWebhookEvent(event, payload as GitHubWebhookPayload, deliveryId)
    
    if (!processResult.success) {
      return createWebhookSecurityResponse({
        success: false,
        error: processResult.error,
        deliveryId,
      })
    }

    // Log successful processing
    console.log(`[WEBHOOK] Successfully processed ${event} event ${deliveryId}`)

    return createWebhookSecurityResponse(
      { success: true, event, deliveryId },
      `Successfully processed ${event} event`
    )

  } catch (error) {
    // Handle unexpected errors securely
    const errorMessage = error instanceof Error ? error.message : 'Webhook processing failed'
    
    console.error('[WEBHOOK] Unexpected error:', error)
    
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
        console.warn(`[WEBHOOK] Unhandled event type: ${event}`)
        return { success: true } // Don't fail for unknown events
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Event processing failed'
    console.error(`[WEBHOOK] Error processing ${event} event:`, error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Handle ping events (webhook setup verification)
 */
async function handlePingEvent(
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Ping received from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Push event from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Pull request ${payload.action} from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Issue ${payload.action} from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Issue comment ${payload.action} from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Repository ${payload.action} - ${payload.repository.full_name} - ${deliveryId}`)
  
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
  event: string,
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Repository ${event} event from ${payload.repository.full_name} - ${deliveryId}`)
  
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
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[WEBHOOK] Release ${payload.action} from ${payload.repository.full_name} - ${deliveryId}`)
  
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