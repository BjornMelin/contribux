/**
 * Request Signing and Verification System
 * Implements HMAC-based request signing for internal service communication
 * Provides request integrity and authenticity verification
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

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
  signRequest(
    method: string,
    path: string,
    options?: {
      body?: any
      queryParams?: Record<string, string>
      headers?: Record<string, string>
    }
  ): SignedRequest {
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
      components.body = typeof options.body === 'string' 
        ? options.body 
        : JSON.stringify(options.body)
    }

    // Include query params if configured
    if (this.config.includeQueryParams && options?.queryParams) {
      components.queryParams = this.canonicalizeQueryParams(options.queryParams)
    }

    const signature = this.generateSignature(components)

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
  verifyRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    options?: {
      body?: any
      queryParams?: Record<string, string>
    }
  ): { valid: boolean; error?: string } {
    try {
      // Extract signature components from headers
      const signature = headers['x-signature'] || headers['X-Signature']
      const algorithm = headers['x-signature-algorithm'] || headers['X-Signature-Algorithm']
      const timestamp = parseInt(headers['x-timestamp'] || headers['X-Timestamp'] || '0')
      const nonce = headers['x-nonce'] || headers['X-Nonce']

      if (!signature || !timestamp || !nonce) {
        return { valid: false, error: 'Missing signature components' }
      }

      if (algorithm !== this.config.algorithm) {
        return { valid: false, error: 'Invalid signature algorithm' }
      }

      // Check timestamp freshness
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - timestamp) > this.config.timestampTolerance) {
        return { valid: false, error: 'Request timestamp outside tolerance window' }
      }

      // Build signature components
      const components: SignatureComponents = {
        method: method.toUpperCase(),
        path,
        timestamp,
        nonce,
      }

      if (this.config.includeBody && options?.body) {
        components.body = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
      }

      if (this.config.includeQueryParams && options?.queryParams) {
        components.queryParams = this.canonicalizeQueryParams(options.queryParams)
      }

      // Generate expected signature
      const expectedSignature = this.generateSignature(components)

      // Timing-safe comparison
      const providedBuffer = Buffer.from(signature, 'hex')
      const expectedBuffer = Buffer.from(expectedSignature, 'hex')

      if (providedBuffer.length !== expectedBuffer.length) {
        return { valid: false, error: 'Invalid signature length' }
      }

      if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
        return { valid: false, error: 'Invalid signature' }
      }

      return { valid: true }
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Signature verification failed' 
      }
    }
  }

  /**
   * Generate signature for components
   */
  private generateSignature(components: SignatureComponents): string {
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
    const hmac = createHmac(this.config.algorithm, this.config.secret)
    return hmac.update(message, 'utf8').digest('hex')
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
  return async (req: any, res: any, next: any) => {
    // Skip signing for public endpoints
    if (req.path.startsWith('/api/public/') || req.path.startsWith('/health')) {
      return next()
    }

    const headers = req.headers as Record<string, string>
    const result = signer.verifyRequest(
      req.method,
      req.path,
      headers,
      {
        body: req.body,
        queryParams: req.query,
      }
    )

    if (!result.valid) {
      return res.status(401).json({
        error: 'Invalid request signature',
        message: result.error,
      })
    }

    next()
  }
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
    const signed = this.signer.signRequest(
      options?.method || 'GET',
      url.pathname,
      {
        body: options?.body,
        queryParams: options?.queryParams,
        headers: options?.headers as Record<string, string>,
      }
    )

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