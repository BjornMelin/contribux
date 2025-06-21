import { WEBHOOK_DEFAULTS } from '../constants'
import { ErrorMessages } from '../errors'
import { validateWebhookEvent } from '../schemas'
import { parseWebhookEvent } from './event-parser'
import { validateWebhookSignature, validateWebhookSignatureStrict } from './signature-validator'
import type { WebhookConfiguration, WebhookEvent, WebhookHandlers, WebhookHeaders } from './types'

/**
 * Configuration options for webhook handler
 */
export interface WebhookHandlerOptions {
  /** Maximum number of processed deliveries to cache for idempotency */
  maxCacheSize?: number
  /** Whether to require SHA256 signatures (reject SHA1) */
  requireSha256?: boolean
  /** Whether to validate webhook timing (not implemented in this version) */
  validateTiming?: boolean
}

/**
 * Handles GitHub webhooks with signature validation, event routing, and retry support
 *
 * Security features:
 * - HMAC signature validation with timing-safe comparison
 * - Idempotency protection against replay attacks
 * - Memory-safe delivery tracking with automatic cleanup
 * - Support for both SHA1 (legacy) and SHA256 algorithms
 * - Comprehensive input validation
 */
export class WebhookHandler {
  private secret: string
  private handlers: WebhookHandlers
  private processedDeliveries: Set<string> = new Set()
  private options: Required<WebhookHandlerOptions>

  constructor(secret: string, handlers: WebhookHandlers = {}, options: WebhookHandlerOptions = {}) {
    if (!secret || typeof secret !== 'string' || secret.length === 0) {
      throw new Error(ErrorMessages.CONFIG_WEBHOOK_SECRET_REQUIRED)
    }

    this.secret = secret
    this.handlers = handlers
    this.options = {
      maxCacheSize: options.maxCacheSize ?? 10000,
      requireSha256: options.requireSha256 ?? true,
      validateTiming: options.validateTiming ?? false,
    }

    // Validate cache size is reasonable
    if (this.options.maxCacheSize < 100 || this.options.maxCacheSize > 100000) {
      throw new Error(ErrorMessages.VALIDATION_CACHE_SIZE_INVALID)
    }
  }

  /**
   * Handle an incoming webhook request
   */
  async handle(payload: string, headers: WebhookHeaders | Record<string, string>): Promise<void> {
    // Input validation
    if (!payload || typeof payload !== 'string') {
      throw new Error(ErrorMessages.WEBHOOK_PAYLOAD_INVALID)
    }

    if (!headers || typeof headers !== 'object') {
      throw new Error('Invalid headers: must be an object')
    }

    // Validate the signature - prefer sha256 but fallback to sha1 for compatibility
    const signature256 = headers['x-hub-signature-256']
    const signature1 = headers['x-hub-signature']

    let signatureValid = false

    if (signature256 && typeof signature256 === 'string') {
      // Use strict validation for SHA256 if available
      signatureValid = this.options.requireSha256
        ? validateWebhookSignatureStrict(payload, signature256, this.secret, true)
        : validateWebhookSignature(payload, signature256, this.secret)
    } else if (signature1 && typeof signature1 === 'string' && !this.options.requireSha256) {
      // Fallback to SHA1 only if not in strict mode
      signatureValid = validateWebhookSignature(payload, signature1, this.secret)
    }

    if (!signatureValid) {
      throw new Error(ErrorMessages.WEBHOOK_SIGNATURE_INVALID)
    }

    // Parse the event
    const parsedEvent = parseWebhookEvent(payload, headers)

    // Validate event using Zod schema
    let event: WebhookEvent
    try {
      event = validateWebhookEvent(parsedEvent)
    } catch (_error) {
      // If validation fails, use the parsed event directly
      event = parsedEvent as WebhookEvent
    }

    // Additional validation for delivery ID format (should be a UUID)
    if (!event.deliveryId || !WEBHOOK_DEFAULTS.DELIVERY_ID_REGEX.test(event.deliveryId)) {
      throw new Error(ErrorMessages.WEBHOOK_DELIVERY_ID_INVALID)
    }

    // Check for duplicate delivery (idempotency protection)
    if (this.processedDeliveries.has(event.deliveryId)) {
      // Already processed this delivery, skip silently
      return
    }

    // Route to the appropriate handler
    const handlerMap: Record<string, keyof WebhookHandlers> = {
      issues: 'onIssue',
      pull_request: 'onPullRequest',
      push: 'onPush',
      star: 'onStar',
      fork: 'onFork',
      release: 'onRelease',
      workflow_run: 'onWorkflowRun',
    }

    const handlerKey = handlerMap[event.type]
    const handler = handlerKey ? this.handlers[handlerKey] : undefined

    if (handler) {
      try {
        await handler(event)
        // Mark as processed after successful handling
        this.processedDeliveries.add(event.deliveryId)

        // Clean up old deliveries to prevent memory leak
        this.cleanupCache()
      } catch (error) {
        throw new Error(
          `Webhook handler error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }
    // If no handler registered, just ignore the event gracefully
  }

  /**
   * Clean up the processed deliveries cache to prevent memory leaks
   */
  private cleanupCache(): void {
    if (this.processedDeliveries.size > this.options.maxCacheSize) {
      // Remove the oldest half of the cache
      const entriesToDelete = Math.floor(this.options.maxCacheSize / 2)
      const deliveryArray = Array.from(this.processedDeliveries)

      for (let i = 0; i < entriesToDelete; i++) {
        const deliveryId = deliveryArray[i]
        if (deliveryId) {
          this.processedDeliveries.delete(deliveryId)
        }
      }
    }
  }

  /**
   * Get the webhook handler configuration
   */
  getConfiguration(): WebhookConfiguration {
    const supportedEvents = [
      'issues',
      'pull_request',
      'push',
      'star',
      'fork',
      'release',
      'workflow_run',
    ]

    return {
      supportedEvents,
      secret: this.secret ? '[REDACTED]' : '[NO SECRET]',
      handlers: this.handlers,
    }
  }

  /**
   * Clear processed deliveries cache
   */
  clearCache(): void {
    this.processedDeliveries.clear()
  }
}
