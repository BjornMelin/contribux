/**
 * Sophisticated Webhook Verification System
 * Implements HMAC-SHA256 signature verification, timestamp validation,
 * replay attack prevention, payload integrity checks, and delivery retry mechanisms
 */

import { z } from 'zod'
import { createHMAC, generateSecureToken, verifyHMAC } from './crypto'

// Webhook verification configuration
export const WEBHOOK_CONFIG = {
  // Security settings
  security: {
    signatureHeader: 'X-Hub-Signature-256',
    timestampHeader: 'X-Hub-Timestamp',
    eventTypeHeader: 'X-Hub-Event',
    deliveryIdHeader: 'X-Hub-Delivery',
    toleranceMs: 5 * 60 * 1000, // 5 minutes
    maxPayloadSize: 1024 * 1024, // 1MB
    requiredHeaders: ['user-agent', 'content-type'],
  },
  // Rate limiting
  rateLimiting: {
    perSource: { requests: 100, window: 60 * 1000 }, // 100/min per source
    perEndpoint: { requests: 500, window: 60 * 1000 }, // 500/min per endpoint
    burstThreshold: 10, // consecutive requests
  },
  // Retry configuration
  retry: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30 * 1000,
    backoffMultiplier: 2,
    jitterMaxMs: 1000,
  },
  // Nonce tracking
  nonce: {
    cacheSize: 10000, // max stored nonces
    cleanupIntervalMs: 60 * 1000, // 1 minute
    maxAgeMs: 15 * 60 * 1000, // 15 minutes
  },
} as const

// Schema definitions
export const WebhookSignatureSchema = z.object({
  algorithm: z.string(),
  signature: z.string(),
  timestamp: z.number(),
  keyId: z.string().optional(),
})

export const WebhookPayloadSchema = z.object({
  event: z.string(),
  timestamp: z.number(),
  delivery_id: z.string(),
  data: z.record(z.unknown()),
  nonce: z.string().optional(),
  version: z.string().optional(),
})

export const WebhookSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  secret: z.string(),
  events: z.array(z.string()),
  isActive: z.boolean(),
  rateLimit: z
    .object({
      requests: z.number(),
      window: z.number(),
    })
    .optional(),
  retryConfig: z
    .object({
      maxAttempts: z.number(),
      initialDelayMs: z.number(),
      maxDelayMs: z.number(),
    })
    .optional(),
})

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  event: z.string(),
  payload: z.string(),
  signature: z.string(),
  timestamp: z.number(),
  attempts: z.number(),
  status: z.enum(['pending', 'delivered', 'failed', 'expired']),
  lastAttemptAt: z.number().optional(),
  nextAttemptAt: z.number().optional(),
  errorMessage: z.string().optional(),
  responseCode: z.number().optional(),
  responseHeaders: z.record(z.string()).optional(),
})

// Type definitions
export type WebhookSignature = z.infer<typeof WebhookSignatureSchema>
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookSource = z.infer<typeof WebhookSourceSchema>
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>

export interface WebhookVerificationResult {
  valid: boolean
  source?: WebhookSource | undefined
  payload?: WebhookPayload | undefined
  errors: string[]
  warnings: string[]
  metadata: {
    verificationTime: number
    signatureAlgorithm?: string | undefined
    timestampDrift?: number | undefined
    isReplay?: boolean | undefined
  }
}

export interface WebhookDeliveryContext {
  sourceId: string
  targetUrl: string
  payload: string
  headers: Record<string, string>
  timeout: number
  retryConfig?: Partial<typeof WEBHOOK_CONFIG.retry>
}

// In-memory stores (use Redis or database in production)
const nonceCache = new Map<string, number>() // nonce -> timestamp
const rateLimitCache = new Map<string, { count: number; reset: number; lastRequest: number }>()
const deliveryQueue = new Map<string, WebhookDelivery>()
const webhookSources = new Map<string, WebhookSource>()

/**
 * Verify incoming webhook signature and payload
 */
export async function verifyWebhookSignature(
  rawPayload: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  sourceId?: string
): Promise<WebhookVerificationResult> {
  const startTime = Date.now()
  const context = createVerificationContext(rawPayload, headers, sourceId, startTime)

  try {
    // Phase 1: Basic header and signature validation
    const headerResult = await validateWebhookHeaders(context)
    if (!headerResult.valid) {
      return createFailureResult(context, headerResult.errors, headerResult.warnings)
    }

    // Phase 2: Source authentication and rate limiting
    const authResult = await authenticateWebhookSource(context)
    if (!authResult.valid) {
      return createFailureResult(context, authResult.errors, authResult.warnings, authResult.source)
    }

    // Phase 3: Cryptographic verification and payload validation
    if (!authResult.source || !authResult.signature) {
      context.errors.push('Missing authentication data for cryptographic verification')
      return createFailureResult(context, ['Missing authentication data'], [])
    }

    const cryptoResult = await performCryptographicVerification(
      context,
      authResult.source,
      authResult.signature
    )
    if (!cryptoResult.valid) {
      return createFailureResult(
        context,
        cryptoResult.errors,
        cryptoResult.warnings,
        authResult.source
      )
    }

    // Phase 4: Security checks and finalization
    if (!cryptoResult.payload) {
      context.errors.push('Missing payload data for final verification')
      return createFailureResult(context, ['Missing payload data'], [], authResult.source)
    }

    return await finalizeWebhookVerification(
      context,
      authResult.source,
      authResult.signature,
      cryptoResult.payload
    )
  } catch (_error) {
    context.errors.push('Internal verification error')
    return createVerificationResult(
      false,
      undefined,
      undefined,
      context.errors,
      context.warnings,
      context.startTime
    )
  }
}

// Types for verification context and phase results
interface WebhookVerificationContext {
  rawPayload: string | Buffer
  headers: Record<string, string>
  sourceId: string | undefined
  startTime: number
  errors: string[]
  warnings: string[]
}

interface VerificationPhaseResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  source: WebhookSource | undefined
  signature: WebhookSignature | undefined
  payload: WebhookPayload | undefined
}

// Helper functions for webhook verification complexity reduction

/**
 * Create verification context to track state across verification phases
 */
function createVerificationContext(
  rawPayload: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  sourceId?: string,
  startTime?: number
): WebhookVerificationContext {
  return {
    rawPayload,
    headers: normalizeHeaders(headers),
    sourceId,
    startTime: startTime || Date.now(),
    errors: [],
    warnings: [],
  }
}

/**
 * Phase 1: Validate headers and extract signature information
 */
async function validateWebhookHeaders(
  context: WebhookVerificationContext
): Promise<VerificationPhaseResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate required headers
  const headerValidation = validateRequiredHeaders(context.headers)
  if (!headerValidation.valid) {
    errors.push(...headerValidation.errors)
  }

  // Extract and parse signature
  const signatureResult = extractWebhookSignature(context.headers)
  if (!signatureResult.valid) {
    errors.push(signatureResult.error || 'Invalid signature format')
    return {
      valid: false,
      errors,
      warnings,
      source: undefined,
      signature: undefined,
      payload: undefined,
    }
  }

  // Validate timestamp
  const timestampValidation = validateTimestamp(
    context.headers,
    signatureResult.signature?.timestamp || 0
  )
  if (!timestampValidation.valid) {
    errors.push(...timestampValidation.errors)
    warnings.push(...timestampValidation.warnings)
  }

  // Update context with findings
  context.errors.push(...errors)
  context.warnings.push(...warnings)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    source: undefined,
    signature: signatureResult.signature,
    payload: undefined,
  }
}

/**
 * Phase 2: Authenticate webhook source and check rate limits
 */
async function authenticateWebhookSource(
  context: WebhookVerificationContext
): Promise<VerificationPhaseResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Get and validate webhook source
  const sourceResult = await getAndValidateWebhookSource(context.sourceId, context.headers)
  if (!sourceResult.valid) {
    errors.push(sourceResult.error || 'Invalid webhook source')
    return {
      valid: false,
      errors,
      warnings,
      source: undefined,
      signature: undefined,
      payload: undefined,
    }
  }

  // Check rate limiting
  const rateLimitResult = await checkWebhookRateLimit(
    sourceResult.source?.id || '',
    context.headers
  )
  if (!rateLimitResult.allowed) {
    errors.push('Rate limit exceeded')
    return {
      valid: false,
      errors,
      warnings,
      source: sourceResult.source,
      signature: undefined,
      payload: undefined,
    }
  }

  // Re-extract signature for this phase
  const signatureResult = extractWebhookSignature(context.headers)

  return {
    valid: true,
    errors,
    warnings,
    source: sourceResult.source,
    signature: signatureResult.signature,
    payload: undefined,
  }
}

/**
 * Phase 3: Perform cryptographic verification and payload parsing
 */
async function performCryptographicVerification(
  context: WebhookVerificationContext,
  source: WebhookSource,
  signature: WebhookSignature
): Promise<VerificationPhaseResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate payload size and HMAC signature
  const validationResult = await validatePayloadAndSignature(context.rawPayload, signature, source)
  if (!validationResult.valid) {
    errors.push(validationResult.error || 'Payload validation failed')
    return {
      valid: false,
      errors,
      warnings,
      source: undefined,
      signature: undefined,
      payload: undefined,
    }
  }

  // Parse and validate payload structure
  const payloadResult = parseAndValidatePayload(context.rawPayload)
  if (!payloadResult.valid) {
    errors.push(payloadResult.error || 'Payload parsing failed')
    return {
      valid: false,
      errors,
      warnings,
      source: undefined,
      signature: undefined,
      payload: undefined,
    }
  }

  return {
    valid: true,
    errors,
    warnings,
    source: undefined,
    signature: undefined,
    payload: payloadResult.payload,
  }
}

/**
 * Phase 4: Perform final security checks and complete verification
 */
async function finalizeWebhookVerification(
  context: WebhookVerificationContext,
  source: WebhookSource,
  signature: WebhookSignature,
  payload: WebhookPayload
): Promise<WebhookVerificationResult> {
  const errors: string[] = [...context.errors]
  const warnings: string[] = [...context.warnings]

  // Check for replay attacks
  const replayCheck = await checkReplayAttack(payload, signature)
  if (!replayCheck.valid) {
    errors.push('Replay attack detected')
    return createVerificationResult(false, source, payload, errors, warnings, context.startTime, {
      isReplay: true,
    })
  }

  // Validate event type
  if (source.events && !source.events.includes(payload.event)) {
    warnings.push(`Unexpected event type: ${payload.event}`)
  }

  // Finalize successful verification
  return await finalizeSuccessfulVerification(
    errors,
    payload,
    signature,
    source,
    warnings,
    context.startTime
  )
}

/**
 * Create failure result with consistent error handling
 */
function createFailureResult(
  context: WebhookVerificationContext,
  errors: string[],
  warnings: string[],
  source?: WebhookSource
): WebhookVerificationResult {
  const allErrors = [...context.errors, ...errors]
  const allWarnings = [...context.warnings, ...warnings]

  return createVerificationResult(
    false,
    source,
    undefined,
    allErrors,
    allWarnings,
    context.startTime
  )
}

function extractWebhookSignature(headers: Record<string, string>): {
  valid: boolean
  signature?: WebhookSignature
  error?: string
} {
  const signatureHeader = headers[WEBHOOK_CONFIG.security.signatureHeader.toLowerCase()]
  if (!signatureHeader) {
    return { valid: false, error: 'Missing signature header' }
  }

  const signature = parseSignatureHeader(signatureHeader)
  if (!signature) {
    return { valid: false, error: 'Invalid signature format' }
  }

  return { valid: true, signature }
}

async function getAndValidateWebhookSource(
  sourceId: string | undefined,
  headers: Record<string, string>
): Promise<{ valid: boolean; source?: WebhookSource; error?: string }> {
  const source = await getWebhookSource(sourceId, headers)
  if (!source) {
    return { valid: false, error: 'Unknown webhook source' }
  }

  if (!source.isActive) {
    return { valid: false, error: 'Webhook source is disabled' }
  }

  return { valid: true, source }
}

async function validatePayloadAndSignature(
  rawPayload: string | Buffer,
  signature: WebhookSignature,
  source: WebhookSource
): Promise<{ valid: boolean; error?: string }> {
  // Check payload size
  const payloadSize = Buffer.isBuffer(rawPayload)
    ? rawPayload.length
    : Buffer.byteLength(rawPayload)
  if (payloadSize > WEBHOOK_CONFIG.security.maxPayloadSize) {
    return { valid: false, error: 'Payload too large' }
  }

  // Verify HMAC signature
  const signatureVerification = await verifyHMACSignature(rawPayload, signature, source.secret)
  if (!signatureVerification.valid) {
    return { valid: false, error: signatureVerification.error || 'Invalid signature' }
  }

  return { valid: true }
}

function parseAndValidatePayload(rawPayload: string | Buffer): {
  valid: boolean
  payload?: WebhookPayload
  error?: string
} {
  try {
    const payloadString = Buffer.isBuffer(rawPayload) ? rawPayload.toString() : rawPayload
    const parsed = JSON.parse(payloadString)
    const payload = WebhookPayloadSchema.parse(parsed)
    return { valid: true, payload }
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? `Invalid payload: ${error.message}` : 'Invalid payload format',
    }
  }
}

async function finalizeSuccessfulVerification(
  errors: string[],
  payload: WebhookPayload,
  signature: WebhookSignature,
  source: WebhookSource,
  warnings: string[],
  startTime: number
): Promise<WebhookVerificationResult> {
  // Store nonce if provided to prevent replay attacks
  if (payload.nonce) {
    await storeNonce(payload.nonce, signature.timestamp)
  }

  return createVerificationResult(true, source, payload, errors, warnings, startTime, {
    signatureAlgorithm: signature.algorithm,
    timestampDrift: Math.abs(Date.now() - signature.timestamp),
    isReplay: false,
  })
}

/**
 * Generate webhook signature for outgoing webhooks
 */
export async function generateWebhookSignature(
  payload: string | Buffer,
  secret: string,
  algorithm = 'sha256'
): Promise<WebhookSignature> {
  const timestamp = Date.now()
  const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8')

  // Create signing string (timestamp + payload)
  const signingString = `${timestamp}.${payloadBuffer.toString()}`

  // Generate HMAC key from secret
  const key = await createHMACKeyFromSecret(secret)

  // Create signature
  const signature = await createHMAC(signingString, key)

  return {
    algorithm,
    signature,
    timestamp,
  }
}

/**
 * Create webhook delivery with retry mechanism
 */
export async function createWebhookDelivery(
  context: WebhookDeliveryContext,
  payload: WebhookPayload
): Promise<WebhookDelivery> {
  const deliveryId = generateSecureToken(16)

  // Generate signature for delivery
  const source = await getWebhookSourceById(context.sourceId)
  if (!source) {
    throw new Error('Unknown webhook source')
  }

  const signature = await generateWebhookSignature(context.payload, source.secret)

  const delivery: WebhookDelivery = {
    id: deliveryId,
    sourceId: context.sourceId,
    event: payload.event,
    payload: context.payload,
    signature: `${signature.algorithm}=${signature.signature}`,
    timestamp: signature.timestamp,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: Date.now(),
  }

  // Store delivery for processing
  deliveryQueue.set(deliveryId, delivery)

  return delivery
}

/**
 * Process webhook delivery with exponential backoff retry
 */
export async function processWebhookDelivery(
  deliveryId: string,
  attempt = 1
): Promise<{ success: boolean; shouldRetry: boolean; error?: string }> {
  const delivery = deliveryQueue.get(deliveryId)
  if (!delivery) {
    return { success: false, shouldRetry: false, error: 'Delivery not found' }
  }

  const retryConfig = { ...WEBHOOK_CONFIG.retry }
  const source = await getWebhookSourceById(delivery.sourceId)

  if (source?.retryConfig) {
    Object.assign(retryConfig, source.retryConfig)
  }

  try {
    // Update delivery attempt
    delivery.attempts = attempt
    delivery.lastAttemptAt = Date.now()
    delivery.status = 'pending'

    // Prepare delivery headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Contribux-Webhook/1.0',
      [WEBHOOK_CONFIG.security.signatureHeader]: delivery.signature,
      [WEBHOOK_CONFIG.security.timestampHeader]: delivery.timestamp.toString(),
      [WEBHOOK_CONFIG.security.eventTypeHeader]: delivery.event,
      [WEBHOOK_CONFIG.security.deliveryIdHeader]: delivery.id,
    }

    // Make HTTP request (implement with your preferred HTTP client)
    if (!source?.url) {
      throw new Error('Source URL not found')
    }
    const result = await deliverWebhook(source.url, delivery.payload, headers)

    if (result.success) {
      delivery.status = 'delivered'
      delivery.responseCode = result.statusCode
      delivery.responseHeaders = result.headers
      return { success: true, shouldRetry: false }
    }
    delivery.errorMessage = result.error
    delivery.responseCode = result.statusCode

    // Determine if we should retry
    const shouldRetry = attempt < retryConfig.maxAttempts && isRetryableError(result.statusCode)

    if (shouldRetry) {
      // Calculate next attempt time with exponential backoff
      const baseDelay = retryConfig.initialDelayMs * retryConfig.backoffMultiplier ** (attempt - 1)
      const clampedDelay = Math.min(baseDelay, retryConfig.maxDelayMs)
      const jitter = Math.random() * (WEBHOOK_CONFIG.retry.jitterMaxMs || 1000)
      const nextAttemptDelay = clampedDelay + jitter

      delivery.nextAttemptAt = Date.now() + nextAttemptDelay
      delivery.status = 'pending'
    } else {
      delivery.status = 'failed'
    }

    return { success: false, shouldRetry, error: result.error || 'Unknown error' }
  } catch (error) {
    delivery.status = 'failed'
    delivery.errorMessage = error instanceof Error ? error.message : 'Unknown error'

    const shouldRetry = attempt < retryConfig.maxAttempts
    if (shouldRetry) {
      const nextAttemptDelay =
        retryConfig.initialDelayMs * retryConfig.backoffMultiplier ** (attempt - 1)
      delivery.nextAttemptAt = Date.now() + Math.min(nextAttemptDelay, retryConfig.maxDelayMs)
      delivery.status = 'pending'
    }

    return { success: false, shouldRetry, error: delivery.errorMessage }
  }
}

/**
 * Register a new webhook source
 */
export async function registerWebhookSource(
  source: Omit<WebhookSource, 'id'>
): Promise<WebhookSource> {
  const id = generateSecureToken(12)

  const webhookSource: WebhookSource = {
    id,
    ...source,
  }

  // Validate source configuration
  WebhookSourceSchema.parse(webhookSource)

  // Store source (implement with your preferred storage)
  webhookSources.set(id, webhookSource)

  return webhookSource
}

/**
 * Batch process pending webhook deliveries
 */
export async function processPendingDeliveries(): Promise<void> {
  const now = Date.now()
  const pendingDeliveries = Array.from(deliveryQueue.values()).filter(
    delivery => delivery.status === 'pending' && (delivery.nextAttemptAt ?? 0) <= now
  )

  // Process deliveries in parallel (with concurrency limit)
  const concurrencyLimit = 10
  const batches = []

  for (let i = 0; i < pendingDeliveries.length; i += concurrencyLimit) {
    batches.push(pendingDeliveries.slice(i, i + concurrencyLimit))
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async delivery => {
        const result = await processWebhookDelivery(delivery.id, delivery.attempts + 1)

        if (!result.shouldRetry) {
          // Clean up completed deliveries after some time
          setTimeout(() => deliveryQueue.delete(delivery.id), 24 * 60 * 60 * 1000) // 24 hours
        }
      })
    )
  }
}

// Helper functions

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {}

  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) {
      const stringValue = Array.isArray(value) ? value[0] : value
      if (stringValue) {
        normalized[key.toLowerCase()] = stringValue
      }
    }
  })

  return normalized
}

function validateRequiredHeaders(headers: Record<string, string>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  WEBHOOK_CONFIG.security.requiredHeaders.forEach(header => {
    if (!headers[header.toLowerCase()]) {
      errors.push(`Missing required header: ${header}`)
    }
  })

  return { valid: errors.length === 0, errors }
}

function parseSignatureHeader(signatureHeader: string): WebhookSignature | null {
  const parts = signatureHeader.split(',').map(p => p.trim())

  // Try simple format first
  if (parts.length === 1 && parts[0]) {
    return parseSimpleSignatureFormat(parts[0])
  }

  // Parse complex format
  return parseComplexSignatureFormat(parts)
}

function parseSimpleSignatureFormat(part: string): WebhookSignature | null {
  if (!part || !part.includes('=')) {
    return null
  }

  const [algorithm, signature] = part.split('=', 2)

  if (!algorithm || !signature) {
    return null
  }

  return {
    algorithm,
    signature,
    timestamp: Date.now(),
  }
}

function parseComplexSignatureFormat(parts: string[]): WebhookSignature | null {
  const parsed: Partial<WebhookSignature> = {}

  for (const part of parts) {
    parseSignaturePart(part, parsed)
  }

  return buildWebhookSignature(parsed)
}

function parseSignaturePart(part: string, parsed: Partial<WebhookSignature>): void {
  const [key, value] = part.split('=', 2)
  if (!key || !value) return

  const handlers = getSignaturePartHandlers()
  const handler = handlers[key.toLowerCase() as keyof typeof handlers]
  if (handler) {
    handler(value, key, parsed)
  }
}

function getSignaturePartHandlers() {
  return {
    algorithm: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.algorithm = value
    },
    sha256: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.algorithm = 'sha256'
      parsed.signature = value
    },
    signature: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.signature = value
    },
    timestamp: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.timestamp = Number.parseInt(value, 10)
    },
    t: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.timestamp = Number.parseInt(value, 10)
    },
    keyid: (value: string, _key: string, parsed: Partial<WebhookSignature>) => {
      parsed.keyId = value
    },
  }
}

function buildWebhookSignature(parsed: Partial<WebhookSignature>): WebhookSignature | null {
  if (!parsed.algorithm || !parsed.signature) {
    return null
  }

  return {
    algorithm: parsed.algorithm,
    signature: parsed.signature,
    timestamp: parsed.timestamp || Date.now(),
    keyId: parsed.keyId,
  }
}

function validateTimestamp(
  headers: Record<string, string>,
  signatureTimestamp: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  const timestampHeader = headers[WEBHOOK_CONFIG.security.timestampHeader.toLowerCase()]
  let timestamp = signatureTimestamp

  if (timestampHeader) {
    const headerTimestamp = Number.parseInt(timestampHeader, 10)
    if (!Number.isNaN(headerTimestamp)) {
      timestamp = headerTimestamp
    }
  }

  const now = Date.now()
  const age = now - timestamp

  if (age > WEBHOOK_CONFIG.security.toleranceMs) {
    errors.push('Timestamp too old')
  } else if (age < -WEBHOOK_CONFIG.security.toleranceMs) {
    errors.push('Timestamp too far in future')
  } else if (age > WEBHOOK_CONFIG.security.toleranceMs * 0.5) {
    warnings.push('Timestamp drift detected')
  }

  return { valid: errors.length === 0, errors, warnings }
}

async function getWebhookSource(
  sourceId: string | undefined,
  headers: Record<string, string>
): Promise<WebhookSource | null> {
  if (sourceId) {
    return webhookSources.get(sourceId) || null
  }

  // Try to identify source from headers
  const userAgent = headers['user-agent']
  if (userAgent) {
    // Simple source identification by user agent
    for (const source of Array.from(webhookSources.values())) {
      if (userAgent.includes(source.name)) {
        return source
      }
    }
  }

  return null
}

async function getWebhookSourceById(sourceId: string): Promise<WebhookSource | null> {
  return webhookSources.get(sourceId) || null
}

async function checkWebhookRateLimit(
  sourceId: string,
  headers: Record<string, string>
): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number }> {
  const ip = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown'
  const key = `webhook:${sourceId}:${ip}`
  const now = Date.now()

  const config = WEBHOOK_CONFIG.rateLimiting.perSource
  const record = rateLimitCache.get(key)

  if (!record || record.reset < now) {
    const reset = now + config.window
    rateLimitCache.set(key, { count: 1, reset, lastRequest: now })
    return { allowed: true, limit: config.requests, remaining: config.requests - 1, reset }
  }

  if (record.count >= config.requests) {
    return { allowed: false, limit: config.requests, remaining: 0, reset: record.reset }
  }

  record.count++
  record.lastRequest = now
  return {
    allowed: true,
    limit: config.requests,
    remaining: config.requests - record.count,
    reset: record.reset,
  }
}

async function verifyHMACSignature(
  payload: string | Buffer,
  signature: WebhookSignature,
  secret: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const signingString = `${signature.timestamp}.${payload.toString()}`
    const key = await createHMACKeyFromSecret(secret)
    const isValid = await verifyHMAC(signingString, signature.signature, key)

    return { valid: isValid }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification error',
    }
  }
}

async function checkReplayAttack(
  payload: WebhookPayload,
  _signature: WebhookSignature
): Promise<{ valid: boolean; error?: string }> {
  // Check delivery ID uniqueness
  const deliveryId = payload.delivery_id
  if (deliveryQueue.has(deliveryId)) {
    return { valid: false, error: 'Duplicate delivery ID' }
  }

  // Check nonce if provided
  if (payload.nonce) {
    if (nonceCache.has(payload.nonce)) {
      return { valid: false, error: 'Nonce already used' }
    }
  }

  return { valid: true }
}

async function storeNonce(nonce: string, timestamp: number): Promise<void> {
  nonceCache.set(nonce, timestamp)

  // Clean up old nonces
  if (nonceCache.size > WEBHOOK_CONFIG.nonce.cacheSize) {
    const cutoff = Date.now() - WEBHOOK_CONFIG.nonce.maxAgeMs
    for (const [storedNonce, storedTimestamp] of Array.from(nonceCache.entries())) {
      if (storedTimestamp < cutoff) {
        nonceCache.delete(storedNonce)
      }
    }
  }
}

async function createHMACKeyFromSecret(secret: string): Promise<CryptoKey> {
  const secretBuffer = new TextEncoder().encode(secret)
  return await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function createVerificationResult(
  valid: boolean,
  source: WebhookSource | undefined,
  payload: WebhookPayload | undefined,
  errors: string[],
  warnings: string[],
  startTime: number,
  additionalMetadata?: Record<string, unknown>
): WebhookVerificationResult {
  const result: WebhookVerificationResult = {
    valid,
    source,
    payload,
    errors,
    warnings,
    metadata: {
      verificationTime: Date.now() - startTime,
      ...additionalMetadata,
    },
  }

  return result
}

function isRetryableError(statusCode?: number): boolean {
  if (!statusCode) return true

  // Don't retry client errors (4xx) except specific cases
  if (statusCode >= 400 && statusCode < 500) {
    return [408, 429].includes(statusCode) // Timeout, Rate Limited
  }

  // Retry server errors (5xx)
  return statusCode >= 500
}

// Placeholder delivery function (implement with your preferred HTTP client)
async function deliverWebhook(
  _url: string,
  _payload: string,
  _headers: Record<string, string>
): Promise<{
  success: boolean
  statusCode?: number
  headers?: Record<string, string>
  error?: string
}> {
  // Simulate delivery for now
  return {
    success: Math.random() > 0.2, // 80% success rate
    statusCode: 200,
    headers: {},
  }
}

// Cleanup function to run periodically
export function cleanupWebhookCaches(): void {
  const now = Date.now()

  // Clean up old nonces
  const nonceCutoff = now - WEBHOOK_CONFIG.nonce.maxAgeMs
  for (const [nonce, timestamp] of Array.from(nonceCache.entries())) {
    if (timestamp < nonceCutoff) {
      nonceCache.delete(nonce)
    }
  }

  // Clean up old rate limit records
  for (const [key, record] of Array.from(rateLimitCache.entries())) {
    if (record.reset < now) {
      rateLimitCache.delete(key)
    }
  }

  // Clean up old deliveries
  const deliveryCutoff = now - 7 * 24 * 60 * 60 * 1000 // 7 days
  for (const [id, delivery] of Array.from(deliveryQueue.entries())) {
    if (delivery.timestamp < deliveryCutoff && delivery.status !== 'pending') {
      deliveryQueue.delete(id)
    }
  }
}

// Start cleanup timer
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupWebhookCaches, WEBHOOK_CONFIG.nonce.cleanupIntervalMs)
}
