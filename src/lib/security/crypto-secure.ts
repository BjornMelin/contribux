/**
 * Cryptographically secure random value generation
 * Replaces Math.random() for security-sensitive operations
 * 
 * Works in both Node.js and Edge Runtime environments
 */

import { logger } from '@/lib/monitoring/logger'

/**
 * Generates cryptographically secure random bytes
 * @param length Number of bytes to generate
 * @returns Uint8Array of random bytes
 * @throws Error if no secure random generator is available
 */
export function getSecureRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    // Edge Runtime / Browser environment
    const bytes = new Uint8Array(length)
    globalThis.crypto.getRandomValues(bytes)
    return bytes
  } else if (typeof require !== 'undefined') {
    // Node.js environment
    try {
      const { randomBytes } = require('crypto')
      return new Uint8Array(randomBytes(length))
    } catch (error) {
      throw new Error('No secure random number generator available')
    }
  }
  throw new Error('No secure random number generator available')
}

/**
 * Generates a cryptographically secure random string
 * @param length Length of the string to generate (default: 16)
 * @param alphabet Custom alphabet to use (default: alphanumeric)
 * @returns Secure random string
 */
export function generateSecureRandomString(
  length: number = 16,
  alphabet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  const bytes = getSecureRandomBytes(length)
  let result = ''
  
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length]
  }
  
  return result
}

/**
 * Generates a secure random ID with timestamp prefix for uniqueness
 * Format: prefix_timestamp_random
 * @param prefix Optional prefix for the ID
 * @returns Unique secure ID
 */
export function generateSecureId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36)
  const randomPart = generateSecureRandomString(9)
  return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`
}

/**
 * Generates a secure random float between 0 and 1
 * Suitable for replacing Math.random() in security contexts
 * @returns Random float between 0 (inclusive) and 1 (exclusive)
 */
export function getSecureRandomFloat(): number {
  const bytes = getSecureRandomBytes(4)
  const view = new DataView(bytes.buffer)
  // Convert to float between 0 and 1
  return view.getUint32(0) / 0x100000000 // Divide by 2^32
}

/**
 * Generates a secure random integer within a range using rejection sampling
 * Ensures uniform distribution without modulo bias
 * @param min Minimum value (inclusive)
 * @param max Maximum value (exclusive)
 * @returns Random integer in the specified range
 */
export function getSecureRandomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new TypeError('Arguments must be integers')
  }
  
  const range = max - min
  if (range <= 0) {
    throw new RangeError('Max must be greater than min')
  }
  
  // For small ranges, use simple approach
  if (range <= 256) {
    let value: number
    do {
      value = getSecureRandomBytes(1)[0]
    } while (value >= 256 - (256 % range))
    return min + (value % range)
  }
  
  // For larger ranges, use rejection sampling with appropriate byte count
  const bytesNeeded = Math.ceil(Math.log2(range) / 8)
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range
  
  let value: number
  do {
    const bytes = getSecureRandomBytes(bytesNeeded)
    value = 0
    for (let i = 0; i < bytesNeeded; i++) {
      value = value * 256 + bytes[i]
    }
  } while (value >= maxValid)
  
  return min + (value % range)
}

/**
 * Secure random value generator with fallback and monitoring
 * Use this for critical operations that must not fail
 */
export async function getSecureRandomWithFallback(length: number): Promise<Uint8Array> {
  const startTime = Date.now()
  
  try {
    // Primary: Use crypto.getRandomValues
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(length)
      globalThis.crypto.getRandomValues(bytes)
      
      logger.debug('Secure random generation successful', {
        method: 'crypto.getRandomValues',
        length,
        duration: Date.now() - startTime
      })
      
      return bytes
    }
  } catch (error) {
    logger.warn('Primary crypto.getRandomValues failed', { 
      error: error instanceof Error ? error.message : String(error),
      length 
    })
  }

  try {
    // Secondary: Use Node crypto
    if (typeof require !== 'undefined') {
      const { randomBytes } = require('crypto')
      const buffer = randomBytes(length)
      const bytes = new Uint8Array(buffer)
      
      logger.debug('Secure random generation successful', {
        method: 'crypto.randomBytes',
        length,
        duration: Date.now() - startTime
      })
      
      return bytes
    }
  } catch (error) {
    logger.warn('Secondary crypto.randomBytes failed', { 
      error: error instanceof Error ? error.message : String(error),
      length 
    })
  }

  // Last resort: Log critical error and throw
  const errorMessage = 
    'No cryptographically secure random number generator available. ' +
    'This is a critical security vulnerability.'
  
  logger.error(errorMessage, {
    length,
    environment: {
      hasCrypto: typeof globalThis.crypto !== 'undefined',
      hasGetRandomValues: typeof globalThis.crypto?.getRandomValues === 'function',
      hasRequire: typeof require !== 'undefined',
      runtime: typeof window !== 'undefined' ? 'browser' : 'server'
    }
  })
  
  throw new Error(errorMessage)
}

/**
 * Performance-optimized secure random pool for high-frequency generation
 * Reduces overhead by generating random bytes in batches
 */
export class SecureRandomPool {
  private pool: Uint8Array | null = null
  private index: number = 0
  private readonly poolSize: number

  constructor(poolSize: number = 1024) {
    if (poolSize < 16 || poolSize > 65536) {
      throw new RangeError('Pool size must be between 16 and 65536 bytes')
    }
    this.poolSize = poolSize
  }

  private refillPool(): void {
    this.pool = getSecureRandomBytes(this.poolSize)
    this.index = 0
  }

  /**
   * Get random bytes from the pool
   * @param count Number of bytes to retrieve
   * @returns Random bytes
   */
  getBytes(count: number): Uint8Array {
    if (count > this.poolSize) {
      // For large requests, generate directly
      return getSecureRandomBytes(count)
    }

    if (!this.pool || this.index + count > this.poolSize) {
      this.refillPool()
    }

    const bytes = this.pool!.slice(this.index, this.index + count)
    this.index += count
    return bytes
  }

  /**
   * Clear the pool for security
   */
  clear(): void {
    if (this.pool) {
      this.pool.fill(0)
      this.pool = null
    }
    this.index = 0
  }
}

// Type exports for better TypeScript support
export type SecureRandomGenerator = () => Uint8Array
export type SecureIdGenerator = (prefix?: string) => string

// Convenience exports for common use cases
export const secureRequestId = () => generateSecureId('req')
export const secureWorkerId = () => generateSecureId('worker')
export const secureSessionId = () => generateSecureId('session')
export const secureTokenId = () => generateSecureId('token')