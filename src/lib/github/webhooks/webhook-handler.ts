import { WEBHOOK_DEFAULTS } from '../constants'
import {
  ErrorMessages,
  GitHubWebhookError,
  GitHubWebhookPayloadError,
  GitHubWebhookSignatureError,
} from '../errors'
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
    try {
      // Validate secret
      if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
        throw new GitHubWebhookSignatureError(ErrorMessages.CONFIG_WEBHOOK_SECRET_REQUIRED)
      }

      // Validate secret strength (minimum 10 characters)
      if (secret.length < 10) {
        throw new GitHubWebhookSignatureError(ErrorMessages.WEBHOOK_SECRET_TOO_SHORT)
      }

      // Validate handlers object
      if (handlers && typeof handlers !== 'object') {
        throw new GitHubWebhookError('Handlers must be an object', 'parse-error')
      }

      // Validate options object
      if (options && typeof options !== 'object') {
        throw new GitHubWebhookError('Options must be an object', 'parse-error')
      }

      this.secret = secret.trim()
      this.handlers = handlers || {}
      this.options = {
        maxCacheSize: options.maxCacheSize ?? 10000,
        requireSha256: options.requireSha256 ?? true,
        validateTiming: options.validateTiming ?? false,
      }

      // Validate cache size is reasonable
      if (this.options.maxCacheSize < 100 || this.options.maxCacheSize > 100000) {
        throw new GitHubWebhookError(ErrorMessages.VALIDATION_CACHE_SIZE_INVALID, 'parse-error')
      }

      // Validate maxCacheSize is a positive integer
      if (!Number.isInteger(this.options.maxCacheSize) || this.options.maxCacheSize <= 0) {
        throw new GitHubWebhookError('Cache size must be a positive integer', 'parse-error')
      }
    } catch (error) {
      // Re-throw GitHubWebhookError as-is, wrap other errors
      if (error instanceof GitHubWebhookError) {
        throw error
      }
      throw new GitHubWebhookError(
        `Webhook handler initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'parse-error'
      )
    }
  }

  /**
   * Process an incoming GitHub webhook request with full validation and routing
   *
   * This method performs complete webhook processing including:
   * - Signature validation using HMAC-SHA256 or SHA1
   * - Payload size and format validation
   * - Idempotency protection against duplicate deliveries
   * - Event parsing and type detection
   * - Automatic routing to registered event handlers
   *
   * @param payload - Raw webhook payload as JSON string
   * @param headers - HTTP headers from the webhook request
   *
   * @throws {GitHubWebhookSignatureError} When signature validation fails
   * @throws {GitHubWebhookPayloadError} When payload is invalid or too large
   * @throws {GitHubWebhookError} When delivery is duplicate or processing fails
   *
   * @example
   * ```typescript
   * const handler = new WebhookHandler('your-webhook-secret', {
   *   push: async (event) => {
   *     console.log('Push to', event.payload.repository.full_name);
   *   },
   *   pull_request: async (event) => {
   *     console.log('PR', event.payload.action, '#' + event.payload.number);
   *   }
   * });
   *
   * // In your webhook endpoint
   * app.post('/webhook', async (req, res) => {
   *   try {
   *     await handler.handle(req.body, req.headers);
   *     res.status(200).send('OK');
   *   } catch (error) {
   *     console.error('Webhook error:', error.message);
   *     res.status(400).send('Bad Request');
   *   }
   * });
   * ```
   */
  async handle(payload: string, headers: WebhookHeaders | Record<string, string>): Promise<void> {
    try {
      // Input validation
      if (!payload || typeof payload !== 'string') {
        throw new GitHubWebhookPayloadError(
          ErrorMessages.WEBHOOK_PAYLOAD_INVALID,
          typeof payload === 'string' ? payload.length : 0
        )
      }

      if (!headers || typeof headers !== 'object') {
        throw new GitHubWebhookError('Invalid headers: must be an object', 'parse-error')
      }

      // Validate payload size (reasonable limit)
      if (payload.length === 0) {
        throw new GitHubWebhookPayloadError(ErrorMessages.WEBHOOK_PAYLOAD_EMPTY, 0)
      }

      if (payload.length > WEBHOOK_DEFAULTS.MAX_PAYLOAD_SIZE) {
        throw new GitHubWebhookPayloadError(
          ErrorMessages.WEBHOOK_PAYLOAD_TOO_LARGE(
            payload.length,
            WEBHOOK_DEFAULTS.MAX_PAYLOAD_SIZE
          ),
          payload.length
        )
      }

      // Validate the signature - prefer sha256 but fallback to sha1 for compatibility
      const signature256 = headers['x-hub-signature-256']
      const signature1 = headers['x-hub-signature']

      let signatureValid = false
      let usedSignature: string | undefined

      try {
        if (signature256 && typeof signature256 === 'string') {
          // Use strict validation for SHA256 if available
          signatureValid = this.options.requireSha256
            ? validateWebhookSignatureStrict(payload, signature256, this.secret, true)
            : validateWebhookSignature(payload, signature256, this.secret)
          usedSignature = signature256
        } else if (signature1 && typeof signature1 === 'string' && !this.options.requireSha256) {
          // Fallback to SHA1 only if not in strict mode
          signatureValid = validateWebhookSignature(payload, signature1, this.secret)
          usedSignature = signature1
        }
      } catch (signatureError) {
        throw new GitHubWebhookSignatureError(
          `Signature validation failed: ${signatureError instanceof Error ? signatureError.message : 'Unknown error'}`,
          undefined,
          usedSignature
        )
      }

      if (!signatureValid) {
        throw new GitHubWebhookSignatureError(
          ErrorMessages.WEBHOOK_SIGNATURE_INVALID,
          usedSignature?.split('=')[0],
          usedSignature
        )
      }

      if (!usedSignature) {
        throw new GitHubWebhookSignatureError(ErrorMessages.WEBHOOK_SIGNATURE_MISSING)
      }

      // Parse the event
      let parsedEvent: WebhookEvent
      try {
        parsedEvent = parseWebhookEvent(payload, headers)
      } catch (parseError) {
        // Re-throw GitHubWebhookError as-is, wrap other errors
        if (parseError instanceof GitHubWebhookError) {
          throw parseError
        }
        throw new GitHubWebhookError(
          `Event parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          'parse-error'
        )
      }

      // Validate event using Zod schema
      let event: WebhookEvent
      try {
        event = validateWebhookEvent(parsedEvent) as WebhookEvent
      } catch (validationError) {
        // Log validation error but continue with parsed event
        console.warn(
          'Webhook event validation failed:',
          validationError instanceof Error ? validationError.message : 'Unknown error'
        )
        event = parsedEvent as WebhookEvent
      }

      // Additional validation for delivery ID format (should be a UUID)
      if (!event.deliveryId || !WEBHOOK_DEFAULTS.DELIVERY_ID_REGEX.test(event.deliveryId)) {
        throw new GitHubWebhookError(ErrorMessages.WEBHOOK_DELIVERY_ID_INVALID, 'parse-error')
      }

      // Check for duplicate delivery (idempotency protection)
      if (this.processedDeliveries.has(event.deliveryId)) {
        // Log duplicate delivery but don't throw error (this is expected behavior)
        console.warn(ErrorMessages.WEBHOOK_DUPLICATE_DELIVERY(event.deliveryId))
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
        } catch (handlerError) {
          throw new GitHubWebhookError(
            ErrorMessages.WEBHOOK_HANDLER_EXECUTION_FAILED(
              event.type,
              handlerError instanceof Error ? handlerError.message : 'Unknown error'
            ),
            'handler-error'
          )
        }
      }
      // If no handler registered, just ignore the event gracefully
    } catch (error) {
      // Re-throw GitHubWebhookError as-is, wrap other errors
      if (error instanceof GitHubWebhookError) {
        throw error
      }
      throw new GitHubWebhookError(
        `Webhook handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'parse-error'
      )
    }
  }

  /**
   * Clean up the processed deliveries cache to prevent memory leaks
   */
  private cleanupCache(): void {
    try {
      if (this.processedDeliveries.size > this.options.maxCacheSize) {
        // Remove the oldest half of the cache
        const entriesToDelete = Math.floor(this.options.maxCacheSize / 2)
        const deliveryArray = Array.from(this.processedDeliveries)

        // Validate entriesToDelete to prevent infinite loops
        if (entriesToDelete <= 0 || entriesToDelete >= deliveryArray.length) {
          console.warn('Invalid cleanup parameters, clearing entire cache')
          this.processedDeliveries.clear()
          return
        }

        for (let i = 0; i < entriesToDelete; i++) {
          const deliveryId = deliveryArray[i]
          if (deliveryId) {
            this.processedDeliveries.delete(deliveryId)
          }
        }
      }
    } catch (error) {
      console.error(
        'Cache cleanup failed:',
        error instanceof Error ? error.message : 'Unknown error'
      )
      // Fallback: clear the entire cache if cleanup fails
      this.processedDeliveries.clear()
    }
  }

  /**
   * Get the current webhook handler configuration and capabilities
   *
   * Returns the handler's configuration including supported events,
   * registered handlers, and security settings (with sensitive data redacted).
   *
   * @returns Configuration object with supported events and handler status
   *
   * @example
   * ```typescript
   * const handler = new WebhookHandler(secret, {
   *   push: handlePush,
   *   pull_request: handlePR
   * });
   *
   * const config = handler.getConfiguration();
   * console.log('Supported events:', config.supportedEvents);
   * console.log('Has secret:', config.secret !== '[NO SECRET]');
   * console.log('Registered handlers:', Object.keys(config.handlers));
   * ```
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
   * Clear the cache of processed webhook deliveries
   *
   * This method clears the internal cache that tracks processed delivery IDs
   * for idempotency protection. Use carefully as it will allow previously
   * processed webhooks to be handled again.
   *
   * @example
   * ```typescript
   * const handler = new WebhookHandler(secret, handlers);
   *
   * // Clear cache during testing or maintenance
   * handler.clearCache();
   * console.log('Delivery cache cleared');
   *
   * // Or clear cache periodically in long-running applications
   * setInterval(() => {
   *   handler.clearCache();
   * }, 24 * 60 * 60 * 1000); // Daily cleanup
   * ```
   */
  clearCache(): void {
    try {
      this.processedDeliveries.clear()
    } catch (error) {
      console.error(
        'Failed to clear cache:',
        error instanceof Error ? error.message : 'Unknown error'
      )
      // Re-initialize the cache if clearing fails
      this.processedDeliveries = new Set()
    }
  }
}
