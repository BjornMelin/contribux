import {
  adaptiveCreateHash,
  base64url,
  createSHA256Hash,
  generateRandomToken,
  generateUUID,
  getRandomBytes,
  isEdgeRuntime,
  timingSafeEqual,
} from '@/lib/crypto-utils'
import { describe, expect, test } from 'vitest'

describe('Crypto Integration Verification', () => {
  test('should perform SHA-256 hashing correctly', async () => {
    const testData = 'Hello, world!'
    const hash = await createSHA256Hash(testData)

    expect(hash).toBeTruthy()
    expect(hash).toHaveLength(64) // SHA-256 produces 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // Only hex characters
  })

  test('should generate random tokens', () => {
    const token1 = generateRandomToken(32)
    const token2 = generateRandomToken(32)

    expect(token1).toBeTruthy()
    expect(token2).toBeTruthy()
    expect(token1).not.toBe(token2) // Should be different
    expect(token1).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url format
  })

  test('should generate UUIDs correctly', () => {
    const uuid = generateUUID()

    expect(uuid).toBeTruthy()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  test('should perform timing-safe comparisons', async () => {
    const secret1 = 'my-secret-key'
    const secret2 = 'my-secret-key'
    const secret3 = 'different-key'

    const equal = await timingSafeEqual(secret1, secret2)
    const notEqual = await timingSafeEqual(secret1, secret3)

    expect(equal).toBe(true)
    expect(notEqual).toBe(false)
  })

  test('should detect runtime correctly', () => {
    const edgeRuntime = isEdgeRuntime()

    // Should detect Web Crypto API availability
    expect(typeof edgeRuntime).toBe('boolean')
    expect(typeof globalThis.crypto).toBe('object')
    expect(typeof globalThis.crypto.subtle).toBe('object')
  })

  test('should work with adaptive functions', async () => {
    const testData = 'test-data'
    const directHash = await createSHA256Hash(testData)
    const adaptiveHash = await adaptiveCreateHash(testData)

    expect(adaptiveHash).toBe(directHash)
  })

  test('should handle base64url encoding/decoding', () => {
    const testBytes = getRandomBytes(32)
    const encoded = base64url.encode(testBytes)
    const decoded = base64url.decode(encoded)

    expect(encoded).toBeTruthy()
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url format
    expect(decoded).toEqual(testBytes)
  })

  test('should generate random bytes correctly', () => {
    const bytes1 = getRandomBytes(32)
    const bytes2 = getRandomBytes(32)

    expect(bytes1).toBeInstanceOf(Uint8Array)
    expect(bytes1).toHaveLength(32)
    expect(bytes2).toHaveLength(32)
    expect(bytes1).not.toEqual(bytes2) // Should be different
  })

  test('crypto functions work across multiple calls', async () => {
    // Test that crypto functions are stable and work consistently
    const data = 'consistent-test-data'

    const hash1 = await createSHA256Hash(data)
    const hash2 = await createSHA256Hash(data)

    expect(hash1).toBe(hash2) // Same input should produce same hash

    const equal1 = await timingSafeEqual('secret', 'secret')
    const equal2 = await timingSafeEqual('secret', 'secret')

    expect(equal1).toBe(true)
    expect(equal2).toBe(true)
  })
})
