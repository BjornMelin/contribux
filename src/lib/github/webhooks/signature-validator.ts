import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validates a GitHub webhook signature using HMAC-SHA256
 * Uses timing-safe comparison to prevent timing attacks
 *
 * Security features:
 * - Supports both sha1 (legacy) and sha256 (current standard) algorithms
 * - Prevents timing attacks with constant-time comparison
 * - Validates input parameters thoroughly
 * - Handles UTF-8 encoding properly
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Validate input parameters
    if (!payload || !signature || !secret) {
      return false
    }

    if (
      typeof payload !== 'string' ||
      typeof signature !== 'string' ||
      typeof secret !== 'string'
    ) {
      return false
    }

    // Validate payload length (reasonable limit)
    if (payload.length === 0) {
      return false
    }

    // Validate secret length (reasonable minimum)
    if (secret.length < 10) {
      return false
    }

    // Check signature format
    if (!signature.includes('=')) {
      return false
    }

    const signatureParts = signature.split('=', 2)
    if (signatureParts.length !== 2) {
      return false
    }

    const [algorithm, providedSignature] = signatureParts

    // Validate algorithm and provided signature
    if (!algorithm || !providedSignature) {
      return false
    }

    // GitHub supports both sha1 (legacy) and sha256 (current)
    // Prefer sha256 but maintain backward compatibility
    if (algorithm !== 'sha1' && algorithm !== 'sha256') {
      return false
    }

    if (providedSignature.length === 0) {
      return false
    }

    // Validate hex format of provided signature
    if (!/^[a-f0-9]+$/i.test(providedSignature)) {
      return false
    }

    // Ensure payload is treated as UTF-8 (webhook payloads can contain Unicode)
    const payloadBuffer = Buffer.from(payload, 'utf8')

    // Compute the expected signature using the same algorithm
    const expectedSignature = createHmac(algorithm, secret).update(payloadBuffer).digest('hex')

    // Convert both signatures to buffers for timing-safe comparison
    const providedBuffer = Buffer.from(providedSignature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    // Length check before timing-safe comparison (also constant time)
    if (providedBuffer.length !== expectedBuffer.length) {
      return false
    }

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(providedBuffer, expectedBuffer)
  } catch (error) {
    // Log the error for debugging but don't expose details
    console.error(
      'Webhook signature validation error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return false
  }
}

/**
 * Validates GitHub webhook signature with explicit algorithm preference
 * Prefers SHA256 over SHA1 for better security
 */
export function validateWebhookSignatureStrict(
  payload: string,
  signature: string,
  secret: string,
  requireSha256 = true
): boolean {
  try {
    // Input validation
    if (
      typeof payload !== 'string' ||
      typeof signature !== 'string' ||
      typeof secret !== 'string'
    ) {
      return false
    }

    if (!payload || !signature || !secret) {
      return false
    }

    // First validate using the standard function
    if (!validateWebhookSignature(payload, signature, secret)) {
      return false
    }

    // If strict mode is enabled, reject SHA1 signatures
    if (requireSha256 && signature.startsWith('sha1=')) {
      return false
    }

    // Additional validation for strict mode
    if (requireSha256 && !signature.startsWith('sha256=')) {
      return false
    }

    return true
  } catch (error) {
    console.error(
      'Strict webhook signature validation error:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return false
  }
}
