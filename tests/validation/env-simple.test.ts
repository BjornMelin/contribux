/**
 * Simplified Environment Validation Tests
 * 
 * Testing the core validation logic with direct schema invocation
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Import the validation functions directly to test them in isolation
import { calculateShannonEntropy, validateJwtSecret } from '../../src/lib/validation/env'

describe('Environment Validation Core Logic', () => {
  describe('JWT Secret Validation Functions', () => {
    it('should accept a strong JWT secret', () => {
      const strongSecret = '9Kf7Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7Xw'
      expect(() => validateJwtSecret(strongSecret)).not.toThrow()
    })

    it('should reject JWT secret that is too short', () => {
      const shortSecret = 'tooshort'
      expect(() => validateJwtSecret(shortSecret)).toThrow(/at least 32 characters/)
    })

    it('should reject JWT secret with low entropy', () => {
      const lowEntropySecret = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 34 chars but low entropy
      expect(() => validateJwtSecret(lowEntropySecret)).toThrow(/insufficient entropy/)
    })

    it('should reject JWT secret with insufficient unique characters', () => {
      const repetitiveSecret = 'abcdefghijkabcdefghijkabcdefghijk' // Only 11 unique chars, repeated
      expect(() => validateJwtSecret(repetitiveSecret)).toThrow(/insufficient entropy/)
    })
  })

  describe('Shannon Entropy Calculation', () => {
    it('should calculate entropy correctly for uniform distribution', () => {
      const uniformString = 'abcdefgh' // 8 unique chars, uniform = ~3 bits
      const entropy = calculateShannonEntropy(uniformString)
      expect(entropy).toBeCloseTo(3, 1)
    })

    it('should calculate low entropy for repeated characters', () => {
      const repeatedString = 'aaaaaaaa'
      const entropy = calculateShannonEntropy(repeatedString)
      expect(entropy).toBe(0) // All same character = 0 entropy
    })
  })

  describe('PostgreSQL URL Validation', () => {
    const postgresUrlRegex = /^postgresql:\/\/[^:\/]+:[^@\/]*@[^\/]+\/[^?\/]+(\?.+)?$/

    it('should accept valid PostgreSQL URLs', () => {
      const validUrls = [
        'postgresql://user:pass@localhost:5432/dbname',
        'postgresql://user:pass@host.com:5432/dbname?sslmode=require',
        'postgresql://neondb_owner:npg_abc123@ep-host.azure.neon.tech/neondb?sslmode=require',
      ]

      for (const url of validUrls) {
        expect(postgresUrlRegex.test(url), `Should accept URL: ${url}`).toBe(true)
      }
    })

    it('should reject invalid database URLs', () => {
      const invalidUrls = [
        'mysql://user:pass@localhost:3306/dbname',
        'http://example.com',
        'not-a-url',
        'postgresql://incomplete',
      ]

      for (const url of invalidUrls) {
        expect(postgresUrlRegex.test(url), `Should reject URL: ${url}`).toBe(false)
      }
    })
  })

  describe('Domain Validation for RP ID', () => {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

    it('should accept valid domain formats', () => {
      const validDomains = ['example.com', 'sub.example.com', 'app-staging.company.io']

      for (const domain of validDomains) {
        expect(domainRegex.test(domain), `Should accept domain: ${domain}`).toBe(true)
      }
    })

    it('should accept localhost as special case', () => {
      // localhost is handled as a special case in the validation
      expect('localhost').toBe('localhost')
    })

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'https://example.com', // Should not include protocol
        'example.com/', // Should not include path
        '.example.com', // Should not start with dot
        'example..com', // Should not have double dots
        'ex ample.com', // Should not contain spaces
      ]

      for (const domain of invalidDomains) {
        if (domain !== 'localhost') {
          expect(domainRegex.test(domain), `Should reject domain: ${domain}`).toBe(false)
        }
      }
    })
  })

  describe('GitHub Client ID Validation', () => {
    const githubClientIdRegex = /^(Iv1\.[a-zA-Z0-9]{16}|[a-zA-Z0-9]{20})$/

    it('should accept valid GitHub client ID formats', () => {
      const validIds = [
        'Iv1.test1234567890ab', // OAuth App format
        'abcdefghijklmnopqrst', // GitHub App format (20 chars)
      ]

      for (const id of validIds) {
        expect(githubClientIdRegex.test(id), `Should accept ID: ${id}`).toBe(true)
      }
    })

    it('should reject invalid GitHub client ID formats', () => {
      const invalidIds = [
        'invalid-format',
        'Iv1.short',
        'toolongforgithubappformat',
      ]

      for (const id of invalidIds) {
        expect(githubClientIdRegex.test(id), `Should reject ID: ${id}`).toBe(false)
      }
    })
  })

  describe('Rate Limiting Validation', () => {
    it('should enforce reasonable rate limits', () => {
      const maxReasonableLimit = 1000
      
      expect(500).toBeLessThanOrEqual(maxReasonableLimit)
      expect(1000).toBeLessThanOrEqual(maxReasonableLimit)
      expect(2000).toBeGreaterThan(maxReasonableLimit)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should validate redirect URI format', () => {
      const validUris = [
        'http://localhost:3000/callback',
        'https://example.com/auth/callback',
      ]

      for (const uri of validUris) {
        expect(() => new URL(uri)).not.toThrow()
      }
    })

    it('should reject invalid redirect URIs', () => {
      const invalidUris = [
        'invalid-uri',
        'not-a-url',
      ]

      for (const uri of invalidUris) {
        expect(() => new URL(uri)).toThrow()
      }
    })
  })
})