/**
 * Modern Vitest Test Setup Configuration
 * Optimized for Next.js 15 + React 19 + TypeScript testing
 *
 * Features:
 * - MSW 2.x for reliable API route testing
 * - Clean environment isolation
 * - Modern React testing setup with jest-dom matchers
 * - Streamlined database testing with intelligent routing
 * - Zero-budget sustainability optimizations
 */

import { Crypto } from '@peculiar/webcrypto'
import { config } from 'dotenv'
import { afterEach, beforeEach, vi } from 'vitest'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'
import { resetTestState, setupEnhancedTestIsolation } from './test-utils/cleanup'

// Modern MSW 2.x setup
import 'msw/node'

// Modern jest-dom matchers for enhanced assertions
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Load test environment variables
config({ path: '.env.test' })

// Essential test environment setup - minimal and clean
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test'
if (!process.env.SKIP_ENV_VALIDATION) process.env.SKIP_ENV_VALIDATION = 'true'

// Note: Individual test files handle their own environment mocking as needed
// This prevents conflicts while allowing targeted environment testing

// WebCrypto polyfill for JWT and crypto operations
if (!global.crypto?.subtle) {
  const crypto = new Crypto()
  Object.defineProperty(global, 'crypto', {
    value: crypto,
    writable: true,
    configurable: true,
  })
}

// Simple database configuration for tests
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn().mockResolvedValue([]),
  getDatabaseUrl: vi.fn(() => 'postgresql://test:test@localhost:5432/test'),
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
    projectId: 'test-project',
    poolMin: 2,
    poolMax: 20,
    poolIdleTimeout: 10000,
  },
}))

// Crypto polyfill is already set up above - individual tests can mock specific methods as needed

// Modern fetch setup for MSW compatibility
// MSW 2.x handles HTTP interception automatically with modern fetch API
if (typeof globalThis.fetch === 'undefined') {
  // Ensure fetch is available in Node.js environments
  try {
    const { fetch } = await import('undici')
    globalThis.fetch = fetch as typeof globalThis.fetch
  } catch {
    console.warn('Fetch polyfill not available - some tests may fail')
  }
}

// WebAuthn mock - simplified for modern testing patterns
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(() => ({
    challenge: 'test-challenge',
    rp: { name: 'Contribux', id: 'localhost' },
    user: { id: 'test-user-id', name: 'testuser', displayName: 'testuser' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'required',
    },
  })),
  verifyRegistrationResponse: vi.fn(() => ({
    verified: true,
    registrationInfo: {
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
      credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
      counter: 0,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  })),
  generateAuthenticationOptions: vi.fn(() => ({
    challenge: 'test-challenge',
    timeout: 60000,
    userVerification: 'required',
    rpId: 'localhost',
    allowCredentials: [],
  })),
  verifyAuthenticationResponse: vi.fn(() => ({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
    },
  })),
}))

// EventEmitter mock for middleware tests
vi.mock('events', () => ({
  EventEmitter: class MockEventEmitter {
    emit = vi.fn(() => true)
    on = vi.fn(() => this)
    once = vi.fn(() => this)
    off = vi.fn(() => this)
    removeListener = vi.fn(() => this)
    removeAllListeners = vi.fn(() => this)
    setMaxListeners = vi.fn(() => this)
    getMaxListeners = vi.fn(() => 10)
    listeners = vi.fn(() => [])
    rawListeners = vi.fn(() => [])
    listenerCount = vi.fn(() => 0)
    prependListener = vi.fn(() => this)
    prependOnceListener = vi.fn(() => this)
    eventNames = vi.fn(() => [])
  },
}))

// Audit system mock - simplified for tests
vi.mock('@/lib/auth/audit', () => ({
  logSecurityEvent: vi.fn(async params => ({
    id: 'mock-audit-log-id',
    ...params,
    created_at: new Date(),
  })),
  logAuthenticationAttempt: vi.fn(async () => ({
    recentFailures: 0,
    accountLocked: false,
  })),
  logSessionActivity: vi.fn(async () => ({
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
  getEventSeverity: vi.fn(async () => 'warning'),
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

// Suppress verbose console output in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  console.log = vi.fn()
  console.debug = vi.fn()
  console.info = vi.fn()
  // Keep warn and error for debugging test issues
}

// Enhanced test isolation setup with memory optimization
setupEnhancedTestIsolation()

// Global test isolation setup with database cleanup
beforeEach(() => {
  resetTestState()
})

afterEach(async () => {
  resetTestState()
})

// Cleanup database connections after all tests
import { afterAll } from 'vitest'

afterAll(async () => {
  const dbManager = TestDatabaseManager.getInstance()
  await dbManager.cleanup()

  // Clear global test state
  if ((global as NodeJS.Global).__testCleanupRegistry) {
    ;(global as NodeJS.Global).__testCleanupRegistry?.clear()
  }
})
