// Test setup configuration for Vitest
import { config } from "dotenv";
import { vi } from "vitest";
import { Crypto } from "@peculiar/webcrypto";

// Load test environment variables first
config({ path: ".env.test" });

// Skip env mock setup - let individual test files handle their own env mocking needs
// This prevents breaking env validation tests while still allowing auth tests to mock as needed

// Setup WebCrypto polyfill for JWT tests
if (!global.crypto?.subtle) {
  const crypto = new Crypto();
  Object.defineProperty(global, 'crypto', {
    value: crypto,
    writable: true,
    configurable: true
  });
}

// Set test environment using Object.defineProperty to override readonly property
Object.defineProperty(process.env, 'NODE_ENV', {
  value: 'test',
  writable: true,
  configurable: true,
});

// Create mock database client for tests that don't need real database
const createMockSqlClient = () => {
  const mockSql = vi.fn();
  mockSql.mockResolvedValue([]);
  return mockSql;
};

// Global mock for database client
vi.mock("@/lib/db/config", () => ({
  sql: createMockSqlClient(),
  getDatabaseUrl: vi.fn((branch) => {
    switch (branch) {
      case 'test':
        return process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
      case 'dev':
        return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
      default:
        return process.env.DATABASE_URL;
    }
  }),
  vectorConfig: {
    efSearch: 200,
    similarityThreshold: 0.7,
    textWeight: 0.3,
    vectorWeight: 0.7,
  },
  dbBranches: {
    main: 'test-main',
    dev: 'test-dev', 
    test: 'test-test',
  },
  dbConfig: {
    projectId: 'test-project',
    poolMin: 2,
    poolMax: 20,
    poolIdleTimeout: 10000,
  },
}));

// Extend the crypto polyfill with test utilities for non-JWT crypto operations
if (global.crypto) {
  // Override specific methods for testing when needed
  const originalGetRandomValues = global.crypto.getRandomValues.bind(global.crypto);
  const originalRandomUUID = global.crypto.randomUUID?.bind(global.crypto);
  
  // Mock only the specific methods that need test control, keep the rest real
  global.crypto.getRandomValues = vi.fn((array) => {
    // Use real crypto for production-like behavior in tests
    return originalGetRandomValues(array);
  });
  
  if (originalRandomUUID) {
    global.crypto.randomUUID = vi.fn(() => originalRandomUUID()) as typeof crypto.randomUUID;
  }
}

// Mock fetch for API calls in tests
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
  })
) as any;

// Mock WebAuthn SimpleWebAuthn server functions
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
      userVerification: 'required'
    }
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
      credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
      counter: 0,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false
    }
  })),
  generateAuthenticationOptions: vi.fn(() => ({
    challenge: 'test-challenge',
    timeout: 60000,
    userVerification: 'required',
    rpId: 'localhost',
    allowCredentials: []
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
      credentialID: new Uint8Array([1, 2, 3, 4, 5])
    }
  }))
}));

// Mock Node.js events for middleware tests
vi.mock('events', () => ({
  EventEmitter: class MockEventEmitter {
    emit() { return true; }
    on() { return this; }
    once() { return this; }
    off() { return this; }
    removeListener() { return this; }
    removeAllListeners() { return this; }
    setMaxListeners() { return this; }
    getMaxListeners() { return 10; }
    listeners() { return []; }
    rawListeners() { return []; }
    listenerCount() { return 0; }
    prependListener() { return this; }
    prependOnceListener() { return this; }
    eventNames() { return []; }
  }
}));

// Mock audit functions to prevent database calls
vi.mock('@/lib/auth/audit', () => ({
  logSecurityEvent: vi.fn(async (params) => ({
    id: 'mock-audit-log-id',
    ...params,
    created_at: new Date(),
  })),
  getAuditLogs: vi.fn(async () => []),
  analyzeSecurityEvents: vi.fn(async () => ({
    anomalies: [],
    patterns: [],
    recommendations: []
  })),
  generateSecurityReport: vi.fn(async () => ({
    summary: { total_events: 0 },
    events: []
  })),
}));

// Mock GDPR functions
vi.mock('@/lib/auth/gdpr', () => ({
  recordUserConsent: vi.fn(async () => ({ id: 'consent-id' })),
  checkConsentRequired: vi.fn(async () => false),
  getUserConsentStatus: vi.fn(async () => ({ required: false, consents: [] })),
  exportUserData: vi.fn(async () => ({ data: {}, metadata: {} })),
  deleteAllUserData: vi.fn(async () => ({ deleted: true })),
  anonymizeUserData: vi.fn(async () => ({ anonymized: true })),
}));

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
  };
}
