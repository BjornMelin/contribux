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
  // Mock implementation for testing
  return {
    challenge: `mock-challenge-${Date.now()}`,
    rp: {
      id: 'localhost',
      name: 'Contribux Test',
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
