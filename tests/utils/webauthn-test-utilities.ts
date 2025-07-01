/**
 * WebAuthn Test Utilities and Factories
 * Comprehensive utilities for WebAuthn testing across all test types
 */

import { vi } from 'vitest'

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
 * Factory for creating mock WebAuthn registration credentials
 */
export class WebAuthnCredentialFactory {
  private static counter = 0

  static create(overrides: Partial<MockCredentialData> = {}): MockCredentialData {
    const id = `test-credential-${++this.counter}-${Date.now()}`

    return {
      id,
      rawId: `raw-${id}`,
      response: {
        clientDataJSON: this.createClientDataJSON('webauthn.create'),
        attestationObject: this.createAttestationObject(),
      },
      type: 'public-key',
      ...overrides,
    }
  }

  static createBatch(
    count: number,
    baseOverrides: Partial<MockCredentialData> = {}
  ): MockCredentialData[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({
        ...baseOverrides,
        id: `batch-credential-${i}-${Date.now()}`,
      })
    )
  }

  static createInvalid(): MockCredentialData {
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

  static createLarge(): MockCredentialData {
    return this.create({
      id: 'a'.repeat(1000),
      rawId: 'b'.repeat(1000),
      response: {
        clientDataJSON: 'c'.repeat(10000),
        attestationObject: 'd'.repeat(10000),
      },
    })
  }

  static createWithDeviceName(deviceName: string): MockCredentialData & { deviceName: string } {
    return {
      ...this.create(),
      deviceName,
    }
  }

  private static createClientDataJSON(type: string): string {
    const clientData = {
      type,
      challenge: 'test-challenge',
      origin: 'http://localhost:3000',
      crossOrigin: false,
    }
    return btoa(JSON.stringify(clientData))
  }

  private static createAttestationObject(): string {
    // Simplified mock attestation object
    return btoa('mock-attestation-object-data')
  }
}

/**
 * Factory for creating mock WebAuthn authentication data
 */
export class WebAuthnAuthenticationFactory {
  private static counter = 0

  static create(
    credentialId?: string,
    overrides: Partial<MockAuthenticationData> = {}
  ): MockAuthenticationData {
    const id = credentialId || `auth-credential-${++this.counter}-${Date.now()}`

    return {
      id,
      rawId: `auth-raw-${id}`,
      response: {
        clientDataJSON: this.createClientDataJSON('webauthn.get'),
        authenticatorData: this.createAuthenticatorData(),
        signature: this.createSignature(),
        userHandle: 'test-user-handle',
      },
      type: 'public-key',
      ...overrides,
    }
  }

  static createInvalid(): MockAuthenticationData {
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

  static createWithoutUserHandle(credentialId?: string): MockAuthenticationData {
    const auth = this.create(credentialId)
    delete auth.response.userHandle
    return auth
  }

  static createWithMaliciousData(): MockAuthenticationData {
    return this.create('malicious-credential', {
      response: {
        clientDataJSON: '<script>alert("xss")</script>',
        authenticatorData: 'DROP TABLE webauthn_credentials;',
        signature: '<img src=x onerror=alert("xss")>',
      },
    })
  }

  private static createClientDataJSON(type: string): string {
    const clientData = {
      type,
      challenge: 'test-auth-challenge',
      origin: 'http://localhost:3000',
      crossOrigin: false,
    }
    return btoa(JSON.stringify(clientData))
  }

  private static createAuthenticatorData(): string {
    // Simplified mock authenticator data
    return btoa('mock-authenticator-data')
  }

  private static createSignature(): string {
    // Simplified mock signature
    return btoa('mock-signature-data')
  }
}

/**
 * Factory for creating mock stored WebAuthn credentials
 */
export class StoredCredentialFactory {
  private static counter = 0

  static create(
    userId: string,
    overrides: Partial<MockWebAuthnCredential> = {}
  ): MockWebAuthnCredential {
    const credentialId = `stored-credential-${++this.counter}-${Date.now()}`

    return {
      id: `uuid-${credentialId}`,
      userId,
      credentialId,
      publicKey: Buffer.from([1, 2, 3, 4, 5, this.counter]),
      counter: 0,
      deviceName: 'Test Device',
      createdAt: new Date(),
      ...overrides,
    }
  }

  static createBatch(userId: string, count: number): MockWebAuthnCredential[] {
    return Array.from({ length: count }, (_, i) =>
      this.create(userId, {
        deviceName: `Test Device ${i + 1}`,
        createdAt: new Date(Date.now() - (count - i) * 1000), // Different timestamps
      })
    )
  }

  static createWithHighCounter(userId: string): MockWebAuthnCredential {
    return this.create(userId, {
      counter: Number.MAX_SAFE_INTEGER - 1,
      lastUsedAt: new Date(),
    })
  }

  static createExpired(userId: string): MockWebAuthnCredential {
    return this.create(userId, {
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      lastUsedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    })
  }
}

/**
 * Factory for creating mock WebAuthn options
 */
export class WebAuthnOptionsFactory {
  static createRegistrationOptions(userId: string, userEmail: string): MockRegistrationOptions {
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

  static createAuthenticationOptions(userCredentials: string[] = []): MockAuthenticationOptions {
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

  static createOptionsWithExcludedCredentials(
    existingCredentials: string[]
  ): MockRegistrationOptions {
    const baseOptions = this.createRegistrationOptions('test-user', 'test@example.com')
    return {
      ...baseOptions,
      excludeCredentials: existingCredentials.map(credId => ({
        id: credId,
        type: 'public-key',
        transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
      })),
    }
  }
}

/**
 * Mock setup utilities for different test scenarios
 */
export class WebAuthnMockSetup {
  /**
   * Setup successful WebAuthn mocks
   */
  static setupSuccessfulMocks() {
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
  static setupFailingMocks() {
    const mocks = this.setupSuccessfulMocks()

    mocks.mockVerifyRegistrationResponse.mockResolvedValue({ verified: false })
    mocks.mockVerifyAuthenticationResponse.mockResolvedValue({ verified: false })

    return mocks
  }

  /**
   * Setup error-throwing WebAuthn mocks
   */
  static setupErrorMocks() {
    const mocks = this.setupSuccessfulMocks()

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
  static setupDatabaseMocks() {
    const mockSql = vi.fn()

    vi.doMock('@/lib/db/config', () => ({
      sql: mockSql,
    }))

    return { mockSql }
  }

  /**
   * Setup complete WebAuthn test environment
   */
  static setupCompleteEnvironment() {
    const webauthnMocks = this.setupSuccessfulMocks()
    const databaseMocks = this.setupDatabaseMocks()

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
}

/**
 * Test data generators for specific scenarios
 */
export class WebAuthnTestScenarios {
  /**
   * Generate test data for user registration flow
   */
  static registrationFlow(userId: string, userEmail: string) {
    return {
      user: { id: userId, email: userEmail },
      options: WebAuthnOptionsFactory.createRegistrationOptions(userId, userEmail),
      credential: WebAuthnCredentialFactory.create(),
      expectedResult: {
        verified: true,
        credentialId: expect.any(String),
      },
    }
  }

  /**
   * Generate test data for user authentication flow
   */
  static authenticationFlow(userId: string, existingCredentials: string[] = []) {
    const credentialId = existingCredentials[0] || 'existing-credential'
    return {
      userId,
      options: WebAuthnOptionsFactory.createAuthenticationOptions(existingCredentials),
      authData: WebAuthnAuthenticationFactory.create(credentialId),
      storedCredential: StoredCredentialFactory.create(userId, { credentialId }),
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
  static multipleCredentials(userId: string, count: number = 3) {
    const credentials = WebAuthnCredentialFactory.createBatch(count)
    const storedCredentials = StoredCredentialFactory.createBatch(userId, count)

    return {
      userId,
      credentials,
      storedCredentials,
      authData: credentials.map(cred => WebAuthnAuthenticationFactory.create(cred.id)),
    }
  }

  /**
   * Generate test data for security attack scenarios
   */
  static securityAttacks() {
    return {
      replayAttack: {
        credential: WebAuthnCredentialFactory.create(),
        duplicateAttempt: WebAuthnCredentialFactory.create(), // Same credential used twice
      },
      maliciousData: {
        credential: WebAuthnCredentialFactory.create({
          id: '<script>alert("xss")</script>',
          response: {
            clientDataJSON: 'DROP TABLE users;',
            attestationObject: '"><script>alert("xss")</script>',
          },
        }),
        authData: WebAuthnAuthenticationFactory.createWithMaliciousData(),
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
  static errorScenarios() {
    return {
      invalidCredential: WebAuthnCredentialFactory.createInvalid(),
      invalidAuth: WebAuthnAuthenticationFactory.createInvalid(),
      expiredChallenge: {
        challenge: 'expired-challenge-' + (Date.now() - 10 * 60 * 1000), // 10 minutes ago
      },
      malformedRequest: {
        response: { invalid: 'data' },
        expectedChallenge: null,
      },
      databaseError: new Error('Database connection failed'),
      webauthnError: new Error('WebAuthn verification failed'),
    }
  }
}

/**
 * Browser WebAuthn API mock for E2E testing
 */
export class BrowserWebAuthnMock {
  static mockNavigatorCredentials() {
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

  static setupSuccessfulBrowserFlow() {
    const mockCredentials = this.mockNavigatorCredentials()

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

  static setupFailingBrowserFlow() {
    const mockCredentials = this.mockNavigatorCredentials()

    const error = new Error('WebAuthn operation failed')
    mockCredentials.create.mockRejectedValue(error)
    mockCredentials.get.mockRejectedValue(error)

    return mockCredentials
  }
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
  createMockArrayBuffer(size: number = 32): ArrayBuffer {
    return new ArrayBuffer(size)
  },

  /**
   * Validate WebAuthn response structure
   */
  isValidWebAuthnResponse(response: any): boolean {
    return (
      response &&
      typeof response.id === 'string' &&
      typeof response.rawId === 'string' &&
      response.type === 'public-key' &&
      response.response &&
      typeof response.response.clientDataJSON === 'string'
    )
  },

  /**
   * Wait for async operations to complete
   */
  async waitForAsyncOps(ms: number = 10): Promise<void> {
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
