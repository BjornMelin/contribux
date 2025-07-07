/**
 * Webhook Error Boundary
 * Specialized error handling for webhook processing with circuit breaker
 */

import { NextRequest, NextResponse } from 'next/server'
import { CircuitBreaker } from '@/lib/security/error-boundaries'
import { ErrorClassifier, ErrorCategory, ErrorSeverity } from './error-classification'
import { ErrorRecoveryManager } from './error-recovery'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'

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

// Circuit breaker configuration for webhooks
const WEBHOOK_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  onOpen: () => {
    console.error('[WebhookBoundary] Circuit breaker opened - webhook processing disabled')
  },
  onClose: () => {
    console.log('[WebhookBoundary] Circuit breaker closed - webhook processing resumed')
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
  return webhookCircuitBreakers.get(source)!
}

/**
 * Webhook error boundary wrapper
 */
export async function withWebhookErrorBoundary<T>(
  operation: () => Promise<T>,
  context: {
    event: string
    deliveryId: string
    repository?: string
    source?: string
    attemptNumber?: number
  }
): Promise<WebhookResult> {
  const circuitBreaker = getWebhookCircuitBreaker(context.source || 'github')
  
  try {
    // Check circuit breaker first
    await circuitBreaker.execute(async () => {
      await operation()
    })
    
    // Log successful processing
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
    
    return {
      success: true,
      deliveryId: context.deliveryId,
      event: context.event,
    }
  } catch (error) {
    // Classify the error
    const classification = ErrorClassifier.classify(error)
    
    // Create webhook-specific error
    const webhookError: WebhookError = error instanceof Error ? error : new Error(String(error))
    webhookError.webhookEvent = context.event
    webhookError.deliveryId = context.deliveryId
    webhookError.repository = context.repository
    webhookError.attemptNumber = context.attemptNumber || 1
    webhookError.isRetryable = classification.isTransient
    
    // Log error with classification
    await auditLogger.log({
      type: AuditEventType.WEBHOOK_RECEIVED,
      severity: classification.severity === ErrorSeverity.CRITICAL 
        ? AuditSeverity.CRITICAL 
        : classification.severity === ErrorSeverity.HIGH 
          ? AuditSeverity.ERROR 
          : AuditSeverity.WARNING,
      actor: {
        id: context.source || 'github',
        type: 'system',
      },
      action: `Failed to process ${context.event} webhook`,
      result: 'error',
      reason: webhookError.message,
      metadata: {
        ...ErrorRecoveryManager.formatForLogging(error, classification),
        event: context.event,
        repository: context.repository,
        attemptNumber: context.attemptNumber || 1,
        isRetryable: classification.isTransient,
        deliveryId: context.deliveryId,
      },
    })
    
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
  private queue: Map<string, {
    webhook: WebhookError
    context: any
    retryCount: number
    nextRetryTime: number
  }> = new Map()
  
  private processingTimer?: NodeJS.Timeout
  
  /**
   * Add webhook to retry queue
   */
  async enqueue(
    error: WebhookError,
    context: any,
    retryDelay: number
  ): Promise<void> {
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
    const readyWebhooks = Array.from(this.queue.entries())
      .filter(([_, item]) => item.nextRetryTime <= now)
    
    for (const [queueId, item] of readyWebhooks) {
      // Remove from queue
      this.queue.delete(queueId)
      
      // Log retry attempt
      console.log(`[WebhookRetry] Retrying webhook ${item.webhook.deliveryId} (attempt ${item.retryCount + 1})`)
      
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
 * Get webhook circuit breaker status
 */
export function getWebhookCircuitBreakerStatus(): Record<string, {
  state: 'closed' | 'open' | 'half-open'
  failures: number
}> {
  const status: Record<string, any> = {}
  
  for (const [source, breaker] of webhookCircuitBreakers) {
    // Access private properties for monitoring (in real implementation, expose via public method)
    status[source] = {
      state: (breaker as any).state,
      failures: (breaker as any).failures,
    }
  }
  
  return status
}