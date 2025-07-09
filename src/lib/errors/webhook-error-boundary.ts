/**
 * Webhook Error Boundary
 * Specialized error handling for webhook processing with circuit breaker
 */

import { NextResponse } from 'next/server'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { CircuitBreaker } from '@/lib/security/error-boundaries'
import { ErrorClassifier, ErrorSeverity } from './error-classification'
import { ErrorRecoveryManager } from './error-recovery'

// Webhook error types
export interface WebhookError extends Error {
  webhookEvent?: string
  deliveryId?: string
  repository?: string
  attemptNumber?: number
  isRetryable?: boolean
}

// Webhook processing result
export interface WebhookResult {
  success: boolean
  error?: string
  deliveryId?: string
  event?: string
  retryable?: boolean
  nextRetryDelay?: number
}

// Webhook context type for better type safety
export interface WebhookContext {
  event: string
  deliveryId: string
  repository?: string
  source?: string
  attemptNumber?: number
}

// Circuit breaker status interface
interface CircuitBreakerStatus {
  state: 'closed' | 'open' | 'half-open'
  failures: number
}

// Circuit breaker configuration for webhooks
const WEBHOOK_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  onOpen: () => {
    // Circuit breaker opened - could log or emit metrics here
  },
  onClose: () => {
    // Circuit breaker closed - could log recovery here
  },
}

// Global circuit breakers for different webhook sources
const webhookCircuitBreakers = new Map<string, CircuitBreaker>()

/**
 * Get or create circuit breaker for a webhook source
 */
function getWebhookCircuitBreaker(source: string): CircuitBreaker {
  if (!webhookCircuitBreakers.has(source)) {
    webhookCircuitBreakers.set(source, new CircuitBreaker(WEBHOOK_CIRCUIT_BREAKER_CONFIG))
  }
  const breaker = webhookCircuitBreakers.get(source)
  if (!breaker) {
    throw new Error(`Failed to create circuit breaker for source: ${source}`)
  }
  return breaker
}

/**
 * Log successful webhook processing
 */
async function logWebhookSuccess(context: WebhookContext): Promise<void> {
  await auditLogger.log({
    type: AuditEventType.WEBHOOK_RECEIVED,
    severity: AuditSeverity.INFO,
    actor: {
      id: context.source || 'github',
      type: 'system',
    },
    action: `Processed ${context.event} webhook`,
    result: 'success',
    metadata: {
      event: context.event,
      repository: context.repository,
      attemptNumber: context.attemptNumber || 1,
      deliveryId: context.deliveryId,
    },
  })
}

/**
 * Create webhook-specific error from generic error
 */
function createWebhookError(
  error: unknown,
  context: WebhookContext,
  classification: ReturnType<typeof ErrorClassifier.classify>
): WebhookError {
  const webhookError: WebhookError = error instanceof Error ? error : new Error(String(error))
  webhookError.webhookEvent = context.event
  webhookError.deliveryId = context.deliveryId
  webhookError.repository = context.repository
  webhookError.attemptNumber = context.attemptNumber || 1
  webhookError.isRetryable = classification.isTransient
  return webhookError
}

/**
 * Log webhook processing error
 */
async function logWebhookError(
  webhookError: WebhookError,
  context: WebhookContext,
  classification: ReturnType<typeof ErrorClassifier.classify>
): Promise<void> {
  const severityMap: Record<ErrorSeverity, AuditSeverity> = {
    [ErrorSeverity.CRITICAL]: AuditSeverity.CRITICAL,
    [ErrorSeverity.HIGH]: AuditSeverity.ERROR,
    [ErrorSeverity.MEDIUM]: AuditSeverity.WARNING,
    [ErrorSeverity.LOW]: AuditSeverity.INFO,
  }

  await auditLogger.log({
    type: AuditEventType.WEBHOOK_RECEIVED,
    severity: severityMap[classification.severity],
    actor: {
      id: context.source || 'github',
      type: 'system',
    },
    action: `Failed to process ${context.event} webhook`,
    result: 'error',
    reason: webhookError.message,
    metadata: {
      ...ErrorRecoveryManager.formatForLogging(webhookError, classification),
      event: context.event,
      repository: context.repository,
      attemptNumber: context.attemptNumber || 1,
      isRetryable: classification.isTransient,
      deliveryId: context.deliveryId,
    },
  })
}

/**
 * Webhook error boundary wrapper
 */
export async function withWebhookErrorBoundary<T>(
  operation: () => Promise<T>,
  context: WebhookContext
): Promise<WebhookResult> {
  const circuitBreaker = getWebhookCircuitBreaker(context.source || 'github')

  try {
    // Execute operation through circuit breaker
    await circuitBreaker.execute(async () => {
      await operation()
    })

    // Log successful processing
    await logWebhookSuccess(context)

    return {
      success: true,
      deliveryId: context.deliveryId,
      event: context.event,
    }
  } catch (error) {
    // Classify and handle error
    const classification = ErrorClassifier.classify(error)
    const webhookError = createWebhookError(error, context, classification)

    // Log error
    await logWebhookError(webhookError, context, classification)

    // Calculate retry delay if applicable
    const nextRetryDelay = ErrorClassifier.shouldRetry(classification)
      ? ErrorClassifier.getRetryDelay(classification, (context.attemptNumber || 0) + 1)
      : undefined

    return {
      success: false,
      error: classification.userMessage,
      deliveryId: context.deliveryId,
      event: context.event,
      retryable: classification.isTransient,
      nextRetryDelay,
    }
  }
}

/**
 * Create webhook error response with proper status codes
 */
export function createWebhookErrorResponse(result: WebhookResult): NextResponse {
  if (result.success) {
    return NextResponse.json(
      {
        success: true,
        message: `Successfully processed ${result.event} event`,
        deliveryId: result.deliveryId,
      },
      {
        status: 200,
        headers: {
          'X-Webhook-Delivery-ID': result.deliveryId || '',
        },
      }
    )
  }

  // Determine appropriate status code based on error type
  let statusCode = 500
  if (!result.retryable) {
    statusCode = 400 // Bad request for non-retryable errors
  } else if (result.nextRetryDelay && result.nextRetryDelay > 0) {
    statusCode = 503 // Service unavailable for retryable errors
  }

  const response = NextResponse.json(
    {
      success: false,
      error: result.error,
      deliveryId: result.deliveryId,
      retryable: result.retryable,
    },
    {
      status: statusCode,
      headers: {
        'X-Webhook-Delivery-ID': result.deliveryId || '',
        ...(result.nextRetryDelay && {
          'Retry-After': String(Math.ceil(result.nextRetryDelay / 1000)),
        }),
      },
    }
  )

  return response
}

/**
 * Webhook retry queue for failed webhooks
 */
export class WebhookRetryQueue {
  private queue: Map<
    string,
    {
      webhook: WebhookError
      context: WebhookContext
      retryCount: number
      nextRetryTime: number
    }
  > = new Map()

  private processingTimer?: NodeJS.Timeout

  /**
   * Add webhook to retry queue
   */
  async enqueue(error: WebhookError, context: WebhookContext, retryDelay: number): Promise<void> {
    const queueId = `${error.deliveryId}-${error.attemptNumber}`

    this.queue.set(queueId, {
      webhook: error,
      context,
      retryCount: error.attemptNumber || 1,
      nextRetryTime: Date.now() + retryDelay,
    })

    // Start processing if not already running
    if (!this.processingTimer) {
      this.startProcessing()
    }
  }

  /**
   * Start processing retry queue
   */
  private startProcessing(): void {
    this.processingTimer = setInterval(() => {
      this.processQueue()
    }, 5000) // Check every 5 seconds
  }

  /**
   * Process webhooks ready for retry
   */
  private async processQueue(): Promise<void> {
    const now = Date.now()
    const readyWebhooks = Array.from(this.queue.entries()).filter(
      ([_, item]) => item.nextRetryTime <= now
    )

    for (const [queueId, item] of readyWebhooks) {
      // Remove from queue
      this.queue.delete(queueId)

      // Emit retry event for processing
      // In a real implementation, this would trigger the webhook handler
      // For now, we'll just log it
      await auditLogger.log({
        type: AuditEventType.WEBHOOK_RECEIVED,
        severity: AuditSeverity.INFO,
        actor: {
          id: 'system',
          type: 'system',
        },
        action: `Retrying ${item.webhook.webhookEvent} webhook`,
        result: 'failure',
        metadata: {
          attemptNumber: item.retryCount + 1,
          event: item.webhook.webhookEvent,
          repository: item.webhook.repository,
          deliveryId: item.webhook.deliveryId || '',
        },
      })
    }

    // Stop processing if queue is empty
    if (this.queue.size === 0 && this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = undefined
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueSize: number
    oldestItem?: { deliveryId: string; waitTime: number }
  } {
    const stats = {
      queueSize: this.queue.size,
      oldestItem: undefined as { deliveryId: string; waitTime: number } | undefined,
    }

    if (this.queue.size > 0) {
      const now = Date.now()
      let oldestTime = Number.MAX_SAFE_INTEGER
      let oldestDeliveryId = ''

      for (const [_, item] of this.queue) {
        if (item.nextRetryTime < oldestTime) {
          oldestTime = item.nextRetryTime
          oldestDeliveryId = item.webhook.deliveryId || ''
        }
      }

      stats.oldestItem = {
        deliveryId: oldestDeliveryId,
        waitTime: Math.max(0, oldestTime - now),
      }
    }

    return stats
  }
}

// Global retry queue instance
export const webhookRetryQueue = new WebhookRetryQueue()

/**
 * Safely extract circuit breaker state
 */
function extractCircuitBreakerState(breaker: CircuitBreaker): CircuitBreakerStatus {
  // Safe fallback approach - try to access common properties or use defaults
  try {
    const breakerWithState = breaker as unknown as { state?: string; failures?: number }
    return {
      state: (breakerWithState.state as CircuitBreakerStatus['state']) || 'closed',
      failures: breakerWithState.failures || 0,
    }
  } catch {
    // Fallback to safe defaults if property access fails
    return {
      state: 'closed',
      failures: 0,
    }
  }
}

/**
 * Get webhook circuit breaker status
 */
export function getWebhookCircuitBreakerStatus(): Record<string, CircuitBreakerStatus> {
  const status: Record<string, CircuitBreakerStatus> = {}

  for (const [source, breaker] of webhookCircuitBreakers) {
    status[source] = extractCircuitBreakerState(breaker)
  }

  return status
}
