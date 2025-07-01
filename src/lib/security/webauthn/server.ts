/**
 * WebAuthn Server Implementation
 * Portfolio showcase feature demonstrating modern passwordless authentication
 */

import {
  type GenerateAuthenticationOptionsOpts,
  type GenerateRegistrationOptionsOpts,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type VerifyAuthenticationResponseOpts,
  type VerifyRegistrationResponseOpts,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { sql } from '@/lib/db/config'
import { getSecurityConfig } from '../feature-flags'

// Types for WebAuthn credentials
export interface WebAuthnCredential {
  id: string
  userId: string
  credentialId: string
  publicKey: Buffer
  counter: number
  deviceName?: string
  createdAt: Date
  lastUsedAt?: Date
}

/**
 * Generate WebAuthn registration options for new credential
 */
export async function generateWebAuthnRegistration(userId: string, userEmail: string) {
  const config = getSecurityConfig()

  // Get existing credentials to exclude
  const existingCredentials = await sql`
    SELECT credential_id 
    FROM webauthn_credentials 
    WHERE user_id = ${userId}
  `

  const options: GenerateRegistrationOptionsOpts = {
    rpName: config.webauthn.rpName,
    rpID: config.webauthn.rpId,
    userName: userEmail,
    userID: Buffer.from(userId),
    timeout: config.webauthn.timeout,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((cred: any) => ({
      id: cred.credential_id,
      type: 'public-key',
      transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  }

  return await generateRegistrationOptions(options)
}

/**
 * Verify WebAuthn registration response and store credential
 */
export async function verifyWebAuthnRegistration(
  userId: string,
  response: any,
  expectedChallenge: string
) {
  const config = getSecurityConfig()

  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: config.webauthn.origin,
    expectedRPID: config.webauthn.rpId,
    requireUserVerification: false,
  }

  const verification = await verifyRegistrationResponse(opts)

  if (verification.verified && verification.registrationInfo) {
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

    // Store credential in database
    await sql`
      INSERT INTO webauthn_credentials (
        user_id, 
        credential_id, 
        public_key, 
        counter,
        created_at
      ) VALUES (
        ${userId},
        ${Buffer.from(credentialID).toString('base64url')},
        ${credentialPublicKey},
        ${counter},
        NOW()
      )
    `

    return { verified: true, credentialId: Buffer.from(credentialID).toString('base64url') }
  }

  return { verified: false, error: 'Registration verification failed' }
}

/**
 * Generate WebAuthn authentication options
 */
export async function generateWebAuthnAuthentication(userId?: string) {
  const config = getSecurityConfig()

  let allowCredentials: any[] = []

  if (userId) {
    // Get user's credentials
    const credentials = await sql`
      SELECT credential_id 
      FROM webauthn_credentials 
      WHERE user_id = ${userId}
    `

    allowCredentials = credentials.map((cred: any) => ({
      id: cred.credential_id,
      type: 'public-key' as const,
      transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    }))
  }

  const options: GenerateAuthenticationOptionsOpts = {
    rpID: config.webauthn.rpId,
    timeout: config.webauthn.timeout,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: 'preferred',
  }

  return await generateAuthenticationOptions(options)
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAuthentication(response: any, expectedChallenge: string) {
  const config = getSecurityConfig()

  // Get credential from database
  const credentialId = response.id
  const credentialResult = await sql`
    SELECT * 
    FROM webauthn_credentials 
    WHERE credential_id = ${credentialId}
  `
  const credential = credentialResult[0]

  if (!credential) {
    return { verified: false, error: 'Credential not found' }
  }

  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: config.webauthn.origin,
    expectedRPID: config.webauthn.rpId,
    credential: {
      id: credential.credential_id,
      publicKey: credential.public_key,
      counter: credential.counter,
    },
    requireUserVerification: false,
  }

  const verification = await verifyAuthenticationResponse(opts)

  if (verification.verified) {
    // Update counter and last used timestamp
    await sql`
      UPDATE webauthn_credentials 
      SET 
        counter = ${verification.authenticationInfo.newCounter},
        last_used_at = NOW()
      WHERE credential_id = ${credentialId}
    `

    return {
      verified: true,
      userId: credential.user_id,
      credentialId: credential.credential_id,
    }
  }

  return { verified: false, error: 'Authentication verification failed' }
}

/**
 * Get user's WebAuthn credentials
 */
export async function getUserWebAuthnCredentials(userId: string) {
  return await sql`
    SELECT 
      id,
      credential_id,
      device_name,
      created_at,
      last_used_at
    FROM webauthn_credentials 
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
}

/**
 * Remove WebAuthn credential
 */
export async function removeWebAuthnCredential(userId: string, credentialId: string) {
  const result = await sql`
    DELETE FROM webauthn_credentials 
    WHERE user_id = ${userId} AND credential_id = ${credentialId}
  `

  return Array.isArray(result) ? result.length > 0 : false
}
