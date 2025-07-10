/**
 * CSP Configuration Tests
 * Validates modern CSP directives and security configuration
 */

import { describe, it, expect } from 'vitest'
import { buildCSP, generateNonce, getCSPDirectives } from '@/lib/security/csp'

describe('CSP Configuration', () => {
  describe('generateNonce', () => {
    it('should generate a secure nonce', () => {
      const nonce = generateNonce()
      
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(nonce.length).toBeGreaterThan(20)
    })

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()
      
      expect(nonce1).not.toBe(nonce2)
    })
  })

  describe('buildCSP', () => {
    it('should build CSP string with modern directives', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'strict-dynamic'"],
        'trusted-types': ['default', 'nextjs-inline-script'],
        'require-trusted-types-for': ['script'],
        'upgrade-insecure-requests': []
      }
      
      const csp = buildCSP(directives)
      
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' 'strict-dynamic'")
      expect(csp).toContain("trusted-types default nextjs-inline-script")
      expect(csp).toContain("require-trusted-types-for script")
      expect(csp).toContain("upgrade-insecure-requests")
    })

    it('should add nonce to script-src and style-src', () => {
      const directives = {
        'script-src': ["'self'"],
        'style-src': ["'self'"]
      }
      const nonce = 'test-nonce-123'
      
      const csp = buildCSP(directives, nonce)
      
      expect(csp).toContain("script-src 'self' 'nonce-test-nonce-123'")
      expect(csp).toContain("style-src 'self' 'nonce-test-nonce-123'")
    })

    it('should handle directives without sources', () => {
      const directives = {
        'upgrade-insecure-requests': [],
        'block-all-mixed-content': [],
        'require-trusted-types-for': []
      }
      
      const csp = buildCSP(directives)
      
      expect(csp).toContain('upgrade-insecure-requests')
      expect(csp).toContain('block-all-mixed-content')
      expect(csp).toContain('require-trusted-types-for')
    })
  })

  describe('getCSPDirectives', () => {
    it('should return base directives with modern security features', () => {
      const directives = getCSPDirectives()
      
      // Check for modern CSP Level 3 directives
      expect(directives).toHaveProperty('fenced-frame-src')
      expect(directives).toHaveProperty('navigate-to')
      expect(directives['fenced-frame-src']).toEqual(["'none'"])
      expect(directives['navigate-to']).toContain("'self'")
      
      // Check for base security directives
      expect(directives['default-src']).toEqual(["'self'"])
      expect(directives['object-src']).toEqual(["'none'"])
      expect(directives['frame-ancestors']).toEqual(["'none'"])
      expect(directives['base-uri']).toEqual(["'self'"])
      expect(directives['form-action']).toEqual(["'self'"])
    })

    it('should include strict-dynamic in script-src', () => {
      const directives = getCSPDirectives()
      
      expect(directives['script-src']).toContain("'strict-dynamic'")
    })

    it('should include GitHub API endpoints in connect-src', () => {
      const directives = getCSPDirectives()
      
      expect(directives['connect-src']).toContain('https://api.github.com')
      expect(directives['connect-src']).toContain('https://api.github.com/graphql')
    })

    it('should include font sources for modern font loading', () => {
      const directives = getCSPDirectives()
      
      expect(directives['font-src']).toContain('https://fonts.gstatic.com')
      expect(directives['font-src']).toContain('data:')
    })

    it('should include blob: for modern media handling', () => {
      const directives = getCSPDirectives()
      
      expect(directives['worker-src']).toContain('blob:')
      expect(directives['media-src']).toContain('blob:')
      expect(directives['media-src']).toContain('data:')
    })

    it('should include GitHub image sources', () => {
      const directives = getCSPDirectives()
      
      expect(directives['img-src']).toContain('https://avatars.githubusercontent.com')
      expect(directives['img-src']).toContain('https://github.com')
      expect(directives['img-src']).toContain('https://raw.githubusercontent.com')
    })

    it('should block frame embedding', () => {
      const directives = getCSPDirectives()
      
      expect(directives['frame-src']).toEqual(["'none'"])
      expect(directives['frame-ancestors']).toEqual(["'none'"])
      expect(directives['fenced-frame-src']).toEqual(["'none'"])
    })

    it('should enable security features', () => {
      const directives = getCSPDirectives()
      
      expect(directives).toHaveProperty('upgrade-insecure-requests')
      expect(directives).toHaveProperty('block-all-mixed-content')
      expect(directives['upgrade-insecure-requests']).toEqual([])
      expect(directives['block-all-mixed-content']).toEqual([])
    })
  })

  describe('Production vs Development Configuration', () => {
    const originalEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('should include trusted types in production', () => {
      process.env.NODE_ENV = 'production'
      const directives = getCSPDirectives()
      
      expect(directives['trusted-types']).toContain('default')
      expect(directives['trusted-types']).toContain('nextjs-inline-script')
      expect(directives['trusted-types']).toContain('react-render')
      expect(directives['require-trusted-types-for']).toEqual(['script'])
    })

    it('should include production APIs in production', () => {
      process.env.NODE_ENV = 'production'
      const directives = getCSPDirectives()
      
      expect(directives['connect-src']).toContain('https://api.openai.com')
      expect(directives['connect-src']).toContain('https://*.neon.tech')
      expect(directives['connect-src']).toContain('https://contribux.vercel.app')
    })

    it('should include development sources in development', () => {
      process.env.NODE_ENV = 'development'
      const directives = getCSPDirectives()
      
      expect(directives['script-src']).toContain("'unsafe-eval'")
      expect(directives['script-src']).toContain("'unsafe-inline'")
      expect(directives['connect-src']).toContain('http://localhost:*')
      expect(directives['connect-src']).toContain('ws://localhost:*')
    })

    it('should include wasm-unsafe-eval in production only', () => {
      process.env.NODE_ENV = 'production'
      const productionDirectives = getCSPDirectives()
      expect(productionDirectives['script-src']).toContain("'wasm-unsafe-eval'")
      
      process.env.NODE_ENV = 'development'
      const developmentDirectives = getCSPDirectives()
      expect(developmentDirectives['script-src']).not.toContain("'wasm-unsafe-eval'")
    })

    it('should include reporting in production', () => {
      process.env.NODE_ENV = 'production'
      const directives = getCSPDirectives()
      
      expect(directives['report-uri']).toEqual(['/api/security/csp-report'])
      expect(directives['report-to']).toEqual(['csp-violations'])
    })

    it('should include development trusted types', () => {
      process.env.NODE_ENV = 'development'
      const directives = getCSPDirectives()
      
      expect(directives['trusted-types']).toContain('webpack-dev-server')
    })
  })

  describe('CSP Security Validation', () => {
    it('should not allow unsafe-inline in production script-src', () => {
      process.env.NODE_ENV = 'production'
      const directives = getCSPDirectives()
      
      expect(directives['script-src']).not.toContain("'unsafe-inline'")
    })

    it('should not allow unsafe-eval in production script-src', () => {
      process.env.NODE_ENV = 'production'
      const directives = getCSPDirectives()
      
      expect(directives['script-src']).not.toContain("'unsafe-eval'")
    })

    it('should block object-src completely', () => {
      const directives = getCSPDirectives()
      
      expect(directives['object-src']).toEqual(["'none'"])
    })

    it('should prevent frame embedding', () => {
      const directives = getCSPDirectives()
      
      expect(directives['frame-ancestors']).toEqual(["'none'"])
      expect(directives['frame-src']).toEqual(["'none'"])
    })

    it('should restrict base-uri to self', () => {
      const directives = getCSPDirectives()
      
      expect(directives['base-uri']).toEqual(["'self'"])
    })

    it('should restrict form-action to self', () => {
      const directives = getCSPDirectives()
      
      expect(directives['form-action']).toEqual(["'self'"])
    })

    it('should use strict-dynamic for modern script loading', () => {
      const directives = getCSPDirectives()
      
      expect(directives['script-src']).toContain("'strict-dynamic'")
    })
  })
})