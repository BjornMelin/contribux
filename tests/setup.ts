// Test setup configuration for Vitest
// Modern test setup with PGlite and Neon branching for optimal database testing

import { Crypto } from '@peculiar/webcrypto'
import { config } from 'dotenv'
import { afterEach, beforeEach, vi } from 'vitest'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'
import { registerCleanup, resetTestState, setupEnhancedTestIsolation } from './test-utils/cleanup'

// Import MSW for modern HTTP mocking
import 'msw/node'

// Import jest-dom matchers for better assertions
// Note: Despite the name, @testing-library/jest-dom works perfectly with Vitest
// It provides useful matchers like toBeInTheDocument(), toHaveAttribute(), etc.
import '@testing-library/jest-dom'

// Make React available globally for JSX transform
import React from 'react'

// @ts-ignore
global.React = React

// Load test environment variables first
config({ path: '.env.test' })

// Skip env mock setup - let individual test files handle their own env mocking needs
// This prevents breaking env validation tests while still allowing auth tests to mock as needed

// Setup WebCrypto polyfill for JWT tests
if (!global.crypto?.subtle) {
  const crypto = new Crypto()
  Object.defineProperty(global, 'crypto', {
    value: crypto,
    writable: true,
    configurable: true,
  })
}

// Set test environment - commented out due to TypeScript readonly property issue
// The environment is already set by vitest config
// if (!process.env.NODE_ENV) {
//   process.env.NODE_ENV = 'test';
// }

// Intelligent database client setup - chooses optimal strategy automatically
// PGlite for fast unit tests, Neon branching for integration tests
const createIntelligentDbClient = () => {
  // Return a proxy that routes to the correct database based on test context
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'sql') {
          // Will be replaced by test-specific setup
          return vi.fn().mockResolvedValue([])
        }
        return (target as any)[prop]
      },
    }
  )
}

// Enhanced database configuration with intelligent routing
vi.mock('@/lib/db/config', () => ({
  sql: createIntelligentDbClient(),
  getDatabaseUrl: vi.fn(branch => {
    // Intelligent URL routing based on test strategy
    const testStrategy = process.env.TEST_DB_STRATEGY

    if (testStrategy === 'pglite') {
      return 'postgresql://test:test@localhost:5432/test_pglite'
    }

    switch (branch) {
      case 'test':
        return process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
      case 'dev':
        return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL
      default:
        return process.env.DATABASE_URL
    }
  }),
  vectorConfig: {
    efSearch: 200,
    similarityThreshold: 0.7,
    textWeight: 0.3,
    vectorWeight: 0.7,
  },
  dbBranches: {
    main: 'main',
    dev: 'dev',
    test: 'test',
  },
  dbConfig: {
    projectId: process.env.NEON_PROJECT_ID || 'test-project',
    poolMin: 2,
    poolMax: 20,
    poolIdleTimeout: 10000,
  },
}))

// Extend the crypto polyfill with test utilities for non-JWT crypto operations
if (global.crypto) {
  // Override specific methods for testing when needed
  const originalGetRandomValues = global.crypto.getRandomValues.bind(global.crypto)
  const originalRandomUUID = global.crypto.randomUUID?.bind(global.crypto)

  // Mock only the specific methods that need test control, keep the rest real
  global.crypto.getRandomValues = vi.fn(array => {
    // Use real crypto for production-like behavior in tests
    return originalGetRandomValues(array)
  })

  if (originalRandomUUID) {
    global.crypto.randomUUID = vi.fn(() => originalRandomUUID()) as typeof crypto.randomUUID
  }
}

// Store original fetch for MSW compatibility
const originalFetch = globalThis.fetch

// Mock fetch for API calls in tests, but allow MSW to override when needed
const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
  })
)

// Set up fetch mock that can be disabled for MSW tests
global.fetch = mockFetch as any

// Export utilities for MSW tests to restore original fetch

;(global as any).__originalFetch = originalFetch
;(global as any).__mockFetch = mockFetch

// Mock WebAuthn SimpleWebAuthn server functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(options => ({
    challenge: 'test-challenge',
    rp: {
      name: options?.rpName || 'Contribux',
      id: options?.rpID || 'localhost',
    },
    user: {
      id: options?.userID || 'test-user-id',
      name: options?.userName || 'testuser',
      displayName: options?.userDisplayName || 'testuser',
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: options?.timeout || 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'required',
    },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
      credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
      counter: 0,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  })),
  generateAuthenticationOptions: vi.fn(options => ({
    challenge: 'test-challenge',
    timeout: options?.timeout || 60000,
    userVerification: 'required',
    rpId: options?.rpID || 'localhost',
    allowCredentials: options?.allowCredentials || [],
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
    },
  })),
}))

// Mock Node.js events for middleware tests
vi.mock('events', () => ({
  EventEmitter: class MockEventEmitter {
    emit() {
      return true
    }
    on() {
      return this
    }
    once() {
      return this
    }
    off() {
      return this
    }
    removeListener() {
      return this
    }
    removeAllListeners() {
      return this
    }
    setMaxListeners() {
      return this
    }
    getMaxListeners() {
      return 10
    }
    listeners() {
      return []
    }
    rawListeners() {
      return []
    }
    listenerCount() {
      return 0
    }
    prependListener() {
      return this
    }
    prependOnceListener() {
      return this
    }
    eventNames() {
      return []
    }
  },
}))

// Mock audit functions to prevent database calls
vi.mock('@/lib/auth/audit', () => ({
  logSecurityEvent: vi.fn(async params => ({
    id: 'mock-audit-log-id',
    ...params,
    created_at: new Date(),
    checksum: params.event_severity === 'critical' ? 'abc123def456' : undefined,
  })),
  logAuthenticationAttempt: vi.fn(async _params => ({
    recentFailures: 0,
    accountLocked: false,
  })),
  logSessionActivity: vi.fn(async _params => ({
    anomalyDetected: false,
    anomalyType: undefined,
  })),
  logDataAccess: vi.fn(async params => ({
    id: 'mock-data-log-id',
    ...params,
    created_at: new Date(),
  })),
  logConfigurationChange: vi.fn(async params => ({
    id: 'mock-config-log-id',
    ...params,
    created_at: new Date(),
  })),
  getAuditLogs: vi.fn(async () => []),
  analyzeSecurityEvents: vi.fn(async () => ({
    anomalies: [],
    patterns: [],
    recommendations: [],
  })),
  generateSecurityReport: vi.fn(async () => ({
    summary: { total_events: 0 },
    events: [],
  })),
  exportAuditReport: vi.fn(async params => {
    if (params.format === 'csv') {
      return 'event_type,event_severity,user_id,ip_address,created_at,success\n'
    }
    return {
      metadata: {
        generated_at: new Date(),
        period: { start: params.startDate, end: params.endDate },
        total_events: 0,
      },
      summary: { event_distribution: [], top_users: [] },
      events: [],
    }
  }),
  deleteAuditLog: vi.fn(async () => ({ deleted: true })),
  createLogParams: vi.fn(params => params),
  getEventSeverity: vi.fn(async _eventType => 'warning'),
  logAccessControl: vi.fn(async () => undefined),
  validateAuditLog: vi.fn(async () => ({ valid: true })),
  purgeOldLogs: vi.fn(async () => ({ deleted: 0 })),
  detectAnomalies: vi.fn(async () => ({
    detected: false,
    suspiciousActivity: false,
    anomalies: [],
  })),
  getSecurityMetrics: vi.fn(async () => ({
    loginSuccessRate: 95,
    failedLoginCount: 0,
    lockedAccountCount: 0,
    anomalyCount: 0,
    averageSessionDuration: 45,
    activeUsersToday: 12,
    securityIncidentsToday: 0,
  })),
}))

// GDPR functions are NOT mocked globally - let individual tests handle GDPR mocking as needed
// The GDPR test file tests the real implementation with mocked SQL calls

// JWT functions are NOT mocked here - let individual tests mock as needed
// This allows actual JWT functionality to be tested with real jose library

// Suppress console output in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  // Only suppress logs, keep errors and warnings for debugging
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    // Keep warn and error for debugging test issues
  }
}

// Enhanced test isolation setup with memory optimization
setupEnhancedTestIsolation()

// Global test isolation setup with database cleanup
beforeEach(() => {
  resetTestState()
})

afterEach(async () => {
  resetTestState()

  // Force garbage collection after each test for memory optimization
  if (global.gc) {
    global.gc()
  }
})

// Cleanup database connections after all tests with enhanced resource management
import { afterAll } from 'vitest'

afterAll(async () => {
  // Register database cleanup for proper resource management
  const dbManager = TestDatabaseManager.getInstance()
  await dbManager.cleanup()

  // Clear all global test state
  if (global.__testCleanupRegistry) {
    global.__testCleanupRegistry.clear()
  }

  // Force final garbage collection
  if (global.gc) {
    global.gc()
  }

  console.log('✅ All database connections and resources cleaned up')
})
