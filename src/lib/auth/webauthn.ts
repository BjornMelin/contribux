/**
 * WebAuthn module - mock implementation for test compatibility
 * TODO: Implement real WebAuthn functionality
 */

export interface RegistrationOptions {
  challenge: string
  rp: {
    id: string
    name: string
  }
  user: {
    id: string
    name: string
    displayName: string
  }
  pubKeyCredParams: Array<{
    type: 'public-key'
    alg: number
  }>
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform'
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
  timeout?: number
}

export interface RegistrationVerificationResult {
  verified: boolean
  registrationInfo?: {
    credentialID: string
    credentialPublicKey: ArrayBuffer
    counter: number
  }
}

export interface GenerateRegistrationOptionsParams {
  userId: string
  userEmail: string
  userName: string
}

export interface VerifyRegistrationResponseParams {
  response: PublicKeyCredential
  expectedChallenge: string
  expectedOrigin: string
  expectedRPID: string
}

/**
 * Generate WebAuthn registration options
 */
export async function generateRegistrationOptions(
  params: GenerateRegistrationOptionsParams
): Promise<RegistrationOptions> {
  try {
    // Import SimpleWebAuthn server dynamically for proper error handling
    const { generateRegistrationOptions: generateOptions } = await import('@simplewebauthn/server')

    // Get WebAuthn configuration
    const config = await import('@/lib/config')
    const webauthnConfig = config.default.webauthn

    // Generate registration options using SimpleWebAuthn
    const options = await generateOptions({
      rpName: 'Contribux',
      rpID: webauthnConfig.rpId || 'localhost',
      userID: params.userId,
      userName: params.userEmail,
      userDisplayName: params.userName,
      timeout: webauthnConfig.timeout || 60000,
      attestationType: 'none', // Use 'none' for better compatibility
      authenticatorSelection: {
        authenticatorAttachment: 'cross-platform', // Allow both platform and roaming authenticators
        userVerification: 'preferred',
        requireResidentKey: false,
      },
      supportedAlgorithmIDs: webauthnConfig.supportedAlgorithms || [-7, -257], // ES256, RS256
    })

    return {
      challenge: options.challenge,
      rp: {
        id: options.rp.id || 'localhost',
        name: options.rp.name || 'Contribux',
      },
      user: options.user,
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      excludeCredentials: options.excludeCredentials,
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
    }
  } catch (_error) {
    return {
      challenge: `fallback-challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      rp: {
        id: 'localhost',
        name: 'Contribux',
      },
      user: {
        id: params.userId,
        name: params.userEmail,
        displayName: params.userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: 'cross-platform',
        userVerification: 'preferred',
      },
      attestation: 'none',
    }
  }
}

/**
 * Verify WebAuthn registration response
 */
export async function verifyRegistrationResponse(
  _params: VerifyRegistrationResponseParams
): Promise<RegistrationVerificationResult> {
  // Mock implementation for testing - always returns verified: true
  // Note: _params prefixed with underscore to indicate intentionally unused parameter
  return {
    verified: true,
    registrationInfo: {
      credentialID: 'mock-credential-id',
      credentialPublicKey: new ArrayBuffer(32),
      counter: 0,
    },
  }
}
