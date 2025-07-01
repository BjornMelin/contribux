/**
 * MSW Handlers for WebAuthn API Endpoints
 * Mock Service Worker handlers for comprehensive WebAuthn testing
 */

import { HttpResponse, http } from 'msw'
import { z } from 'zod'

// Type definitions for WebAuthn requests/responses
interface WebAuthnRegistrationOptions {
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

interface WebAuthnAuthenticationOptions {
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

// Mock credential store for testing
const mockCredentialStore = new Map<
  string,
  {
    userId: string
    credentialId: string
    publicKey: string
    counter: number
    deviceName?: string
    createdAt: Date
    lastUsedAt?: Date
  }
>()

// Mock challenge store for validation
const mockChallengeStore = new Map<
  string,
  {
    challenge: string
    type: 'registration' | 'authentication'
    createdAt: Date
    userId?: string
  }
>()

/**
 * Generate mock WebAuthn registration options
 */
export const webauthnRegisterOptionsHandler = http.post(
  '/api/security/webauthn/register/options',
  async ({ request }) => {
    try {
      // Simulate authentication check
      const authHeader = request.headers.get('authorization')
      if (!authHeader) {
        return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      // Generate mock challenge
      const challenge = `mock-challenge-${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userId = 'mock-user-id'

      // Store challenge for later verification
      mockChallengeStore.set(challenge, {
        challenge,
        type: 'registration',
        createdAt: new Date(),
        userId,
      })

      const options: WebAuthnRegistrationOptions = {
        challenge,
        rp: { name: 'Contribux Test', id: 'localhost' },
        user: { id: userId, name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
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

      return HttpResponse.json({
        success: true,
        options,
        challenge,
      })
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to generate registration options' },
        { status: 500 }
      )
    }
  }
)

/**
 * Verify mock WebAuthn registration
 */
export const webauthnRegisterVerifyHandler = http.post(
  '/api/security/webauthn/register/verify',
  async ({ request }) => {
    try {
      // Simulate authentication check
      const authHeader = request.headers.get('authorization')
      if (!authHeader) {
        return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const body = (await request.json()) as {
        response: {
          id: string
          rawId: string
          response: {
            clientDataJSON: string
            attestationObject: string
          }
          type: string
        }
        expectedChallenge: string
        deviceName?: string
      }

      // Validate request schema
      const RegistrationRequestSchema = z.object({
        response: z.object({
          id: z.string(),
          rawId: z.string(),
          response: z.object({
            clientDataJSON: z.string(),
            attestationObject: z.string(),
          }),
          type: z.literal('public-key'),
        }),
        expectedChallenge: z.string(),
        deviceName: z.string().optional(),
      })

      const validatedData = RegistrationRequestSchema.parse(body)

      // Verify challenge exists and is valid
      const challengeData = mockChallengeStore.get(validatedData.expectedChallenge)
      if (!challengeData || challengeData.type !== 'registration') {
        return HttpResponse.json({ success: false, error: 'Invalid challenge' }, { status: 400 })
      }

      // Check if challenge is expired (5 minutes)
      const isExpired = Date.now() - challengeData.createdAt.getTime() > 5 * 60 * 1000
      if (isExpired) {
        return HttpResponse.json({ success: false, error: 'Challenge expired' }, { status: 400 })
      }

      // Simulate verification success/failure based on credential ID
      const shouldFail = validatedData.response.id.includes('fail')
      if (shouldFail) {
        return HttpResponse.json(
          { success: false, error: 'Registration verification failed' },
          { status: 400 }
        )
      }

      // Check for duplicate credential
      const existingCredential = Array.from(mockCredentialStore.values()).find(
        cred => cred.credentialId === validatedData.response.id
      )
      if (existingCredential) {
        return HttpResponse.json(
          { success: false, error: 'Credential already exists' },
          { status: 400 }
        )
      }

      // Store mock credential
      const credentialId = validatedData.response.id
      mockCredentialStore.set(credentialId, {
        userId: challengeData.userId!,
        credentialId,
        publicKey: 'mock-public-key-' + credentialId,
        counter: 0,
        deviceName: validatedData.deviceName,
        createdAt: new Date(),
      })

      // Clean up challenge
      mockChallengeStore.delete(validatedData.expectedChallenge)

      return HttpResponse.json({
        success: true,
        message: 'WebAuthn credential registered successfully',
        credentialId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return HttpResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        )
      }

      return HttpResponse.json({ error: 'Failed to verify registration' }, { status: 500 })
    }
  }
)

/**
 * Generate mock WebAuthn authentication options
 */
export const webauthnAuthenticateOptionsHandler = http.post(
  '/api/security/webauthn/authenticate/options',
  async ({ request }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        userId?: string
      }

      // Generate mock challenge
      const challenge = `mock-auth-challenge-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Store challenge for later verification
      mockChallengeStore.set(challenge, {
        challenge,
        type: 'authentication',
        createdAt: new Date(),
        userId: body.userId,
      })

      // Get user's credentials if userId provided
      let allowCredentials:
        | Array<{
            id: string
            type: string
            transports: string[]
          }>
        | undefined

      if (body.userId) {
        const userCredentials = Array.from(mockCredentialStore.values()).filter(
          cred => cred.userId === body.userId
        )

        allowCredentials = userCredentials.map(cred => ({
          id: cred.credentialId,
          type: 'public-key',
          transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
        }))
      }

      const options: WebAuthnAuthenticationOptions = {
        challenge,
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: allowCredentials?.length ? allowCredentials : undefined,
      }

      return HttpResponse.json({
        success: true,
        options,
        challenge,
      })
    } catch (error) {
      return HttpResponse.json(
        { error: 'Failed to generate authentication options' },
        { status: 500 }
      )
    }
  }
)

/**
 * Verify mock WebAuthn authentication
 */
export const webauthnAuthenticateVerifyHandler = http.post(
  '/api/security/webauthn/authenticate/verify',
  async ({ request }) => {
    try {
      const body = (await request.json()) as {
        response: {
          id: string
          rawId: string
          response: {
            clientDataJSON: string
            authenticatorData: string
            signature: string
            userHandle?: string
          }
          type: string
        }
        expectedChallenge: string
      }

      // Validate request schema
      const AuthenticationRequestSchema = z.object({
        response: z.object({
          id: z.string(),
          rawId: z.string(),
          response: z.object({
            clientDataJSON: z.string(),
            authenticatorData: z.string(),
            signature: z.string(),
            userHandle: z.string().optional(),
          }),
          type: z.literal('public-key'),
        }),
        expectedChallenge: z.string(),
      })

      const validatedData = AuthenticationRequestSchema.parse(body)

      // Verify challenge exists and is valid
      const challengeData = mockChallengeStore.get(validatedData.expectedChallenge)
      if (!challengeData || challengeData.type !== 'authentication') {
        return HttpResponse.json({ success: false, error: 'Invalid challenge' }, { status: 401 })
      }

      // Check if challenge is expired (5 minutes)
      const isExpired = Date.now() - challengeData.createdAt.getTime() > 5 * 60 * 1000
      if (isExpired) {
        return HttpResponse.json({ success: false, error: 'Challenge expired' }, { status: 401 })
      }

      // Find credential in mock store
      const credential = mockCredentialStore.get(validatedData.response.id)
      if (!credential) {
        return HttpResponse.json({ success: false, error: 'Credential not found' }, { status: 401 })
      }

      // Simulate verification failure for specific patterns
      const shouldFail =
        validatedData.response.id.includes('fail') ||
        validatedData.response.response.signature.includes('invalid')
      if (shouldFail) {
        return HttpResponse.json(
          { success: false, error: 'Authentication verification failed' },
          { status: 401 }
        )
      }

      // Update counter and last used timestamp
      credential.counter += 1
      credential.lastUsedAt = new Date()

      // Clean up challenge
      mockChallengeStore.delete(validatedData.expectedChallenge)

      return HttpResponse.json({
        success: true,
        message: 'WebAuthn authentication successful',
        userId: credential.userId,
        credentialId: credential.credentialId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return HttpResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        )
      }

      return HttpResponse.json({ error: 'Failed to verify authentication' }, { status: 500 })
    }
  }
)

/**
 * Mock handler for getting user credentials (if this endpoint exists)
 */
export const webauthnCredentialsHandler = http.get(
  '/api/security/webauthn/credentials',
  async ({ request }) => {
    try {
      // Simulate authentication check
      const authHeader = request.headers.get('authorization')
      if (!authHeader) {
        return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const url = new URL(request.url)
      const userId = url.searchParams.get('userId') || 'mock-user-id'

      const userCredentials = Array.from(mockCredentialStore.values())
        .filter(cred => cred.userId === userId)
        .map(cred => ({
          id: cred.credentialId,
          credentialId: cred.credentialId,
          deviceName: cred.deviceName,
          createdAt: cred.createdAt,
          lastUsedAt: cred.lastUsedAt,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      return HttpResponse.json({
        success: true,
        credentials: userCredentials,
      })
    } catch (error) {
      return HttpResponse.json({ error: 'Failed to retrieve credentials' }, { status: 500 })
    }
  }
)

/**
 * Mock handler for removing credentials (if this endpoint exists)
 */
export const webauthnRemoveCredentialHandler = http.delete(
  '/api/security/webauthn/credentials/:credentialId',
  async ({ request, params }) => {
    try {
      // Simulate authentication check
      const authHeader = request.headers.get('authorization')
      if (!authHeader) {
        return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const credentialId = params.credentialId as string
      const credential = mockCredentialStore.get(credentialId)

      if (!credential) {
        return HttpResponse.json({ error: 'Credential not found' }, { status: 404 })
      }

      // In a real implementation, you'd verify the user owns this credential
      mockCredentialStore.delete(credentialId)

      return HttpResponse.json({
        success: true,
        message: 'Credential removed successfully',
      })
    } catch (error) {
      return HttpResponse.json({ error: 'Failed to remove credential' }, { status: 500 })
    }
  }
)

/**
 * Utility function to reset mock stores (useful for test cleanup)
 */
export function resetWebAuthnMockStores() {
  mockCredentialStore.clear()
  mockChallengeStore.clear()
}

/**
 * Utility function to seed mock credentials (useful for testing)
 */
export function seedMockCredentials(
  credentials: Array<{
    userId: string
    credentialId: string
    deviceName?: string
  }>
) {
  credentials.forEach(cred => {
    mockCredentialStore.set(cred.credentialId, {
      userId: cred.userId,
      credentialId: cred.credentialId,
      publicKey: `mock-public-key-${cred.credentialId}`,
      counter: 0,
      deviceName: cred.deviceName,
      createdAt: new Date(),
    })
  })
}

/**
 * Utility function to get mock credential store state (useful for testing)
 */
export function getMockCredentialStore() {
  return Array.from(mockCredentialStore.entries()).map(([id, cred]) => ({
    id,
    ...cred,
  }))
}

/**
 * All WebAuthn MSW handlers
 */
export const webauthnHandlers = [
  webauthnRegisterOptionsHandler,
  webauthnRegisterVerifyHandler,
  webauthnAuthenticateOptionsHandler,
  webauthnAuthenticateVerifyHandler,
  webauthnCredentialsHandler,
  webauthnRemoveCredentialHandler,
]

/**
 * Feature flag handler to control WebAuthn availability in tests
 */
export const webauthnFeatureFlagHandler = http.get('/api/security/feature-flags', async () => {
  return HttpResponse.json({
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
  })
})

/**
 * Error simulation handlers for testing error scenarios
 */
export const webauthnErrorHandlers = {
  // Handler that always returns 500 errors
  serverError: http.post('/api/security/webauthn/*', async () => {
    return HttpResponse.json({ error: 'Internal server error' }, { status: 500 })
  }),

  // Handler that simulates rate limiting
  rateLimited: http.post('/api/security/webauthn/*', async () => {
    return HttpResponse.json({ error: 'Too many requests' }, { status: 429 })
  }),

  // Handler that simulates WebAuthn disabled
  disabled: http.post('/api/security/webauthn/*', async () => {
    return HttpResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })
  }),

  // Handler that simulates network timeout
  timeout: http.post('/api/security/webauthn/*', async () => {
    await new Promise(resolve => setTimeout(resolve, 10000)) // Long delay
    return HttpResponse.json({ error: 'Timeout' }, { status: 408 })
  }),
}
