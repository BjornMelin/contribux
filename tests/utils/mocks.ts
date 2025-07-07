/**
 * Common mock definitions for Vitest 3.2+ testing
 * Extracted from setup.ts for better modularity
 */

import { vi } from 'vitest'

/**
 * Database configuration mock for testing
 */
export function setupDatabaseMock() {
  vi.mock('@/lib/db/config', () => ({
    sql: vi.fn().mockResolvedValue([]),
    getDatabaseUrl: vi.fn(() => 'postgresql://test:test@localhost:5432/test'),
    vectorConfig: {
      efSearch: 200,
      similarityThreshold: 0.7,
      textWeight: 0.3,
      vectorWeight: 0.7,
    },
    dbBranches: { main: 'main', dev: 'dev', test: 'test' },
    dbConfig: {
      projectId: 'test-project',
      poolMin: 2,
      poolMax: 20,
      poolIdleTimeout: 10000,
    },
  }))
}

/**
 * SimpleWebAuthn server mock for authentication testing
 */
export function setupWebAuthnServerMock() {
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
}

/**
 * Audit system mock for security testing
 */
export function setupAuditSystemMock() {
  vi.mock('@/lib/auth/audit', () => ({
    logSecurityEvent: vi.fn(async params => ({
      id: 'mock-audit-log-id',
      ...params,
      created_at: new Date(),
    })),
    logAuthenticationAttempt: vi.fn(async () => ({ recentFailures: 0, accountLocked: false })),
    logSessionActivity: vi.fn(async () => ({ anomalyDetected: false, anomalyType: undefined })),
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
    generateSecurityReport: vi.fn(async () => ({ summary: { total_events: 0 }, events: [] })),
    exportAuditReport: vi.fn(async params => {
      if (params.format === 'csv')
        return 'event_type,event_severity,user_id,ip_address,created_at,success\n'
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
}

/**
 * Setup fetch polyfill for Node.js environments
 */
export async function setupFetchPolyfill() {
  if (typeof globalThis.fetch === 'undefined') {
    try {
      const { fetch } = await import('undici')
      globalThis.fetch = fetch as typeof globalThis.fetch
    } catch {
      console.warn('Fetch polyfill not available - some tests may fail')
    }
  }
}

/**
 * Setup all common mocks for testing
 */
export function setupCommonMocks() {
  setupDatabaseMock()
  setupWebAuthnServerMock()
  setupAuditSystemMock()
}
