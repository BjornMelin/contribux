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
