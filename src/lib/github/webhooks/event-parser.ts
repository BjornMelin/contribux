import { ErrorMessages, GitHubWebhookError, GitHubWebhookPayloadError } from '../errors'
import type { WebhookEvent, WebhookHeaders } from '../interfaces/webhooks'

/**
 * Parse GitHub webhook payload and headers into a structured event object
 *
 * This function performs comprehensive validation and parsing of GitHub webhook
 * data, including payload validation, header extraction, and event type detection.
 * It handles all standard GitHub webhook events with proper error handling.
 *
 * @param payload - Raw webhook payload as JSON string
 * @param headers - Webhook headers including event type and delivery ID
 * @returns Structured webhook event with parsed payload and metadata
 *
 * @throws {GitHubWebhookPayloadError} When payload is invalid or malformed
 * @throws {GitHubWebhookError} When required headers are missing or invalid
 *
 * @example
 * ```typescript
 * // Parse incoming webhook
 * try {
 *   const event = parseWebhookEvent(request.body, request.headers);
 *
 *   console.log('Event type:', event.eventType);
 *   console.log('Delivery ID:', event.deliveryId);
 *   console.log('Payload:', event.payload);
 *
 *   // Handle different event types
 *   switch (event.eventType) {
 *     case 'push':
 *       handlePushEvent(event.payload as PushPayload);
 *       break;
 *     case 'pull_request':
 *       handlePullRequestEvent(event.payload as PullRequestPayload);
 *       break;
 *   }
 * } catch (error) {
 *   if (error instanceof GitHubWebhookError) {
 *     console.error('Webhook parsing failed:', error.message);
 *   }
 * }
 * ```
 */
export function parseWebhookEvent(
  payload: string,
  headers: WebhookHeaders | Record<string, string>
): WebhookEvent {
  // Input validation
  if (typeof payload !== 'string') {
    throw new GitHubWebhookPayloadError(ErrorMessages.WEBHOOK_PAYLOAD_INVALID, 0)
  }

  if (!headers || typeof headers !== 'object') {
    throw new GitHubWebhookError(ErrorMessages.WEBHOOK_HEADERS_INVALID, 'parse-error')
  }

  // Validate payload length
  if (payload.length === 0) {
    throw new GitHubWebhookPayloadError(ErrorMessages.WEBHOOK_PAYLOAD_EMPTY, 0)
  }

  // Parse the JSON payload
  let parsedPayload: Record<string, unknown>
  try {
    parsedPayload = JSON.parse(payload) as Record<string, unknown>
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error('Unknown JSON parse error')
    throw new GitHubWebhookPayloadError(
      `${ErrorMessages.WEBHOOK_PAYLOAD_INVALID}: ${parseError.message}`,
      payload.length,
      parseError
    )
  }

  // Validate payload is an object
  if (!parsedPayload || typeof parsedPayload !== 'object') {
    throw new GitHubWebhookPayloadError(
      'Webhook payload must be a valid JSON object',
      payload.length
    )
  }

  // Extract event type and delivery ID from headers
  const eventType = headers['x-github-event']
  const deliveryId = headers['x-github-delivery']

  // Validate required headers
  if (!eventType || typeof eventType !== 'string' || eventType.trim() === '') {
    throw new GitHubWebhookError(ErrorMessages.WEBHOOK_EVENT_TYPE_MISSING, 'missing-signature')
  }

  if (!deliveryId || typeof deliveryId !== 'string' || deliveryId.trim() === '') {
    throw new GitHubWebhookError(ErrorMessages.WEBHOOK_DELIVERY_ID_MISSING, 'missing-signature')
  }

  // Build the structured event
  const event: WebhookEvent = {
    type: eventType.trim(),
    deliveryId: deliveryId.trim(),
    payload: parsedPayload,
    // Always include action field, even if undefined
    action:
      parsedPayload.action && typeof parsedPayload.action === 'string'
        ? parsedPayload.action
        : undefined,
  }

  return event
}
