/**
 * Request Signing and Verification System
 * Implements HMAC-based request signing for internal service communication
 * Provides request integrity and authenticity verification
 */

import { z } from 'zod'
import { createHmac, randomBytes, timingSafeEqualSync as timingSafeEqual } from '@/lib/crypto-utils'

// Request signing configuration
export const RequestSigningConfigSchema = z.object({
  algorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  secret: z.string().min(32),
  timestampTolerance: z.number().default(300), // 5 minutes
  nonceSize: z.number().default(16),
  includeBody: z.boolean().default(true),
  includeQueryParams: z.boolean().default(true),
})

export type RequestSigningConfig = z.infer<typeof RequestSigningConfigSchema>

// Signed request interface
export interface SignedRequest {
  method: string
  path: string
  timestamp: number
  nonce: string
  body?: string
  queryParams?: Record<string, string>
  headers: Record<string, string>
  signature: string
}

// Signature components
interface SignatureComponents {
  method: string
  path: string
  timestamp: number
  nonce: string
  body?: string
  queryParams?: string
}

/**
 * Request signer class
 */
export class RequestSigner {
  private config: RequestSigningConfig

  constructor(config: RequestSigningConfig) {
    this.config = RequestSigningConfigSchema.parse(config)
  }

  /**
   * Sign a request
   */
  async signRequest(
    method: string,
    path: string,
    options?: {
      body?: unknown
      queryParams?: Record<string, string>
      headers?: Record<string, string>
    }
  ): Promise<SignedRequest> {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = randomBytes(this.config.nonceSize).toString('hex')

    const components: SignatureComponents = {
      method: method.toUpperCase(),
      path,
      timestamp,
      nonce,
    }

    // Include body if configured
    if (this.config.includeBody && options?.body) {
      components.body =
        typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    }

    // Include query params if configured
    if (this.config.includeQueryParams && options?.queryParams) {
      components.queryParams = this.canonicalizeQueryParams(options.queryParams)
    }

    const signature = await this.generateSignature(components)

    return {
      method: components.method,
      path: components.path,
      timestamp,
      nonce,
      body: components.body,
      queryParams: options?.queryParams,
      headers: {
        ...options?.headers,
        'X-Signature': signature,
        'X-Signature-Algorithm': this.config.algorithm,
        'X-Timestamp': timestamp.toString(),
        'X-Nonce': nonce,
      },
      signature,
    }
  }

  /**
   * Verify a signed request
   */
  async verifyRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    options?: {
      body?: unknown
      queryParams?: Record<string, string>
    }
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Extract and validate signature components
      const extractResult = this.extractSignatureComponents(headers)
      if (!extractResult.valid) {
        return extractResult
      }

      const { signature, timestamp, nonce } = extractResult

      // Type assertions since validation passed
      if (typeof timestamp !== 'number' || !nonce || !signature) {
        return { valid: false, error: 'Invalid signature component types' }
      }

      // Validate request timing (timestamp is guaranteed to be number after check above)
      const timestampResult = this.validateTimestamp(timestamp as number)
      if (!timestampResult.valid) {
        return timestampResult
      }

      // Verify signature authenticity
      return await this.verifySignatureAuthenticity(
        method,
        path,
        signature,
        timestamp,
        nonce,
        options
      )
    } catch (error) {
      return this.handleVerificationError(error)
    }
  }

  /**
   * Verify signature authenticity using timing-safe comparison
   */
  private async verifySignatureAuthenticity(
    method: string,
    path: string,
    signature: string,
    timestamp: number,
    nonce: string,
    options?: {
      body?: unknown
      queryParams?: Record<string, string>
    }
  ): Promise<{ valid: boolean; error?: string }> {
    const components = this.buildSignatureComponents(method, path, timestamp, nonce, options)
    return await this.performSignatureVerification(signature, components)
  }

  /**
   * Handle verification errors consistently
   */
  private handleVerificationError(error: unknown): { valid: boolean; error?: string } {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    }
  }

  /**
   * Extract signature components from headers
   */
  private extractSignatureComponents(headers: Record<string, string>): {
    valid: boolean
    error?: string
    signature?: string
    timestamp?: number
    nonce?: string
  } {
    const signature = headers['x-signature'] || headers['X-Signature']
    const algorithm = headers['x-signature-algorithm'] || headers['X-Signature-Algorithm']
    const timestamp = Number.parseInt(headers['x-timestamp'] || headers['X-Timestamp'] || '0')
    const nonce = headers['x-nonce'] || headers['X-Nonce']

    if (!signature || !timestamp || !nonce) {
      return { valid: false, error: 'Missing signature components' }
    }

    if (algorithm !== this.config.algorithm) {
      return { valid: false, error: 'Invalid signature algorithm' }
    }

    return { valid: true, signature, timestamp, nonce }
  }

  /**
   * Validate request timestamp
   */
  private validateTimestamp(timestamp: number): { valid: boolean; error?: string } {
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > this.config.timestampTolerance) {
      return { valid: false, error: 'Request timestamp outside tolerance window' }
    }
    return { valid: true }
  }

  /**
   * Build signature components for verification
   */
  private buildSignatureComponents(
    method: string,
    path: string,
    timestamp: number,
    nonce: string,
    options?: {
      body?: unknown
      queryParams?: Record<string, string>
    }
  ): SignatureComponents {
    const components: SignatureComponents = {
      method: method.toUpperCase(),
      path,
      timestamp,
      nonce,
    }

    if (this.config.includeBody && options?.body) {
      components.body =
        typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    }

    if (this.config.includeQueryParams && options?.queryParams) {
      components.queryParams = this.canonicalizeQueryParams(options.queryParams)
    }

    return components
  }

  /**
   * Perform timing-safe signature verification
   */
  private async performSignatureVerification(
    providedSignature: string,
    components: SignatureComponents
  ): Promise<{ valid: boolean; error?: string }> {
    const expectedSignature = await this.generateSignature(components)

    // Timing-safe comparison using Edge Runtime compatible approach
    if (providedSignature.length !== expectedSignature.length) {
      return { valid: false, error: 'Invalid signature length' }
    }

    if (!timingSafeEqual(providedSignature, expectedSignature)) {
      return { valid: false, error: 'Invalid signature' }
    }

    return { valid: true }
  }

  /**
   * Generate signature for components
   */
  private async generateSignature(components: SignatureComponents): Promise<string> {
    const parts = [
      components.method,
      components.path,
      components.timestamp.toString(),
      components.nonce,
    ]

    if (components.queryParams) {
      parts.push(components.queryParams)
    }

    if (components.body) {
      parts.push(components.body)
    }

    const message = parts.join('\n')
    const hmac = await createHmac(this.config.algorithm, this.config.secret)
    hmac.update(message)
    return await hmac.digest('hex')
  }

  /**
   * Canonicalize query parameters for consistent signing
   */
  private canonicalizeQueryParams(params: Record<string, string>): string {
    const sorted = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')

    return sorted
  }
}

/**
 * Express/Next.js middleware for request signing verification
 */
export function createSigningMiddleware(signer: RequestSigner) {
  return async (req: unknown, res: unknown, next: unknown) => {
    // Validate middleware prerequisites
    const validationResult = validateMiddlewareInputs(req, res, next)
    if (!validationResult.isValid) {
      return validationResult.result
    }

    const { reqObj, resObj } = validationResult

    // Check if endpoint should skip signing
    if (shouldSkipSigning(reqObj.path)) {
      if (typeof next === 'function') return next()
      return
    }

    // Perform signature verification
    return await performSignatureVerification(signer, reqObj, resObj, next)
  }
}

/**
 * Validate middleware inputs and extract typed objects
 */
function validateMiddlewareInputs(
  req: unknown,
  res: unknown,
  next: unknown
):
  | {
      isValid: false
      result?: undefined
      reqObj?: undefined
      resObj?: undefined
    }
  | {
      isValid: true
      reqObj: {
        path: string
        headers: Record<string, string>
        method: string
        body?: unknown
        query?: unknown
      }
      resObj: { status: (code: number) => { json: (data: unknown) => unknown } }
    } {
  // Validate request object
  if (!req || typeof req !== 'object' || !('path' in req) || !('headers' in req)) {
    if (typeof next === 'function') next()
    return { isValid: false, result: undefined }
  }

  // Validate response object
  if (!res || typeof res !== 'object' || !('status' in res)) {
    if (typeof next === 'function') next()
    return { isValid: false, result: undefined }
  }

  const reqObj = req as {
    path: string
    headers: Record<string, string>
    method: string
    body?: unknown
    query?: unknown
  }
  const resObj = res as { status: (code: number) => { json: (data: unknown) => unknown } }

  return { isValid: true, reqObj, resObj }
}

/**
 * Check if the endpoint should skip signing verification
 */
function shouldSkipSigning(path: string): boolean {
  return path.startsWith('/api/public/') || path.startsWith('/health')
}

/**
 * Perform signature verification and handle the result
 */
async function performSignatureVerification(
  signer: RequestSigner,
  reqObj: {
    path: string
    headers: Record<string, string>
    method: string
    body?: unknown
    query?: unknown
  },
  resObj: { status: (code: number) => { json: (data: unknown) => unknown } },
  next: unknown
): Promise<unknown> {
  const headers = reqObj.headers || {}
  const result = await signer.verifyRequest(reqObj.method, reqObj.path, headers, {
    body: reqObj.body,
    queryParams: reqObj.query as Record<string, string> | undefined,
  })

  if (!result.valid) {
    return resObj.status(401).json({
      error: 'Invalid request signature',
      message: result.error,
    })
  }

  if (typeof next === 'function') {
    return next()
  }

  // Return undefined if next is not a function (middleware continues)
  return undefined
}

/**
 * Fetch wrapper with automatic request signing
 */
export class SignedFetch {
  private signer: RequestSigner
  private baseUrl: string

  constructor(signer: RequestSigner, baseUrl: string) {
    this.signer = signer
    this.baseUrl = baseUrl
  }

  async fetch(
    path: string,
    options?: RequestInit & {
      queryParams?: Record<string, string>
      skipSigning?: boolean
    }
  ): Promise<Response> {
    if (options?.skipSigning) {
      return fetch(`${this.baseUrl}${path}`, options)
    }

    const url = new URL(path, this.baseUrl)

    // Add query params to URL
    if (options?.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    // Sign the request
    const signed = await this.signer.signRequest(options?.method || 'GET', url.pathname, {
      body: options?.body,
      queryParams: options?.queryParams,
      headers: options?.headers as Record<string, string> | undefined,
    })

    // Merge signed headers with existing headers
    const headers = {
      ...options?.headers,
      ...signed.headers,
    }

    return fetch(url.toString(), {
      ...options,
      headers,
    })
  }
}

/**
 * Service registry for managing internal service secrets
 */
export class ServiceRegistry {
  private services = new Map<string, RequestSigningConfig>()

  registerService(name: string, config: RequestSigningConfig): void {
    this.services.set(name, config)
  }

  getService(name: string): RequestSigningConfig | undefined {
    return this.services.get(name)
  }

  createSigner(serviceName: string): RequestSigner | null {
    const config = this.services.get(serviceName)
    if (!config) return null
    return new RequestSigner(config)
  }

  createSignedClient(serviceName: string, baseUrl: string): SignedFetch | null {
    const signer = this.createSigner(serviceName)
    if (!signer) return null
    return new SignedFetch(signer, baseUrl)
  }
}

// Default service registry instance
export const serviceRegistry = new ServiceRegistry()
