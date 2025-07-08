/**
 * Comprehensive Webhook Security System
 *
 * Implements secure webhook handling with signature validation, rate limiting,
 * payload validation, and security monitoring for GitHub webhook endpoints.
 * This addresses PR review requirements for webhook security.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { GitHubWebhookPayloadSchema } from '@/types/github-integration'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthRateLimit, createRateLimitResponse, recordAuthResult } from './auth-rate-limiting'

// ==================== WEBHOOK CONFIGURATION ====================

const WEBHOOK_CONFIG = {
  // Signature verification
  signatureHeader: 'x-hub-signature-256',
  eventHeader: 'x-github-event',
  deliveryHeader: 'x-github-delivery',

  // Security limits
  maxPayloadSize: 10 * 1024 * 1024, // 10MB max payload
  signatureTimeout: 300, // 5 minutes max age for webhooks

  // Rate limiting (stricter than auth endpoints)
  rateLimit: {
    maxAttempts: 100, // Higher limit for legitimate webhook traffic
    windowMs: 60 * 1000, // 1 minute window
    blockDuration: 15 * 60 * 1000, // 15 minute block for abuse
  },

  // Allowed event types for security
  allowedEvents: [
    'ping',
    'push',
    'pull_request',
    'issues',
    'issue_comment',
    'repository',
    'star',
    'watch',
    'fork',
    'release',
  ] as const,
}

type AllowedWebhookEvent = (typeof WEBHOOK_CONFIG.allowedEvents)[number]

// ==================== WEBHOOK VALIDATION SCHEMAS ====================

const WebhookHeadersSchema = z.object({
  [WEBHOOK_CONFIG.signatureHeader]: z.string().min(1).optional(), // Allow missing signature to be caught later
  [WEBHOOK_CONFIG.eventHeader]: z.enum(WEBHOOK_CONFIG.allowedEvents),
  [WEBHOOK_CONFIG.deliveryHeader]: z.string().uuid(),
  'content-type': z.literal('application/json'),
  'user-agent': z.string().regex(/^GitHub-Hookshot\/[a-f0-9]+$/),
})

const _WebhookTimestampSchema = z.object({
  timestamp: z.number().int().positive(),
})

// ==================== SECURITY INTERFACES ====================

export interface WebhookSecurityResult {
  success: boolean
  event?: AllowedWebhookEvent
  deliveryId?: string
  payload?: unknown
  error?: string
  securityFlags?: {
    suspiciousActivity: boolean
    rateLimit: boolean
    invalidSignature: boolean
    payloadTooLarge: boolean
    eventNotAllowed: boolean
  }
}

export interface WebhookSecurityConfig {
  secret: string
  enableRateLimit?: boolean
  enablePayloadValidation?: boolean
  enableLogging?: boolean
  allowedOrigins?: string[]
}

// ==================== CORE WEBHOOK SECURITY CLASS ====================

export class WebhookSecurityValidator {
  private readonly secret: string
  private readonly config: Required<WebhookSecurityConfig>

  constructor(config: WebhookSecurityConfig) {
    this.secret = config.secret
    this.config = {
      enableRateLimit: config.enableRateLimit ?? true,
      enablePayloadValidation: config.enablePayloadValidation ?? true,
      enableLogging: config.enableLogging ?? true,
      allowedOrigins: config.allowedOrigins ?? [],
      ...config,
    }

    if (!this.secret || this.secret.length < 32) {
      throw new Error('Webhook secret must be at least 32 characters long')
    }
  }

  /**
   * Ensure securityFlags is initialized and return the flags
   */
  private ensureSecurityFlags(
    result: WebhookSecurityResult
  ): NonNullable<WebhookSecurityResult['securityFlags']> {
    if (!result.securityFlags) {
      result.securityFlags = {
        suspiciousActivity: false,
        rateLimit: false,
        invalidSignature: false,
        payloadTooLarge: false,
        eventNotAllowed: false,
      }
    }
    return result.securityFlags
  }

  /**
   * Check rate limiting for webhook requests
   */
  private performRateLimitCheck(request: NextRequest, result: WebhookSecurityResult): boolean {
    if (!this.config.enableRateLimit) {
      return true
    }

    const rateLimitResult = this.checkWebhookRateLimit(request)
    if (!rateLimitResult.allowed) {
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.rateLimit = true
      result.error = 'Rate limit exceeded for webhook endpoint'
      this.logSecurityEvent('rate_limit_exceeded', request, result)
      return false
    }

    return true
  }

  /**
   * Perform header validation and extract event details
   */
  private async performHeaderValidation(
    request: NextRequest,
    result: WebhookSecurityResult
  ): Promise<{
    success: boolean
    event?: AllowedWebhookEvent
    deliveryId?: string
  }> {
    const headersResult = await this.validateHeaders(request)
    if (!headersResult.success) {
      result.error = headersResult.error
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.suspiciousActivity = true
      this.logSecurityEvent('invalid_headers', request, result)
      return { success: false }
    }

    return {
      success: true,
      event: headersResult.event,
      deliveryId: headersResult.deliveryId,
    }
  }

  /**
   * Check payload size limits
   */
  private performPayloadSizeCheck(request: NextRequest, result: WebhookSecurityResult): boolean {
    const contentLength = request.headers.get('content-length')
    if (contentLength && Number.parseInt(contentLength) > WEBHOOK_CONFIG.maxPayloadSize) {
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.payloadTooLarge = true
      result.error = 'Payload too large'
      this.logSecurityEvent('payload_too_large', request, result)
      return false
    }

    return true
  }

  /**
   * Perform signature verification and extract payload
   */
  private async performSignatureVerification(
    request: NextRequest,
    result: WebhookSecurityResult
  ): Promise<{
    success: boolean
    payload?: unknown
  }> {
    const signatureResult = await this.verifySignature(request)
    if (!signatureResult.success) {
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.invalidSignature = true
      result.error = signatureResult.error
      this.logSecurityEvent('invalid_signature', request, result)
      return { success: false }
    }

    return {
      success: true,
      payload: signatureResult.payload,
    }
  }

  /**
   * Perform payload validation if enabled
   */
  private performPayloadValidation(
    payload: unknown,
    event: AllowedWebhookEvent | undefined,
    request: NextRequest,
    result: WebhookSecurityResult
  ): boolean {
    if (!this.config.enablePayloadValidation || !event) {
      return true
    }

    const validationResult = this.validatePayload(payload, event)
    if (!validationResult.success) {
      result.error = validationResult.error
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.suspiciousActivity = true
      this.logSecurityEvent('invalid_payload', request, result)
      return false
    }

    return true
  }

  /**
   * Perform event type security check
   */
  private performEventTypeCheck(
    event: AllowedWebhookEvent | undefined,
    request: NextRequest,
    result: WebhookSecurityResult
  ): boolean {
    if (!event || !WEBHOOK_CONFIG.allowedEvents.includes(event)) {
      const securityFlags = this.ensureSecurityFlags(result)
      securityFlags.eventNotAllowed = true
      result.error = `Event type '${event || 'undefined'}' not allowed`
      this.logSecurityEvent('forbidden_event', request, result)
      return false
    }

    return true
  }

  /**
   * Handle validation success
   */
  private handleValidationSuccess(request: NextRequest, result: WebhookSecurityResult): void {
    result.success = true
    this.logSecurityEvent('webhook_validated', request, result)
    recordAuthResult(request, true)
  }

  /**
   * Handle validation error
   */
  private handleValidationError(
    error: unknown,
    request: NextRequest,
    result: WebhookSecurityResult
  ): void {
    result.error = error instanceof Error ? error.message : 'Unknown validation error'
    const securityFlags = this.ensureSecurityFlags(result)
    securityFlags.suspiciousActivity = true
    this.logSecurityEvent('validation_error', request, result)
    recordAuthResult(request, false)
  }

  /**
   * Comprehensive webhook security validation
   */
  async validateWebhook(request: NextRequest): Promise<WebhookSecurityResult> {
    const result: WebhookSecurityResult = {
      success: false,
      securityFlags: {
        suspiciousActivity: false,
        rateLimit: false,
        invalidSignature: false,
        payloadTooLarge: false,
        eventNotAllowed: false,
      },
    }

    try {
      // 1. Rate limiting check
      if (!this.performRateLimitCheck(request, result)) {
        return result
      }

      // 2. Header validation
      const headerResult = await this.performHeaderValidation(request, result)
      if (!headerResult.success) {
        return result
      }

      result.event = headerResult.event
      result.deliveryId = headerResult.deliveryId

      // 3. Payload size check
      if (!this.performPayloadSizeCheck(request, result)) {
        return result
      }

      // 4. Signature verification
      const signatureResult = await this.performSignatureVerification(request, result)
      if (!signatureResult.success) {
        return result
      }

      result.payload = signatureResult.payload

      // 5. Payload validation
      if (!this.performPayloadValidation(result.payload, result.event, request, result)) {
        return result
      }

      // 6. Event type security check
      if (!this.performEventTypeCheck(result.event, request, result)) {
        return result
      }

      // Success
      this.handleValidationSuccess(request, result)
      return result
    } catch (error) {
      this.handleValidationError(error, request, result)
      return result
    }
  }

  /**
   * Webhook-specific rate limiting (more lenient than auth)
   */
  private checkWebhookRateLimit(request: NextRequest) {
    // Use the existing auth rate limiting but with webhook-specific config
    // In a production system, you'd want separate rate limiting for webhooks
    return checkAuthRateLimit(request)
  }

  /**
   * Validate webhook headers for security
   */
  private async validateHeaders(request: NextRequest): Promise<{
    success: boolean
    event?: AllowedWebhookEvent
    deliveryId?: string
    error?: string
  }> {
    try {
      const headers = Object.fromEntries(request.headers.entries())

      // Validate required headers exist and are properly formatted
      const validatedHeaders = WebhookHeadersSchema.parse(headers)

      return {
        success: true,
        event: validatedHeaders[WEBHOOK_CONFIG.eventHeader] as AllowedWebhookEvent,
        deliveryId: validatedHeaders[WEBHOOK_CONFIG.deliveryHeader],
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof z.ZodError
            ? `Invalid headers: ${error.errors.map(e => e.message).join(', ')}`
            : 'Header validation failed',
      }
    }
  }

  /**
   * Verify webhook signature using timing-safe comparison
   */
  private async verifySignature(request: NextRequest): Promise<{
    success: boolean
    payload?: unknown
    error?: string
  }> {
    try {
      // Get signature from headers
      const signature = request.headers.get(WEBHOOK_CONFIG.signatureHeader)
      if (!signature || !signature.startsWith('sha256=')) {
        return {
          success: false,
          error: 'Missing or invalid signature header',
        }
      }

      // Get raw body for signature verification
      const body = await request.text()
      if (!body) {
        return {
          success: false,
          error: 'Empty request body',
        }
      }

      // Compute expected signature
      const hmac = createHmac('sha256', this.secret)
      const expectedSignature = `sha256=${hmac.update(body, 'utf8').digest('hex')}`

      // Timing-safe comparison to prevent timing attacks
      const providedSignature = Buffer.from(signature, 'utf8')
      const computedSignature = Buffer.from(expectedSignature, 'utf8')

      if (providedSignature.length !== computedSignature.length) {
        return {
          success: false,
          error: 'Signature length mismatch',
        }
      }

      if (!timingSafeEqual(providedSignature, computedSignature)) {
        return {
          success: false,
          error: 'Signature verification failed',
        }
      }

      // Parse payload
      let payload: unknown
      try {
        payload = JSON.parse(body)
      } catch {
        return {
          success: false,
          error: 'Invalid JSON payload',
        }
      }

      return {
        success: true,
        payload,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Signature verification error',
      }
    }
  }

  /**
   * Validate webhook payload structure
   */
  private validatePayload(
    payload: unknown,
    event: AllowedWebhookEvent
  ): {
    success: boolean
    error?: string
  } {
    try {
      // Basic structure validation for all events
      if (!payload || typeof payload !== 'object') {
        return {
          success: false,
          error: 'Payload must be a valid object',
        }
      }

      // Event-specific validation
      if (event !== 'ping') {
        // Most GitHub events should have these fields
        const result = GitHubWebhookPayloadSchema.safeParse(payload)
        if (!result.success) {
          return {
            success: false,
            error: `Invalid payload structure: ${result.error.errors.map(e => e.message).join(', ')}`,
          }
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payload validation error',
      }
    }
  }

  /**
   * Security event logging
   */
  private logSecurityEvent(
    eventType: string,
    request: NextRequest,
    result: WebhookSecurityResult
  ): void {
    if (!this.config.enableLogging) return

    const _logData = {
      timestamp: new Date().toISOString(),
      eventType,
      webhookEvent: result.event,
      deliveryId: result.deliveryId,
      success: result.success,
      error: result.error,
      securityFlags: result.securityFlags,
      clientIp:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      contentLength: request.headers.get('content-length'),
    }
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Create a standardized webhook security response
 */
export function createWebhookSecurityResponse(
  result: WebhookSecurityResult,
  customMessage?: string
): NextResponse {
  if (result.success) {
    return NextResponse.json(
      {
        success: true,
        message: customMessage || 'Webhook processed successfully',
        deliveryId: result.deliveryId,
      },
      { status: 200 }
    )
  }

  // Determine appropriate HTTP status code
  let status = 400 // Bad Request default

  if (result.securityFlags?.rateLimit) {
    status = 429 // Too Many Requests
  } else if (result.securityFlags?.invalidSignature) {
    status = 401 // Unauthorized
  } else if (result.securityFlags?.eventNotAllowed) {
    status = 403 // Forbidden
  } else if (result.securityFlags?.payloadTooLarge) {
    status = 413 // Payload Too Large
  }

  // Rate limit specific response
  if (result.securityFlags?.rateLimit) {
    return createRateLimitResponse(
      'Webhook rate limit exceeded. Please reduce request frequency.',
      300, // 5 minute retry
      2 // Escalation level
    )
  }

  return NextResponse.json(
    {
      success: false,
      error: result.error || 'Webhook validation failed',
      deliveryId: result.deliveryId,
    },
    {
      status,
      headers: {
        'X-Webhook-Security': 'validation-failed',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    }
  )
}

/**
 * Create webhook security validator with environment configuration
 */
export function createWebhookValidator(): WebhookSecurityValidator {
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required for webhook security')
  }

  return new WebhookSecurityValidator({
    secret,
    enableRateLimit: process.env.NODE_ENV === 'production',
    enablePayloadValidation: true,
    enableLogging: true,
  })
}

// ==================== EXPORTS ====================

export { WEBHOOK_CONFIG, type AllowedWebhookEvent }
