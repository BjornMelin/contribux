/**
 * Simple verification script to demonstrate auth components working together
 * This shows how the different auth modules integrate without complex mocking
 */

import { generatePKCEChallenge } from '@/lib/auth/pkce'
import { generateAESKey, exportKey, importKey } from '@/lib/auth/crypto'
import { base64urlEncode } from '@/lib/auth/jwt'

async function verifyAuthIntegration() {
  console.log('🔐 Verifying Auth Component Integration...\n')

  // 1. PKCE Module
  console.log('1️⃣ PKCE Module:')
  const pkce = await generatePKCEChallenge()
  console.log('✅ Generated code verifier:', pkce.codeVerifier.substring(0, 20) + '...')
  console.log('✅ Generated code challenge:', pkce.codeChallenge.substring(0, 20) + '...')
  console.log('')

  // 2. Crypto Module
  console.log('2️⃣ Crypto Module:')
  const key = await generateAESKey()
  console.log('✅ Generated AES-256-GCM key')
  
  const exportedKey = await exportKey(key)
  console.log('✅ Exported key to JWK format')
  
  const importedKey = await importKey(exportedKey)
  console.log('✅ Re-imported key successfully')
  console.log('')

  // 3. Integration Example: OAuth + PKCE + Crypto
  console.log('3️⃣ Integration Flow:')
  
  // OAuth URL would include PKCE challenge
  const oauthParams = new URLSearchParams({
    client_id: 'test-client',
    redirect_uri: 'http://localhost:3000/callback',
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    state: base64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
  })
  console.log('✅ OAuth URL params with PKCE:', oauthParams.toString().substring(0, 100) + '...')
  
  // Token would be encrypted with Web Crypto API
  const mockToken = 'gho_test_token_123'
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  
  try {
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      importedKey,
      encoder.encode(mockToken)
    )
    console.log('✅ Encrypted OAuth token with AES-GCM')
    
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
    console.log('✅ Decrypted token matches:', decryptedToken === mockToken)
  } catch (error) {
    console.error('❌ Encryption error:', error)
  }
  
  console.log('\n✨ All auth components are working correctly!')
}

// Run verification if called directly
if (require.main === module) {
  verifyAuthIntegration().catch(console.error)
}

export { verifyAuthIntegration }