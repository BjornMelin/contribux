/**
 * Crypto and security mocks for Vitest 3.2+ testing environment
 * Extracted from setup.ts for better modularity and maintainability
 */

import { vi } from 'vitest'

/**
 * Modern WebCrypto polyfill for Node.js test environment
 * Compatible with Vitest 3.2+ and Node.js 18+
 */
export function setupWebCryptoPolyfill() {
  const { webcrypto } = require('node:crypto')

  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true,
    })
  }
}

/**
 * WebAuthn API mocks for authentication testing
 * Provides realistic credential creation and validation
 */
export function setupWebAuthnMocks() {
  // Mock PublicKeyCredential if not available
  if (typeof PublicKeyCredential === 'undefined') {
    globalThis.PublicKeyCredential = class MockPublicKeyCredential {
      static isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(true)
      static isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)

      id = 'mock-credential-id'
      type = 'public-key' as const
      rawId = new ArrayBuffer(16)
      response = {
        clientDataJSON: new ArrayBuffer(32),
        attestationObject: new ArrayBuffer(64),
      }

      getClientExtensionResults() {
        return {}
      }
    } as typeof PublicKeyCredential
  }

  // Mock navigator.credentials
  if (!global.navigator) {
    global.navigator = {} as Navigator
  }

  global.navigator.credentials = {
    create: vi.fn().mockResolvedValue(new PublicKeyCredential()),
    get: vi.fn().mockResolvedValue(new PublicKeyCredential()),
    store: vi.fn().mockResolvedValue(undefined),
    preventSilentAccess: vi.fn().mockResolvedValue(undefined),
  }
}

/**
 * Audit system mocks for security testing
 * Provides configurable audit responses
 */
export interface MockAuditOptions {
  enabled?: boolean
  logLevel?: 'info' | 'warn' | 'error'
  throwOnError?: boolean
}

export function setupAuditMocks(options: MockAuditOptions = {}) {
  const { enabled = true, logLevel = 'info', throwOnError = false } = options

  const mockAuditLog = vi
    .fn()
    .mockImplementation((level: string, message: string, data?: unknown) => {
      if (!enabled) return

      if (logLevel === 'error' && throwOnError) {
        throw new Error(`Audit error: ${message}`)
      }

      // Silent mock - just capture calls
      return Promise.resolve({ level, message, data, timestamp: new Date() })
    })

  // Mock audit service
  vi.mock('@/lib/audit', () => ({
    auditLog: mockAuditLog,
    auditError: vi
      .fn()
      .mockImplementation((error: Error, context?: unknown) =>
        mockAuditLog('error', error.message, { error: error.stack, context })
      ),
    auditSuccess: vi
      .fn()
      .mockImplementation((action: string, context?: unknown) =>
        mockAuditLog('info', `Success: ${action}`, context)
      ),
  }))

  return { mockAuditLog }
}

/**
 * EventEmitter mocks for Node.js compatibility
 * Required for some security modules
 */
export function setupEventEmitterMocks() {
  if (!global.EventTarget) {
    const { EventEmitter } = require('node:events')

    // Create a simple EventTarget polyfill
    global.EventTarget = class MockEventTarget {
      private emitter = new EventEmitter()

      addEventListener(type: string, listener: EventListener) {
        this.emitter.on(type, listener)
      }

      removeEventListener(type: string, listener: EventListener) {
        this.emitter.off(type, listener)
      }

      dispatchEvent(event: Event) {
        this.emitter.emit(event.type, event)
        return true
      }
    } as typeof EventTarget
  }
}

/**
 * Complete crypto and security setup for tests
 * One-shot function for comprehensive security mocking
 */
export function setupSecurityMocks(options: MockAuditOptions = {}) {
  setupWebCryptoPolyfill()
  setupWebAuthnMocks()
  setupEventEmitterMocks()

  const auditMocks = setupAuditMocks(options)

  return {
    ...auditMocks,
    cleanup: () => {
      vi.restoreAllMocks()
    },
  }
}

/**
 * Quick security setup for individual test files
 * Modern pattern for focused test isolation
 */
export function useCryptoMocks(options?: MockAuditOptions) {
  return setupSecurityMocks(options)
}
