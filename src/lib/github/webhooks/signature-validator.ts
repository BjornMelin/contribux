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
  // Validate input parameters
  if (!payload || !signature || !secret) {
    return false
  }

  if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
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

  // GitHub supports both sha1 (legacy) and sha256 (current)
  // Prefer sha256 but maintain backward compatibility
  if (algorithm !== 'sha1' && algorithm !== 'sha256') {
    return false
  }

  if (!providedSignature || providedSignature.length === 0) {
    return false
  }

  try {
    // Ensure payload is treated as UTF-8 (webhook payloads can contain Unicode)
    const payloadBuffer = Buffer.from(payload, 'utf8')

    // Compute the expected signature using the same algorithm
    const expectedSignature = createHmac(algorithm, secret).update(payloadBuffer).digest('hex')

    // Validate hex format of provided signature
    if (!/^[a-f0-9]+$/i.test(providedSignature)) {
      return false
    }

    // Convert both signatures to buffers for timing-safe comparison
    const providedBuffer = Buffer.from(providedSignature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    // Length check before timing-safe comparison (also constant time)
    if (providedBuffer.length !== expectedBuffer.length) {
      return false
    }

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(providedBuffer, expectedBuffer)
  } catch (_error) {
    // Handle any errors (e.g., invalid hex string, HMAC creation failure)
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
  if (!validateWebhookSignature(payload, signature, secret)) {
    return false
  }

  // If strict mode is enabled, reject SHA1 signatures
  if (requireSha256 && signature.startsWith('sha1=')) {
    return false
  }

  return true
}
