import { ErrorMessages } from '../errors'
import type { WebhookEvent, WebhookHeaders } from './types'

/**
 * Parses a GitHub webhook payload and headers into a structured event
 */
export function parseWebhookEvent(
  payload: string,
  headers: WebhookHeaders | Record<string, string>
): WebhookEvent {
  // Parse the JSON payload
  let parsedPayload: Record<string, unknown>
  try {
    parsedPayload = JSON.parse(payload) as Record<string, unknown>
  } catch (_error) {
    throw new Error(ErrorMessages.WEBHOOK_PAYLOAD_INVALID)
  }

  // Extract event type and delivery ID from headers
  const eventType = headers['x-github-event']
  const deliveryId = headers['x-github-delivery']

  if (!eventType || !deliveryId) {
    throw new Error(ErrorMessages.WEBHOOK_SIGNATURE_MISSING)
  }

  // Build the structured event
  const event: WebhookEvent = {
    type: eventType,
    deliveryId,
    payload: parsedPayload,
  }

  // Some events have an action field
  if (parsedPayload.action && typeof parsedPayload.action === 'string') {
    event.action = parsedPayload.action
  }

  return event
}
