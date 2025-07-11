/**
 * CSP (Content Security Policy) Tests
 * Tests for CSP builder and nonce generation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCSP, defaultCSPDirectives, generateNonce } from '@/lib/security/csp'

// Mock crypto.getRandomValues for testing
const mockGetRandomValues = vi.fn((arr: Uint8Array) => {
  // Fill with predictable values for testing
  for (let i = 0; i < arr.length; i++) {
    arr[i] = (i + 1) % 256
  }
  return arr
})

// Use spyOn to mock crypto.getRandomValues without replacing global
vi.spyOn(crypto, 'getRandomValues').mockImplementation(mockGetRandomValues)

describe('CSP Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildCSP', () => {
    it('should build basic CSP from directives', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://example.com'],
        'style-src': ["'self'", "'unsafe-inline'"],
      }

      const csp = buildCSP(directives)

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' https://example.com")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toMatch(/;$/) // Should end with semicolon
    })

    it('should add nonce to script-src when provided', () => {
      const directives = {
        'script-src': ["'self'"],
      }

      const nonce = 'test-nonce-123'
      const csp = buildCSP(directives, nonce)

      expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`)
    })

    it('should add nonce to style-src when provided', () => {
      const directives = {
        'style-src': ["'self'"],
      }

      const nonce = 'test-nonce-456'
      const csp = buildCSP(directives, nonce)

      expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`)
    })

    it('should handle empty directives', () => {
      const csp = buildCSP({})
      expect(csp).toBe(';') // buildCSP always adds trailing semicolon
    })

    it('should skip directives with empty arrays', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': [],
        'style-src': ["'self'"],
      }

      const csp = buildCSP(directives)

      expect(csp).toContain("default-src 'self'")
      expect(csp).not.toContain('script-src')
      expect(csp).toContain("style-src 'self'")
    })

    it('should handle complex directives', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-eval'", 'https://cdn.example.com'],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'wss://example.com'],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'self'"],
      }

      const csp = buildCSP(directives)

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' 'unsafe-eval' https://cdn.example.com")
      expect(csp).toContain("style-src 'self' https://fonts.googleapis.com")
      expect(csp).toContain("img-src 'self' data: https:")
      expect(csp).toContain("connect-src 'self' wss://example.com")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("base-uri 'self'")
    })

    it('should preserve order of directives', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
      }

      const csp = buildCSP(directives)
      const parts = csp.split('; ').filter(p => p)

      expect(parts[0]).toContain('default-src')
      expect(parts[1]).toContain('script-src')
      expect(parts[2]).toContain('style-src')
    })
  })

  describe('generateNonce', () => {
    it('should generate base64-encoded nonce', () => {
      const nonce = generateNonce()

      // Should be base64url encoded
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
      // Should not contain padding
      expect(nonce).not.toContain('=')
      // Should not contain + or /
      expect(nonce).not.toContain('+')
      expect(nonce).not.toContain('/')
    })

    it('should generate unique nonces', () => {
      // Mock random values to be different each time
      let callCount = 0
      mockGetRandomValues.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (callCount * 13 + i) % 256
        }
        callCount++
        return arr
      })

      const nonces = new Set<string>()
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce())
      }

      // All nonces should be unique
      expect(nonces.size).toBe(100)
    })

    it('should generate nonces of consistent length', () => {
      const nonces = Array.from({ length: 10 }, () => generateNonce())

      // 16 bytes base64url encoded should be ~22 characters (without padding)
      nonces.forEach(nonce => {
        expect(nonce.length).toBeGreaterThanOrEqual(20)
        expect(nonce.length).toBeLessThanOrEqual(24)
      })
    })

    it('should generate cryptographically secure nonce', () => {
      const nonce = generateNonce()
      
      // Should be base64url-safe (no +, /, or = characters)
      expect(nonce).not.toMatch(/[\+\/=]/)
      
      // Should be consistent length
      expect(nonce.length).toBeGreaterThan(10)
      expect(nonce.length).toBeLessThan(30)
      
      // Should generate different values each time
      const nonce2 = generateNonce()
      expect(nonce).not.toBe(nonce2)
    })
  })

  describe('defaultCSPDirectives', () => {
    it('should have required security directives', () => {
      expect(defaultCSPDirectives['default-src']).toContain("'self'")
      expect(defaultCSPDirectives['frame-ancestors']).toContain("'none'")
      expect(defaultCSPDirectives['base-uri']).toContain("'self'")
      expect(defaultCSPDirectives['object-src']).toContain("'none'")
    })

    it('should allow necessary external resources', () => {
      // Should allow Google Fonts
      expect(defaultCSPDirectives['font-src']).toContain('https://fonts.gstatic.com')
      expect(defaultCSPDirectives['style-src']).toContain('https://fonts.googleapis.com')

      // Should allow GitHub API
      expect(defaultCSPDirectives['connect-src']).toContain('https://api.github.com')

      // Should allow production APIs
      expect(defaultCSPDirectives['script-src']).toContain("'self'")
      expect(defaultCSPDirectives['connect-src']).toContain('https://api.openai.com')
    })

    it('should allow necessary image sources', () => {
      expect(defaultCSPDirectives['img-src']).toContain("'self'")
      expect(defaultCSPDirectives['img-src']).toContain('data:')
      expect(defaultCSPDirectives['img-src']).toContain('https:')
      expect(defaultCSPDirectives['img-src']).toContain('blob:')
    })

    it('should have form-action restricted to self', () => {
      expect(defaultCSPDirectives['form-action']).toEqual(["'self'"])
    })
  })

  describe('CSP with Nonce Integration', () => {
    it('should build complete CSP with nonce', () => {
      const nonce = generateNonce()
      const csp = buildCSP(defaultCSPDirectives, nonce)

      // Should include nonce in script-src and style-src
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain(`'nonce-${nonce}'`)

      // Should include all other directives
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
    })

    it('should not add nonce to non-script/style directives', () => {
      const nonce = 'test-nonce'
      const directives = {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'https:'],
        'connect-src': ["'self'"],
      }

      const csp = buildCSP(directives, nonce)

      // Nonce should not appear in these directives
      expect(csp).not.toContain(`default-src 'self' 'nonce-${nonce}'`)
      expect(csp).not.toContain(`img-src 'self' https: 'nonce-${nonce}'`)
      expect(csp).not.toContain(`connect-src 'self' 'nonce-${nonce}'`)
    })
  })

  describe('Security Validation', () => {
    it('should not allow unsafe-inline without nonce', () => {
      const csp = buildCSP(defaultCSPDirectives)

      // The only unsafe-inline should be in style-src with SHA hash
      const scriptParts = csp.match(/script-src[^;]+/)?.[0] || ''
      expect(scriptParts).not.toContain('unsafe-inline')
    })

    it('should enforce frame-ancestors none', () => {
      const csp = buildCSP(defaultCSPDirectives)
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('should block object embeds', () => {
      const csp = buildCSP(defaultCSPDirectives)
      expect(csp).toContain("object-src 'none'")
    })

    it('should restrict form actions', () => {
      const csp = buildCSP(defaultCSPDirectives)
      expect(csp).toContain("form-action 'self'")
    })

    it('should restrict base URI', () => {
      const csp = buildCSP(defaultCSPDirectives)
      expect(csp).toContain("base-uri 'self'")
    })
  })
})
