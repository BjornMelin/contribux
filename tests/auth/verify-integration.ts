/**
 * Simple verification script to demonstrate auth components working together
 * This shows how the different auth modules integrate without complex mocking
 */

import { generatePKCEChallenge } from '@/lib/auth/pkce'
import { generateAESKey, exportKey, importKey } from '@/lib/auth/crypto'
import { base64urlEncode } from '@/lib/auth/jwt'

interface VerificationResult {
  pkce: {
    codeVerifier: string
    codeChallenge: string
  }
  crypto: {
    keyGenerated: boolean
    keyExported: boolean
    keyImported: boolean
  }
  integration: {
    oauthParamsGenerated: boolean
    tokenEncrypted: boolean
    tokenDecrypted: boolean
    decryptionMatches: boolean
  }
  success: boolean
  error?: string
}

async function verifyAuthIntegration(): Promise<VerificationResult> {
  const result: VerificationResult = {
    pkce: { codeVerifier: '', codeChallenge: '' },
    crypto: { keyGenerated: false, keyExported: false, keyImported: false },
    integration: { 
      oauthParamsGenerated: false, 
      tokenEncrypted: false, 
      tokenDecrypted: false, 
      decryptionMatches: false 
    },
    success: false
  }

  try {
    // 1. PKCE Module
    const pkce = await generatePKCEChallenge()
    result.pkce.codeVerifier = pkce.codeVerifier
    result.pkce.codeChallenge = pkce.codeChallenge

    // 2. Crypto Module
    const key = await generateAESKey()
    result.crypto.keyGenerated = true
    
    const exportedKey = await exportKey(key)
    result.crypto.keyExported = true
    
    const importedKey = await importKey(exportedKey)
    result.crypto.keyImported = true

    // 3. Integration Example: OAuth + PKCE + Crypto
    const oauthParams = new URLSearchParams({
      client_id: 'test-client',
      redirect_uri: 'http://localhost:3000/callback',
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state: base64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
    })
    result.integration.oauthParamsGenerated = oauthParams.has('code_challenge')
    
    // Token would be encrypted with Web Crypto API
    const mockToken = 'gho_test_token_123'
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoder = new TextEncoder()
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      importedKey,
      encoder.encode(mockToken)
    )
    result.integration.tokenEncrypted = encrypted.byteLength > 0
    
    // Decrypt to verify
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      importedKey,
      encrypted
    )
    const decryptedToken = new TextDecoder().decode(decrypted)
    result.integration.tokenDecrypted = true
    result.integration.decryptionMatches = decryptedToken === mockToken
    
    result.success = true
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.success = false
  }

  return result
}

export { verifyAuthIntegration }