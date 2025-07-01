/**
 * PKCE (Proof Key for Code Exchange) implementation for OAuth 2.1
 * Implements RFC 7636 for enhanced security in OAuth flows
 */

// Generate a cryptographically random code verifier
export async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64urlEncode(array)
}

// Generate code challenge from verifier using SHA-256
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(new Uint8Array(hash))
}

// Generate both verifier and challenge
export async function generatePKCEChallenge(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  const codeVerifier = await generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  return {
    codeVerifier,
    codeChallenge,
  }
}

// Verify PKCE challenge
export async function verifyPKCEChallenge(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  const expectedChallenge = await generateCodeChallenge(codeVerifier)
  return expectedChallenge === codeChallenge
}

/**
 * Enhanced PKCE validation with entropy checking and timing attack protection
 */
export async function validatePKCESecure(
  codeVerifier: string,
  codeChallenge: string
): Promise<{
  valid: boolean
  entropy: number
  timingSafe: boolean
}> {
  const startTime = performance.now()

  // Calculate entropy for security validation
  const entropy = calculateEntropy(codeVerifier)

  // Minimum entropy requirement (4.0 bits per character is good for base64url)
  const entropyValid = entropy >= 4.0

  // Length validation per RFC 7636
  const lengthValid = codeVerifier.length >= 43 && codeVerifier.length <= 128

  // Character validation (base64url only)
  const charValid = /^[A-Za-z0-9\-._~]+$/.test(codeVerifier)

  // Timing-safe challenge verification
  const expectedChallenge = await generateCodeChallenge(codeVerifier)
  const challengeValid = timingSafeEqual(Buffer.from(expectedChallenge), Buffer.from(codeChallenge))

  // Ensure minimum processing time to prevent timing attacks
  const elapsedTime = performance.now() - startTime
  if (elapsedTime < 10) {
    await new Promise(resolve => setTimeout(resolve, 10 - elapsedTime))
  }

  const valid = entropyValid && lengthValid && charValid && challengeValid

  return {
    valid,
    entropy,
    timingSafe: true,
  }
}

/**
 * Calculate Shannon entropy for randomness validation
 */
function calculateEntropy(str: string): number {
  const frequency: Record<string, number> = {}

  for (const char of str) {
    frequency[char] = (frequency[char] || 0) + 1
  }

  let entropy = 0
  const length = str.length

  for (const count of Object.values(frequency)) {
    const probability = count / length
    entropy -= probability * Math.log2(probability)
  }

  return entropy
}

/**
 * Timing-safe buffer comparison
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= (a[i] || 0) ^ (b[i] || 0)
  }

  return result === 0
}

/**
 * Enhanced PKCE challenge generation with configurable length and entropy validation
 * Implements RFC 7636 with additional security measures
 */
export async function generateEnhancedPKCEChallenge(options?: {
  verifierLength?: number
  enforceEntropy?: boolean
}): Promise<{
  codeVerifier: string
  codeChallenge: string
  entropy: number
}> {
  const verifierLength = options?.verifierLength || 128 // RFC 7636 recommends 128
  const enforceEntropy = options?.enforceEntropy ?? true

  let codeVerifier: string
  let entropy: number

  do {
    const array = new Uint8Array(Math.ceil((verifierLength * 3) / 4)) // Base64 encoding expansion
    crypto.getRandomValues(array)
    codeVerifier = base64urlEncode(array).substring(0, verifierLength)

    // Calculate entropy for security validation
    entropy = calculateEntropy(codeVerifier)

    // Ensure minimum entropy (4.5 bits per character is good for base64url)
    if (!enforceEntropy || entropy >= 4.0) {
      break
    }
  } while (enforceEntropy)

  const codeChallenge = await generateCodeChallenge(codeVerifier)

  return {
    codeVerifier,
    codeChallenge,
    entropy,
  }
}

/**
 * Timing-safe PKCE challenge verification with enhanced security checks
 */
export async function verifyPKCEChallengeSecure(
  codeVerifier: string,
  codeChallenge: string,
  options?: {
    enforceMinLength?: boolean
    validateEntropy?: boolean
  }
): Promise<{
  valid: boolean
  securityChecks: {
    lengthValid: boolean
    entropyValid: boolean
    challengeValid: boolean
  }
}> {
  const enforceMinLength = options?.enforceMinLength ?? true
  const validateEntropy = options?.validateEntropy ?? true

  // Security validations
  const lengthValid = !enforceMinLength || codeVerifier.length >= 43 // RFC 7636 minimum
  const entropyValid = !validateEntropy || calculateEntropy(codeVerifier) >= 4.0

  // Timing-safe challenge verification
  const expectedChallenge = await generateCodeChallenge(codeVerifier)
  const challengeValid = timingSafeEqual(Buffer.from(expectedChallenge), Buffer.from(codeChallenge))

  return {
    valid: lengthValid && entropyValid && challengeValid,
    securityChecks: {
      lengthValid,
      entropyValid,
      challengeValid,
    },
  }
}

// Base64 URL encoding without padding
function base64urlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(buffer)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Base64 URL decoding
export function base64urlDecode(str: string): Uint8Array {
  // Add padding if necessary
  const padded = str + '==='.slice((str.length + 3) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
