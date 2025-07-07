/**
 * WebAuthn Test Utilities and Factories
 * Comprehensive utilities for WebAuthn testing across all test types
 */

import { expect, vi } from 'vitest'

// Internal counters for unique ID generation
let credentialCounter = 0
let authenticationCounter = 0
let storedCredentialCounter = 0

// Type definitions for WebAuthn test data
export interface MockCredentialData {
  id: string
  rawId: string
  response: {
    clientDataJSON: string
    attestationObject: string
  }
  type: 'public-key'
}

export interface MockAuthenticationData {
  id: string
  rawId: string
  response: {
    clientDataJSON: string
    authenticatorData: string
    signature: string
    userHandle?: string
  }
  type: 'public-key'
}

export interface MockWebAuthnCredential {
  id: string
  userId: string
  credentialId: string
  publicKey: Buffer
  counter: number
  deviceName?: string
  createdAt: Date
  lastUsedAt?: Date
}

export interface MockRegistrationOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ alg: number; type: string }>
  timeout: number
  attestation: string
  authenticatorSelection?: {
    authenticatorAttachment?: string
    userVerification?: string
    residentKey?: string
  }
  excludeCredentials?: Array<{
    id: string
    type: string
    transports: string[]
  }>
}

export interface MockAuthenticationOptions {
  challenge: string
  timeout: number
  userVerification: string
  rpId: string
  allowCredentials?: Array<{
    id: string
    type: string
    transports: string[]
  }>
}

/**
 * Utility functions for creating mock WebAuthn registration credentials
 */

function createClientDataJSON(type: string): string {
  const clientData = {
    type,
    challenge: 'test-challenge',
    origin: 'http://localhost:3000',
    crossOrigin: false,
  }
  return btoa(JSON.stringify(clientData))
}

function createAttestationObject(): string {
  // Simplified mock attestation object
  return btoa('mock-attestation-object-data')
}

export function createWebAuthnCredential(
  overrides: Partial<MockCredentialData> = {}
): MockCredentialData {
  const id = `test-credential-${++credentialCounter}-${Date.now()}`

  return {
    id,
    rawId: `raw-${id}`,
    response: {
      clientDataJSON: createClientDataJSON('webauthn.create'),
      attestationObject: createAttestationObject(),
    },
    type: 'public-key',
    ...overrides,
  }
}

export function createWebAuthnCredentialBatch(
  count: number,
  baseOverrides: Partial<MockCredentialData> = {}
): MockCredentialData[] {
  return Array.from({ length: count }, (_, i) =>
    createWebAuthnCredential({
      ...baseOverrides,
      id: `batch-credential-${i}-${Date.now()}`,
    })
  )
}

export function createInvalidWebAuthnCredential(): MockCredentialData {
  return {
    id: 'invalid-credential-fail',
    rawId: 'invalid-raw-id',
    response: {
      clientDataJSON: 'invalid-client-data',
      attestationObject: 'invalid-attestation',
    },
    type: 'public-key',
  }
}

export function createLargeWebAuthnCredential(): MockCredentialData {
  return createWebAuthnCredential({
    id: 'a'.repeat(1000),
    rawId: 'b'.repeat(1000),
    response: {
      clientDataJSON: 'c'.repeat(10000),
      attestationObject: 'd'.repeat(10000),
    },
  })
}

export function createWebAuthnCredentialWithDeviceName(
  deviceName: string
): MockCredentialData & { deviceName: string } {
  return {
    ...createWebAuthnCredential(),
    deviceName,
  }
}

/**
 * Utility functions for creating mock WebAuthn authentication data
 */

function createAuthClientDataJSON(type: string): string {
  const clientData = {
    type,
    challenge: 'test-auth-challenge',
    origin: 'http://localhost:3000',
    crossOrigin: false,
  }
  return btoa(JSON.stringify(clientData))
}

function createAuthenticatorData(): string {
  // Simplified mock authenticator data
  return btoa('mock-authenticator-data')
}

function createSignature(): string {
  // Simplified mock signature
  return btoa('mock-signature-data')
}

export function createWebAuthnAuthentication(
  credentialId?: string,
  overrides: Partial<MockAuthenticationData> = {}
): MockAuthenticationData {
  const id = credentialId || `auth-credential-${++authenticationCounter}-${Date.now()}`

  return {
    id,
    rawId: `auth-raw-${id}`,
    response: {
      clientDataJSON: createAuthClientDataJSON('webauthn.get'),
      authenticatorData: createAuthenticatorData(),
      signature: createSignature(),
      userHandle: 'test-user-handle',
    },
    type: 'public-key',
    ...overrides,
  }
}

export function createInvalidWebAuthnAuthentication(): MockAuthenticationData {
  return {
    id: 'invalid-auth-credential-fail',
    rawId: 'invalid-auth-raw-id',
    response: {
      clientDataJSON: 'invalid-client-data',
      authenticatorData: 'invalid-auth-data',
      signature: 'invalid-signature',
    },
    type: 'public-key',
  }
}

export function createWebAuthnAuthenticationWithoutUserHandle(
  credentialId?: string
): MockAuthenticationData {
  const auth = createWebAuthnAuthentication(credentialId)
  auth.response.userHandle = undefined
  return auth
}

export function createWebAuthnAuthenticationWithMaliciousData(): MockAuthenticationData {
  return createWebAuthnAuthentication('malicious-credential', {
    response: {
      clientDataJSON: '<script>alert("xss")</script>',
      authenticatorData: 'DROP TABLE webauthn_credentials;',
      signature: '<img src=x onerror=alert("xss")>',
    },
  })
}

/**
 * Utility functions for creating mock stored WebAuthn credentials
 */

export function createStoredWebAuthnCredential(
  userId: string,
  overrides: Partial<MockWebAuthnCredential> = {}
): MockWebAuthnCredential {
  const credentialId = `stored-credential-${++storedCredentialCounter}-${Date.now()}`

  return {
    id: `uuid-${credentialId}`,
    userId,
    credentialId,
    publicKey: Buffer.from([1, 2, 3, 4, 5, storedCredentialCounter]),
    counter: 0,
    deviceName: 'Test Device',
    createdAt: new Date(),
    ...overrides,
  }
}

export function createStoredWebAuthnCredentialBatch(
  userId: string,
  count: number
): MockWebAuthnCredential[] {
  return Array.from({ length: count }, (_, i) =>
    createStoredWebAuthnCredential(userId, {
      deviceName: `Test Device ${i + 1}`,
      createdAt: new Date(Date.now() - (count - i) * 1000), // Different timestamps
    })
  )
}

export function createStoredWebAuthnCredentialWithHighCounter(
  userId: string
): MockWebAuthnCredential {
  return createStoredWebAuthnCredential(userId, {
    counter: Number.MAX_SAFE_INTEGER - 1,
    lastUsedAt: new Date(),
  })
}

export function createExpiredStoredWebAuthnCredential(userId: string): MockWebAuthnCredential {
  return createStoredWebAuthnCredential(userId, {
    createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
    lastUsedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
  })
}

/**
 * Utility functions for creating mock WebAuthn options
 */

export function createWebAuthnRegistrationOptions(
  userId: string,
  userEmail: string
): MockRegistrationOptions {
  return {
    challenge: `reg-challenge-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    rp: { name: 'Contribux Test', id: 'localhost' },
    user: {
      id: userId,
      name: userEmail,
      displayName: userEmail.split('@')[0],
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    excludeCredentials: [],
  }
}

export function createWebAuthnAuthenticationOptions(
  userCredentials: string[] = []
): MockAuthenticationOptions {
  return {
    challenge: `auth-challenge-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timeout: 60000,
    userVerification: 'preferred',
    rpId: 'localhost',
    allowCredentials:
      userCredentials.length > 0
        ? userCredentials.map(credId => ({
            id: credId,
            type: 'public-key',
            transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
          }))
        : undefined,
  }
}

export function createWebAuthnOptionsWithExcludedCredentials(
  existingCredentials: string[]
): MockRegistrationOptions {
  const baseOptions = createWebAuthnRegistrationOptions('test-user', 'test@example.com')
  return {
    ...baseOptions,
    excludeCredentials: existingCredentials.map(credId => ({
      id: credId,
      type: 'public-key',
      transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    })),
  }
}

/**
 * Mock setup utility functions for different test scenarios
 */

/**
 * Setup successful WebAuthn mocks
 */
export function setupSuccessfulWebAuthnMocks() {
  const mockGenerateRegistrationOptions = vi.fn()
  const mockVerifyRegistrationResponse = vi.fn()
  const mockGenerateAuthenticationOptions = vi.fn()
  const mockVerifyAuthenticationResponse = vi.fn()

  vi.doMock('@simplewebauthn/server', () => ({
    generateRegistrationOptions: mockGenerateRegistrationOptions,
    verifyRegistrationResponse: mockVerifyRegistrationResponse,
    generateAuthenticationOptions: mockGenerateAuthenticationOptions,
    verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
  }))

  return {
    mockGenerateRegistrationOptions,
    mockVerifyRegistrationResponse,
    mockGenerateAuthenticationOptions,
    mockVerifyAuthenticationResponse,
  }
}

/**
 * Setup failing WebAuthn mocks
 */
export function setupFailingWebAuthnMocks() {
  const mocks = setupSuccessfulWebAuthnMocks()

  mocks.mockVerifyRegistrationResponse.mockResolvedValue({ verified: false })
  mocks.mockVerifyAuthenticationResponse.mockResolvedValue({ verified: false })

  return mocks
}

/**
 * Setup error-throwing WebAuthn mocks
 */
export function setupErrorWebAuthnMocks() {
  const mocks = setupSuccessfulWebAuthnMocks()

  const error = new Error('WebAuthn operation failed')
  mocks.mockGenerateRegistrationOptions.mockRejectedValue(error)
  mocks.mockVerifyRegistrationResponse.mockRejectedValue(error)
  mocks.mockGenerateAuthenticationOptions.mockRejectedValue(error)
  mocks.mockVerifyAuthenticationResponse.mockRejectedValue(error)

  return mocks
}

/**
 * Setup database mocks for WebAuthn operations
 */
export function setupWebAuthnDatabaseMocks() {
  const mockSql = vi.fn()

  vi.doMock('@/lib/db/config', () => ({
    sql: mockSql,
  }))

  return { mockSql }
}

/**
 * Setup complete WebAuthn test environment
 */
export function setupCompleteWebAuthnEnvironment() {
  const webauthnMocks = setupSuccessfulWebAuthnMocks()
  const databaseMocks = setupWebAuthnDatabaseMocks()

  // Mock security config
  vi.doMock('@/lib/security/feature-flags', () => ({
    securityFeatures: { webauthn: true },
    getSecurityConfig: () => ({
      webauthn: {
        rpName: 'Contribux Test',
        rpId: 'localhost',
        origin: 'http://localhost:3000',
        timeout: 60000,
      },
    }),
  }))

  // Mock NextAuth session
  const mockSession = {
    user: { id: 'test-user', email: 'test@example.com' },
    expires: '2024-12-31',
  }

  vi.doMock('next-auth', () => ({
    getServerSession: vi.fn().mockResolvedValue(mockSession),
  }))

  return {
    ...webauthnMocks,
    ...databaseMocks,
    mockSession,
  }
}

/**
 * Test data generator utility functions for specific scenarios
 */

/**
 * Generate test data for user registration flow
 */
export function createWebAuthnRegistrationFlowScenario(userId: string, userEmail: string) {
  return {
    user: { id: userId, email: userEmail },
    options: createWebAuthnRegistrationOptions(userId, userEmail),
    credential: createWebAuthnCredential(),
    expectedResult: {
      verified: true,
      credentialId: expect.any(String),
    },
  }
}

/**
 * Generate test data for user authentication flow
 */
export function createWebAuthnAuthenticationFlowScenario(
  userId: string,
  existingCredentials: string[] = []
) {
  const credentialId = existingCredentials[0] || 'existing-credential'
  return {
    userId,
    options: createWebAuthnAuthenticationOptions(existingCredentials),
    authData: createWebAuthnAuthentication(credentialId),
    storedCredential: createStoredWebAuthnCredential(userId, { credentialId }),
    expectedResult: {
      verified: true,
      userId,
      credentialId,
    },
  }
}

/**
 * Generate test data for multiple credentials scenario
 */
export function createWebAuthnMultipleCredentialsScenario(userId: string, count = 3) {
  const credentials = createWebAuthnCredentialBatch(count)
  const storedCredentials = createStoredWebAuthnCredentialBatch(userId, count)

  return {
    userId,
    credentials,
    storedCredentials,
    authData: credentials.map(cred => createWebAuthnAuthentication(cred.id)),
  }
}

/**
 * Generate test data for security attack scenarios
 */
export function createWebAuthnSecurityAttackScenarios() {
  return {
    replayAttack: {
      credential: createWebAuthnCredential(),
      duplicateAttempt: createWebAuthnCredential(), // Same credential used twice
    },
    maliciousData: {
      credential: createWebAuthnCredential({
        id: '<script>alert("xss")</script>',
        response: {
          clientDataJSON: 'DROP TABLE users;',
          attestationObject: '"><script>alert("xss")</script>',
        },
      }),
      authData: createWebAuthnAuthenticationWithMaliciousData(),
    },
    timingAttack: {
      validCredential: 'existing-credential-123',
      invalidCredential: 'non-existent-credential-456',
    },
  }
}

/**
 * Generate test data for error scenarios
 */
export function createWebAuthnErrorScenarios() {
  return {
    invalidCredential: createInvalidWebAuthnCredential(),
    invalidAuth: createInvalidWebAuthnAuthentication(),
    expiredChallenge: {
      challenge: `expired-challenge-${Date.now() - 10 * 60 * 1000}`, // 10 minutes ago
    },
    malformedRequest: {
      response: { invalid: 'data' },
      expectedChallenge: null,
    },
    databaseError: new Error('Database connection failed'),
    webauthnError: new Error('WebAuthn verification failed'),
  }
}

/**
 * Browser WebAuthn API mock utility functions for E2E testing
 */

export function mockNavigatorCredentials() {
  // Mock the browser WebAuthn API
  const mockCredentials = {
    create: vi.fn(),
    get: vi.fn(),
  }

  Object.defineProperty(global, 'navigator', {
    value: {
      credentials: mockCredentials,
    },
    writable: true,
  })

  return mockCredentials
}

export function setupSuccessfulBrowserWebAuthnFlow() {
  const mockCredentials = mockNavigatorCredentials()

  // Mock successful credential creation
  mockCredentials.create.mockResolvedValue({
    id: 'browser-credential-id',
    rawId: new ArrayBuffer(16),
    response: {
      clientDataJSON: new ArrayBuffer(32),
      attestationObject: new ArrayBuffer(64),
    },
    type: 'public-key',
  })

  // Mock successful authentication
  mockCredentials.get.mockResolvedValue({
    id: 'browser-credential-id',
    rawId: new ArrayBuffer(16),
    response: {
      clientDataJSON: new ArrayBuffer(32),
      authenticatorData: new ArrayBuffer(64),
      signature: new ArrayBuffer(32),
      userHandle: new ArrayBuffer(8),
    },
    type: 'public-key',
  })

  return mockCredentials
}

export function setupFailingBrowserWebAuthnFlow() {
  const mockCredentials = mockNavigatorCredentials()

  const error = new Error('WebAuthn operation failed')
  mockCredentials.create.mockRejectedValue(error)
  mockCredentials.get.mockRejectedValue(error)

  return mockCredentials
}

/**
 * Helper functions for common test operations
 */
export const WebAuthnTestHelpers = {
  /**
   * Generate a valid challenge string
   */
  generateChallenge(): string {
    return `test-challenge-${Date.now()}-${Math.random().toString(36).substring(7)}`
  },

  /**
   * Generate a valid user ID
   */
  generateUserId(): string {
    return `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`
  },

  /**
   * Generate a valid credential ID
   */
  generateCredentialId(): string {
    return `test-credential-${Date.now()}-${Math.random().toString(36).substring(7)}`
  },

  /**
   * Create a base64url encoded string
   */
  base64urlEncode(data: string): string {
    return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  },

  /**
   * Create mock ArrayBuffer for WebAuthn operations
   */
  createMockArrayBuffer(size = 32): ArrayBuffer {
    return new ArrayBuffer(size)
  },

  /**
   * Validate WebAuthn response structure
   */
  isValidWebAuthnResponse(response: unknown): boolean {
    return (
      response &&
      typeof response === 'object' &&
      typeof (response as Record<string, unknown>).id === 'string' &&
      typeof (response as Record<string, unknown>).rawId === 'string' &&
      (response as Record<string, unknown>).type === 'public-key' &&
      (response as Record<string, unknown>).response &&
      typeof ((response as Record<string, unknown>).response as Record<string, unknown>)
        ?.clientDataJSON === 'string'
    )
  },

  /**
   * Wait for async operations to complete
   */
  async waitForAsyncOps(ms = 10): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  },

  /**
   * Clean up test environment
   */
  cleanup(): void {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()
  },
}
