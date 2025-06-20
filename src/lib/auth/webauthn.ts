import {
  type GenerateAuthenticationOptionsOpts,
  type GenerateRegistrationOptionsOpts,
  generateAuthenticationOptions as generateAuthOptions,
  generateRegistrationOptions as generateOptions,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  verifyAuthenticationResponse as verifyAuth,
  verifyRegistrationResponse as verifyRegistration,
} from '@simplewebauthn/server'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types'
import { z } from 'zod'
import { sql } from '@/lib/db/config'

// Environment configuration
const RP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Contribux'
const RP_ID = process.env.NEXT_PUBLIC_RP_ID || 'localhost'
const _ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Validation schemas
const WebAuthnUserSchema = z.object({
  userId: z.string().uuid(),
  userEmail: z.string().email(),
  userName: z.string().min(1),
})

const VerifyOptionsSchema = z.object({
  response: z.any(), // Will be validated by SimpleWebAuthn
  expectedChallenge: z.string(),
  expectedOrigin: z.string().url(),
  expectedRPID: z.string(),
})

export type WebAuthnUser = z.infer<typeof WebAuthnUserSchema>

// Generate registration options for new credential
export async function generateRegistrationOptions(
  user: WebAuthnUser
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const validatedUser = WebAuthnUserSchema.parse(user)

  // Generate a unique challenge
  const challenge = generateChallenge()

  // Store challenge in database
  await sql`
    INSERT INTO auth_challenges (challenge, user_id, type, expires_at)
    VALUES (${challenge}, ${validatedUser.userId}, 'registration', CURRENT_TIMESTAMP + INTERVAL '5 minutes')
  `

  const options: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: validatedUser.userId,
    userName: validatedUser.userName,
    userDisplayName: validatedUser.userName,
    challenge,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'required',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    timeout: 60000,
  }

  return generateOptions(options)
}

// Verify registration response from client
export async function verifyRegistrationResponse(
  options: z.infer<typeof VerifyOptionsSchema>
): Promise<{
  verified: boolean
  registrationInfo?: VerifiedRegistrationResponse['registrationInfo']
}> {
  const { response, expectedChallenge, expectedOrigin, expectedRPID } =
    VerifyOptionsSchema.parse(options)

  // Validate challenge exists and is not expired
  const challengeResult = await sql`
    SELECT challenge, user_id, created_at
    FROM auth_challenges
    WHERE challenge = ${expectedChallenge}
    AND type = 'registration'
    AND used = false
    AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `

  if (challengeResult.length === 0) {
    throw new Error('Invalid challenge')
  }

  const challengeData = challengeResult[0]

  // Check if challenge is expired (5 minutes)
  const challengeAge = Date.now() - new Date(challengeData.created_at).getTime()
  if (challengeAge > 5 * 60 * 1000) {
    throw new Error('Challenge expired')
  }

  // Verify the response
  const verification = await verifyRegistration({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: [expectedRPID],
    supportedAlgorithmIDs: [-7, -257],
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  // Check origin for CSRF protection
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64').toString())
  if (clientData.origin !== expectedOrigin) {
    throw new Error('Invalid origin')
  }

  // Store credential in database
  const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo

  await sql`
    INSERT INTO webauthn_credentials (
      user_id, credential_id, public_key, counter, 
      credential_device_type, credential_backed_up, transports
    )
    VALUES (
      ${challengeData.user_id},
      ${Buffer.from(credentialID).toString('base64')},
      ${Buffer.from(credentialPublicKey).toString('base64')},
      ${counter},
      ${credentialDeviceType},
      ${credentialBackedUp},
      ${response.response.transports || []}
    )
  `

  // Mark challenge as used
  await sql`
    UPDATE auth_challenges
    SET used = true
    WHERE challenge = ${expectedChallenge}
  `

  return {
    verified: true,
    registrationInfo: verification.registrationInfo,
  }
}

// Generate authentication options for existing user
export async function generateAuthenticationOptions(
  options: { userId?: string } = {}
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  let allowCredentials = []

  if (options.userId) {
    // Get user's registered credentials
    const credentials = await sql`
      SELECT credential_id, transports
      FROM webauthn_credentials
      WHERE user_id = ${options.userId}
      ORDER BY last_used_at DESC NULLS LAST
    `

    allowCredentials = credentials.map(cred => ({
      id: cred.credential_id,
      type: 'public-key' as const,
      transports: cred.transports || ['internal', 'hybrid'],
    }))
  }

  // Generate challenge
  const challenge = generateChallenge()

  // Store challenge
  await sql`
    INSERT INTO auth_challenges (challenge, user_id, type, expires_at)
    VALUES (
      ${challenge}, 
      ${options.userId || null}, 
      'authentication',
      CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    )
  `

  const authOptions: GenerateAuthenticationOptionsOpts = {
    challenge,
    timeout: 60000,
    userVerification: 'required',
    rpID: RP_ID,
    allowCredentials,
  }

  return generateAuthOptions(authOptions)
}

// Verify authentication response
export async function verifyAuthenticationResponse(
  options: z.infer<typeof VerifyOptionsSchema>
): Promise<{
  verified: boolean
  authenticationInfo?: VerifiedAuthenticationResponse['authenticationInfo'] & { userId?: string }
}> {
  const { response, expectedChallenge, expectedOrigin, expectedRPID } =
    VerifyOptionsSchema.parse(options)

  // Validate challenge
  const challengeResult = await sql`
    SELECT challenge, user_id, created_at
    FROM auth_challenges
    WHERE challenge = ${expectedChallenge}
    AND type = 'authentication'
    AND used = false
    AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `

  if (challengeResult.length === 0) {
    throw new Error('Invalid challenge')
  }

  // Get credential from database
  const credentialId = Buffer.from(response.id, 'base64').toString('base64')
  const credentialResult = await sql`
    SELECT credential_id, public_key, counter, user_id
    FROM webauthn_credentials
    WHERE credential_id = ${credentialId}
    LIMIT 1
  `

  if (credentialResult.length === 0) {
    throw new Error('Credential not found')
  }

  const credential = credentialResult[0]

  // Prepare authenticator for verification
  const authenticator = {
    credentialID: Buffer.from(credential.credential_id, 'base64'),
    credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
    counter: credential.counter,
    transports: response.response.transports,
  }

  // Verify authentication
  const verification = await verifyAuth({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: [expectedRPID],
    authenticator,
    supportedAlgorithmIDs: [-7, -257],
  })

  if (!verification.verified) {
    throw new Error('Authentication verification failed')
  }

  // Check counter to prevent replay attacks
  if (verification.authenticationInfo.newCounter <= credential.counter) {
    throw new Error('Counter verification failed')
  }

  // Update counter and last used timestamp
  await sql`
    UPDATE webauthn_credentials
    SET counter = ${verification.authenticationInfo.newCounter},
        last_used_at = CURRENT_TIMESTAMP
    WHERE credential_id = ${credentialId}
  `

  // Mark challenge as used
  await sql`
    UPDATE auth_challenges
    SET used = true
    WHERE challenge = ${expectedChallenge}
  `

  return {
    verified: true,
    authenticationInfo: {
      ...verification.authenticationInfo,
      userId: credential.user_id,
    },
  }
}

// Check if WebAuthn is supported in the browser
export async function checkWebAuthnSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    if (!window.PublicKeyCredential) return false

    if (!window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return false
    }

    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// Helper function to generate secure random challenge
function generateChallenge(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64url')
}

// Clean up expired challenges (to be called periodically)
export async function cleanupExpiredChallenges(): Promise<void> {
  await sql`
    DELETE FROM auth_challenges
    WHERE expires_at < CURRENT_TIMESTAMP
    OR used = true
  `
}
