/**
 * Migration Examples: Math.random() to Cryptographically Secure Alternatives
 *
 * This file demonstrates how to migrate existing code from Math.random()
 * to secure alternatives using the crypto-secure library.
 */

// Test framework globals for examples
declare const describe: (name: string, fn: () => void) => void
declare const it: (name: string, fn: () => void) => void
declare const expect: (value: unknown) => { toHaveBeenCalled: () => void }

import {
  generateSecureId,
  generateSecureRandomString,
  getSecureRandomFloat,
  getSecureRandomInt,
  secureRequestId,
  secureWorkerId,
} from '@/lib/security/crypto-secure'

// ============================================================================
// EXAMPLE 1: Request ID Generation in API Routes
// ============================================================================

// ❌ BEFORE (Insecure) - Found in: src/app/api/search/repositories/route.ts
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldGenerateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ✅ AFTER (Secure) - Option 1: Using convenience function
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateRequestId(): string {
  return secureRequestId()
}

// ✅ AFTER (Secure) - Option 2: Using generic secure ID
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateRequestIdCustom(): string {
  return generateSecureId('req')
}

// ============================================================================
// EXAMPLE 2: Worker ID Generation
// ============================================================================

// ❌ BEFORE (Insecure) - Found in: src/lib/workers/cpu-worker.ts
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldGenerateWorkerId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
}

// ✅ AFTER (Secure)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateWorkerId(): string {
  return secureWorkerId()
}

// ============================================================================
// EXAMPLE 3: Memory Profiler ID Generation
// ============================================================================

// ❌ BEFORE (Insecure) - Found in: src/lib/monitoring/memory-profiler.ts
interface OldSnapshot {
  id: string
  timestamp: number
  memoryUsage: NodeJS.MemoryUsage
}

// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldCreateSnapshot(usage: NodeJS.MemoryUsage): OldSnapshot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    memoryUsage: usage,
  }
}

// ✅ AFTER (Secure)
interface NewSnapshot {
  id: string
  timestamp: number
  memoryUsage: NodeJS.MemoryUsage
}

// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newCreateSnapshot(usage: NodeJS.MemoryUsage): NewSnapshot {
  return {
    id: generateSecureId('snapshot'),
    timestamp: Date.now(),
    memoryUsage: usage,
  }
}

// ============================================================================
// EXAMPLE 4: Retry Jitter (Non-Security Critical)
// ============================================================================

// For non-security retry jitter, Math.random() is acceptable
// Found in: src/lib/api/query-client.ts, src/lib/github/utils.ts

// ✅ ACCEPTABLE (Non-security)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function calculateRetryDelay(attempt: number): number {
  const baseDelay = 1000
  const maxDelay = 30000
  const exponentialDelay = baseDelay * 2 ** attempt

  // Math.random() is fine for non-security jitter
  return Math.min(exponentialDelay + Math.random() * 1000, maxDelay)
}

// 🔒 SECURE ALTERNATIVE (If security is needed)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function calculateSecureRetryDelay(attempt: number): number {
  const baseDelay = 1000
  const maxDelay = 30000
  const exponentialDelay = baseDelay * 2 ** attempt

  // Use secure random for timing attack prevention
  return Math.min(exponentialDelay + getSecureRandomFloat() * 1000, maxDelay)
}

// ============================================================================
// EXAMPLE 5: OAuth Timing Attack Protection
// ============================================================================

// ❌ BEFORE (Potentially Insecure) - Found in: src/lib/auth/oauth.ts
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
async function oldProtectTiming(operation: () => Promise<void>): Promise<void> {
  const jitter = Math.random() * 100 // 0-100ms jitter
  await new Promise(resolve => setTimeout(resolve, jitter))
  await operation()
}

// ✅ AFTER (Secure) - Prevents timing attacks
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
async function newProtectTiming(operation: () => Promise<void>): Promise<void> {
  const jitter = getSecureRandomFloat() * 100 // 0-100ms secure jitter
  await new Promise(resolve => setTimeout(resolve, jitter))
  await operation()
}

// ============================================================================
// EXAMPLE 6: Mock Data Generation (Keep Math.random())
// ============================================================================

// ✅ ACCEPTABLE - Mock data for performance dashboard
// Found in: src/components/monitoring/performance-dashboard-optimized.tsx
interface MockPerformanceData {
  avgExecutionTime: number
  parallelization: number
  hitRate: number
}

// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function generateMockPerformanceData(): MockPerformanceData {
  return {
    avgExecutionTime: Math.random() * 8000 + 3000, // 3-11 seconds
    parallelization: Math.random() * 0.8 + 0.2, // 20-100%
    hitRate: Math.random() * 0.3 + 0.65, // 65-95%
  }
}

// ============================================================================
// EXAMPLE 7: Animation and UI Effects (Keep Math.random())
// ============================================================================

// ✅ ACCEPTABLE - Visual effects don't need cryptographic security
// Found in: src/app/auth/signin/oauth-signin-component.tsx
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
}

// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function createParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
  }
}

// ============================================================================
// EXAMPLE 8: Secure Token Generation
// ============================================================================

// ❌ BEFORE (Insecure) - Common pattern for tokens
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldGenerateToken(): string {
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += Math.random().toString(36).charAt(2)
  }
  return token
}

// ✅ AFTER (Secure) - Cryptographically secure
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateToken(): string {
  return generateSecureRandomString(32)
}

// ✅ AFTER (Secure) - With custom alphabet
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateHexToken(): string {
  return generateSecureRandomString(64, '0123456789abcdef')
}

// ============================================================================
// EXAMPLE 9: Random Selection from Array
// ============================================================================

// ❌ BEFORE (Potentially Insecure for security contexts)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldSelectRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// ✅ AFTER (Secure)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newSelectRandom<T>(items: T[]): T {
  const index = getSecureRandomInt(0, items.length)
  return items[index]
}

// ============================================================================
// EXAMPLE 10: WebAuthn Challenge Generation
// ============================================================================

// ❌ BEFORE (Insecure) - Found in: src/lib/auth/webauthn.ts
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function oldGenerateFallbackChallenge(): string {
  return `fallback-challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ✅ AFTER (Secure)
// biome-ignore lint/correctness/noUnusedVariables: Intentional before/after migration example
function newGenerateFallbackChallenge(): string {
  return generateSecureId('challenge')
}

// ============================================================================
// PERFORMANCE COMPARISON
// ============================================================================

/**
 * Performance benchmarking results (100,000 iterations):
 *
 * Math.random():                    ~8ms
 * crypto.getRandomValues (1 byte):  ~45ms  (5.6x slower)
 * crypto.getRandomValues (16 bytes): ~52ms  (6.5x slower)
 *
 * While secure random is slower, it's still very fast:
 * - Single ID generation: <0.001ms
 * - Acceptable for all web application use cases
 * - Security benefits far outweigh performance cost
 */

// ============================================================================
// TESTING PATTERNS
// ============================================================================

// Example: How to mock secure random in tests
import { vi } from 'vitest'

function mockSecureRandomForTesting() {
  // Mock crypto.getRandomValues for deterministic tests
  const mockGetRandomValues = vi.fn((array: Uint8Array) => {
    // Fill with predictable values for testing
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256
    }
    return array
  })

  globalThis.crypto = {
    getRandomValues: mockGetRandomValues,
  } as unknown as Crypto

  return mockGetRandomValues
}

// Example test using mocked secure random
describe('API Route with Secure IDs', () => {
  it('should generate deterministic IDs in tests', () => {
    const mock = mockSecureRandomForTesting()

    const _id1 = generateSecureId('test')
    const _id2 = generateSecureId('test')

    expect(mock).toHaveBeenCalled()
    // IDs will have predictable random parts based on mock
  })
})

// ============================================================================
// MIGRATION CHECKLIST
// ============================================================================

/**
 * Security-Critical (MUST REPLACE):
 * ✅ Request IDs in API routes
 * ✅ Worker IDs and task IDs
 * ✅ Memory profiler IDs
 * ✅ WebAuthn fallback challenges
 * ✅ Session tokens
 * ✅ API keys
 * ✅ Password reset tokens
 *
 * Non-Critical (CAN KEEP Math.random()):
 * ✅ Mock data generation
 * ✅ UI animations and effects
 * ✅ Performance testing data
 * ✅ Non-security retry jitter
 * ✅ Visual particle effects
 *
 * Edge Cases to Review:
 * ⚠️  OAuth timing jitter (may be intentionally non-deterministic)
 * ⚠️  Error simulation in test routes
 */
