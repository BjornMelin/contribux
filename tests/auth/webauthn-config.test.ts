import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock environment values storage
const mockEnvValues: Record<string, any> = {}

// Create a mock environment that will be used in the factory
vi.mock('@/lib/validation/env', () => {
  return {
    env: {
      get NODE_ENV() { return mockEnvValues.NODE_ENV || 'development' },
      set NODE_ENV(v) { mockEnvValues.NODE_ENV = v },
      
      get WEBAUTHN_RP_ID() { return mockEnvValues.WEBAUTHN_RP_ID },
      set WEBAUTHN_RP_ID(v) { mockEnvValues.WEBAUTHN_RP_ID = v },
      
      get WEBAUTHN_RP_NAME() { 
        return mockEnvValues.WEBAUTHN_RP_NAME === undefined ? 'Contribux' : mockEnvValues.WEBAUTHN_RP_NAME 
      },
      set WEBAUTHN_RP_NAME(v) { mockEnvValues.WEBAUTHN_RP_NAME = v },
      
      get WEBAUTHN_ORIGINS() { return mockEnvValues.WEBAUTHN_ORIGINS },
      set WEBAUTHN_ORIGINS(v) { mockEnvValues.WEBAUTHN_ORIGINS = v },
      
      get WEBAUTHN_TIMEOUT() { 
        const val = mockEnvValues.WEBAUTHN_TIMEOUT
        if (val === undefined) return undefined
        return typeof val === 'string' ? parseInt(val, 10) : val
      },
      set WEBAUTHN_TIMEOUT(v) { mockEnvValues.WEBAUTHN_TIMEOUT = v },
      
      get WEBAUTHN_CHALLENGE_EXPIRY() { 
        const val = mockEnvValues.WEBAUTHN_CHALLENGE_EXPIRY
        if (val === undefined) return undefined
        return typeof val === 'string' ? parseInt(val, 10) : val
      },
      set WEBAUTHN_CHALLENGE_EXPIRY(v) { mockEnvValues.WEBAUTHN_CHALLENGE_EXPIRY = v },
      
      get WEBAUTHN_SUPPORTED_ALGORITHMS() { return mockEnvValues.WEBAUTHN_SUPPORTED_ALGORITHMS },
      set WEBAUTHN_SUPPORTED_ALGORITHMS(v) { mockEnvValues.WEBAUTHN_SUPPORTED_ALGORITHMS = v },
      
      get NEXT_PUBLIC_APP_URL() { 
        return mockEnvValues.NEXT_PUBLIC_APP_URL === undefined ? 'http://localhost:3000' : mockEnvValues.NEXT_PUBLIC_APP_URL 
      },
      set NEXT_PUBLIC_APP_URL(v) { mockEnvValues.NEXT_PUBLIC_APP_URL = v },
      
      get NEXT_PUBLIC_VERCEL_URL() { return mockEnvValues.NEXT_PUBLIC_VERCEL_URL },
      set NEXT_PUBLIC_VERCEL_URL(v) { mockEnvValues.NEXT_PUBLIC_VERCEL_URL = v },
      
      get VERCEL_URL() { return mockEnvValues.VERCEL_URL },
      set VERCEL_URL(v) { mockEnvValues.VERCEL_URL = v },
      
      get PORT() { 
        const val = mockEnvValues.PORT || '3000'
        return typeof val === 'string' ? parseInt(val, 10) : val
      },
      set PORT(v) { mockEnvValues.PORT = v },
    }
  }
})

import { 
  getWebAuthnConfig, 
  isOriginAllowed, 
  getPrimaryOrigin, 
  validateWebAuthnConfig,
  type WebAuthnConfig 
} from '@/lib/auth/webauthn-config'
import { env } from '@/lib/validation/env'

describe('WebAuthn Configuration', () => {
  beforeEach(() => {
    // Reset mock environment
    Object.keys(mockEnvValues).forEach(key => delete mockEnvValues[key])
    mockEnvValues.NODE_ENV = 'development'
    mockEnvValues.WEBAUTHN_RP_NAME = 'Contribux'
    mockEnvValues.PORT = 3000
  })

  describe('Development Environment', () => {
    beforeEach(() => {
      env.NODE_ENV = 'development'
    })

    it('should use localhost as default RP ID in development', () => {
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('localhost')
      expect(config.isDevelopment).toBe(true)
      expect(config.isProduction).toBe(false)
    })

    it('should include default localhost origins in development', () => {
      const config = getWebAuthnConfig()
      
      expect(config.origins).toContain('http://localhost:3000')
      expect(config.origins.length).toBeGreaterThan(0)
    })

    it('should include custom port when PORT is different', () => {
      env.PORT = 8080
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toContain('http://localhost:3000')
      expect(config.origins).toContain('http://localhost:8080')
    })

    it('should use explicit WEBAUTHN_RP_ID when provided', () => {
      env.WEBAUTHN_RP_ID = 'dev.example.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('dev.example.com')
    })

    it('should use explicit WEBAUTHN_ORIGINS when provided', () => {
      env.WEBAUTHN_ORIGINS = 'http://localhost:3000,http://dev.example.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toEqual(['http://localhost:3000', 'http://dev.example.com'])
    })
  })

  describe('Production Environment', () => {
    beforeEach(() => {
      (env as any).NODE_ENV = 'production'
    })

    it('should reject localhost RP ID in production', () => {
      env.WEBAUTHN_RP_ID = 'localhost'
      
      expect(() => getWebAuthnConfig()).toThrow('WebAuthn RP ID cannot be localhost in production environment')
    })

    it('should reject HTTP origins in production (except localhost)', () => {
      env.WEBAUTHN_ORIGINS = 'http://example.com,https://secure.com'
      env.WEBAUTHN_RP_ID = 'example.com'
      
      expect(() => getWebAuthnConfig()).toThrow('Production origins must use HTTPS (except localhost)')
    })

    it('should allow HTTP localhost in production for testing', () => {
      env.WEBAUTHN_ORIGINS = 'http://localhost:3000,https://example.com'
      env.WEBAUTHN_RP_ID = 'example.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toEqual(['http://localhost:3000', 'https://example.com'])
    })

    it('should use VERCEL_URL when available', () => {
      env.VERCEL_URL = 'app-prod.vercel.app'
      
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('app-prod.vercel.app')
      expect(config.origins).toContain('https://app-prod.vercel.app')
    })

    it('should prefer NEXT_PUBLIC_VERCEL_URL over VERCEL_URL', () => {
      env.NEXT_PUBLIC_VERCEL_URL = 'public.vercel.app'
      env.VERCEL_URL = 'private.vercel.app'
      
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('public.vercel.app')
      expect(config.origins).toContain('https://public.vercel.app')
    })

    it('should require configuration when no URLs available', () => {
      expect(() => getWebAuthnConfig()).toThrow('WebAuthn RP ID must be configured')
    })
  })

  describe('Custom Configuration', () => {
    it('should use custom RP name when provided', () => {
      env.WEBAUTHN_RP_NAME = 'My Custom App'
      
      const config = getWebAuthnConfig()
      
      expect(config.rpName).toBe('My Custom App')
    })

    it('should include NEXT_PUBLIC_APP_URL in origins when provided', () => {
      env.NEXT_PUBLIC_APP_URL = 'https://myapp.com'
      env.WEBAUTHN_RP_ID = 'myapp.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toContain('https://myapp.com')
    })

    it('should parse comma-separated origins correctly', () => {
      env.WEBAUTHN_ORIGINS = 'https://app.com, https://staging.app.com ,https://dev.app.com'
      env.WEBAUTHN_RP_ID = 'app.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toEqual([
        'https://app.com',
        'https://staging.app.com',
        'https://dev.app.com'
      ])
    })

    it('should handle empty origins in comma-separated list', () => {
      env.WEBAUTHN_ORIGINS = 'https://app.com,,https://staging.app.com,'
      env.WEBAUTHN_RP_ID = 'app.com'
      
      const config = getWebAuthnConfig()
      
      expect(config.origins).toEqual([
        'https://app.com',
        'https://staging.app.com'
      ])
    })
  })

  describe('Validation', () => {
    it('should reject invalid domain formats for RP ID', () => {
      env.WEBAUTHN_RP_ID = 'https://example.com' // URL instead of domain
      
      expect(() => getWebAuthnConfig()).toThrow('RP ID must be a valid domain (not a URL or IP address)')
    })

    it('should reject invalid URL formats for origins', () => {
      env.WEBAUTHN_ORIGINS = 'not-a-url,https://valid.com'
      env.WEBAUTHN_RP_ID = 'valid.com'
      
      expect(() => getWebAuthnConfig()).toThrow()
    })

    it('should require at least one origin', () => {
      (env as any).NODE_ENV = 'production'
      env.WEBAUTHN_RP_ID = 'example.com'
      env.WEBAUTHN_ORIGINS = ''
      
      expect(() => getWebAuthnConfig()).toThrow('At least one WebAuthn origin must be configured')
    })

    it('should validate domain format with special characters', () => {
      env.WEBAUTHN_RP_ID = 'my-app.test-domain.co.uk'
      
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('my-app.test-domain.co.uk')
    })
  })

  describe('Utility Functions', () => {
    it('should correctly identify allowed origins', () => {
      const config: WebAuthnConfig = {
        rpId: 'example.com',
        rpName: 'Test App',
        origins: ['https://example.com', 'https://staging.example.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }
      
      expect(isOriginAllowed('https://example.com', config)).toBe(true)
      expect(isOriginAllowed('https://staging.example.com', config)).toBe(true)
      expect(isOriginAllowed('https://evil.com', config)).toBe(false)
    })

    it('should return primary origin correctly', () => {
      const config: WebAuthnConfig = {
        rpId: 'example.com',
        rpName: 'Test App',
        origins: ['https://primary.com', 'https://secondary.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }
      
      expect(getPrimaryOrigin(config)).toBe('https://primary.com')
    })

    it('should use global config when no config provided to utilities', () => {
      env.WEBAUTHN_RP_ID = 'test.com'
      env.WEBAUTHN_ORIGINS = 'https://test.com'
      
      expect(isOriginAllowed('https://test.com')).toBe(true)
      expect(isOriginAllowed('https://other.com')).toBe(false)
      expect(getPrimaryOrigin()).toBe('https://test.com')
    })
  })

  describe('Validation Function', () => {
    it('should validate configuration without throwing on valid config', () => {
      env.WEBAUTHN_RP_ID = 'example.com'
      env.WEBAUTHN_ORIGINS = 'https://example.com'
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      expect(() => validateWebAuthnConfig()).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(
        'WebAuthn configuration validated:',
        expect.objectContaining({
          rpId: 'example.com',
          rpName: 'Contribux',
          originCount: 1,
          environment: 'development'
        })
      )
      
      consoleSpy.mockRestore()
    })

    it('should log error and rethrow on invalid config', () => {
      (env as any).NODE_ENV = 'production'
      // No configuration provided
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      expect(() => validateWebAuthnConfig()).toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(
        'WebAuthn configuration validation failed:',
        expect.any(Error)
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('New Configuration Properties', () => {
    it('should handle WebAuthn timeout configuration', () => {
      env.WEBAUTHN_TIMEOUT = 120000 // 2 minutes
      
      const config = getWebAuthnConfig()
      
      expect(config.timeout).toBe(120000)
    })
    
    it('should use default timeout when not specified', () => {
      const config = getWebAuthnConfig()
      
      expect(config.timeout).toBe(60000) // 60 seconds default
    })
    
    it('should handle challenge expiry configuration', () => {
      env.WEBAUTHN_CHALLENGE_EXPIRY = 600000 // 10 minutes
      
      const config = getWebAuthnConfig()
      
      expect(config.challengeExpiry).toBe(600000)
    })
    
    it('should use default challenge expiry when not specified', () => {
      const config = getWebAuthnConfig()
      
      expect(config.challengeExpiry).toBe(300000) // 5 minutes default
    })
    
    it('should handle supported algorithms configuration', () => {
      env.WEBAUTHN_SUPPORTED_ALGORITHMS = '-7,-257,-8' // ES256, RS256, EdDSA
      
      const config = getWebAuthnConfig()
      
      expect(config.supportedAlgorithms).toEqual([-7, -257, -8])
    })
    
    it('should use default algorithms when not specified', () => {
      const config = getWebAuthnConfig()
      
      expect(config.supportedAlgorithms).toEqual([-7, -257]) // ES256, RS256 default
    })
    
    it('should handle algorithm configuration with spaces', () => {
      env.WEBAUTHN_SUPPORTED_ALGORITHMS = ' -7 , -257 , -8 '
      
      const config = getWebAuthnConfig()
      
      expect(config.supportedAlgorithms).toEqual([-7, -257, -8])
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing environment variables gracefully', () => {
      // Clear all WebAuthn env vars
      // Clear all WebAuthn env vars
      env.WEBAUTHN_RP_ID = undefined
      env.WEBAUTHN_RP_NAME = 'Contribux'
      env.WEBAUTHN_ORIGINS = undefined
      // NEXT_PUBLIC_APP_URL has default value, so leave it
      env.NEXT_PUBLIC_VERCEL_URL = undefined
      env.VERCEL_URL = undefined
      env.NODE_ENV = 'development'
      
      // Should still work in development
      const config = getWebAuthnConfig()
      
      expect(config.rpId).toBe('localhost')
      expect(config.origins).toContain('http://localhost:3000')
    })

    it('should handle malformed origins gracefully', () => {
      env.WEBAUTHN_ORIGINS = '   ,  ,  '
      
      expect(() => getWebAuthnConfig()).toThrow('At least one WebAuthn origin must be configured')
    })

    it('should handle special domain cases', () => {
      // Test with IP address (should be rejected)
      env.WEBAUTHN_RP_ID = '192.168.1.1'
      
      expect(() => getWebAuthnConfig()).toThrow('RP ID must be a valid domain (not a URL or IP address)')
    })
  })
})