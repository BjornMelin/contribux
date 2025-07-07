/**
 * Test suite for parseRateLimitHeader function
 *
 * Validates proper handling of various input types including:
 * - Valid numeric strings
 * - Invalid/non-numeric strings
 * - Undefined/null values
 * - Edge cases (NaN, Infinity, negative numbers)
 */

import { parseRateLimitHeader } from '@/lib/github/utils'
import { describe, expect, it } from 'vitest'

describe('parseRateLimitHeader', () => {
  describe('Valid Input Handling', () => {
    it('should parse valid numeric strings correctly', () => {
      expect(parseRateLimitHeader('100')).toBe(100)
      expect(parseRateLimitHeader('0')).toBe(0)
      expect(parseRateLimitHeader('5000')).toBe(5000)
      expect(parseRateLimitHeader('1234567890')).toBe(1234567890)
    })

    it('should handle strings with leading/trailing spaces', () => {
      expect(parseRateLimitHeader(' 100 ')).toBe(100)
      expect(parseRateLimitHeader('  50  ')).toBe(50)
    })

    it('should handle negative numbers by returning 0', () => {
      expect(parseRateLimitHeader('-100')).toBe(0)
      expect(parseRateLimitHeader('-1')).toBe(0)
      expect(parseRateLimitHeader('-9999')).toBe(0)
    })
  })

  describe('Invalid Input Handling', () => {
    it('should return default value for undefined/null', () => {
      expect(parseRateLimitHeader(undefined)).toBe(0)
      expect(parseRateLimitHeader(null)).toBe(0)
      expect(parseRateLimitHeader('')).toBe(0)
    })

    it('should return default value for non-numeric strings', () => {
      expect(parseRateLimitHeader('abc')).toBe(0)
      expect(parseRateLimitHeader('not_a_number')).toBe(0)
      expect(parseRateLimitHeader('123abc')).toBe(123) // parseInt will parse the numeric prefix
      expect(parseRateLimitHeader('abc123')).toBe(0)
      expect(parseRateLimitHeader('invalid_number')).toBe(0)
    })

    it('should handle special numeric values', () => {
      expect(parseRateLimitHeader('NaN')).toBe(0)
      expect(parseRateLimitHeader('Infinity')).toBe(0)
      expect(parseRateLimitHeader('-Infinity')).toBe(0)
    })

    it('should handle malformed numeric strings', () => {
      expect(parseRateLimitHeader('1.5')).toBe(1) // parseInt stops at decimal
      expect(parseRateLimitHeader('1e3')).toBe(1) // parseInt doesn't handle scientific notation
      expect(parseRateLimitHeader('0x10')).toBe(0) // parseInt with base 10 doesn't handle hex
      expect(parseRateLimitHeader('010')).toBe(10) // parseInt with base 10 handles octals as decimal
    })
  })

  describe('Custom Default Value', () => {
    it('should use custom default value when provided', () => {
      expect(parseRateLimitHeader(undefined, 100)).toBe(100)
      expect(parseRateLimitHeader(null, 50)).toBe(50)
      expect(parseRateLimitHeader('invalid', 999)).toBe(999)
      expect(parseRateLimitHeader('NaN', 42)).toBe(42)
    })

    it('should still parse valid values when custom default is provided', () => {
      expect(parseRateLimitHeader('200', 100)).toBe(200)
      expect(parseRateLimitHeader('0', 100)).toBe(0)
    })
  })

  describe('Edge Cases from Real API Responses', () => {
    it('should handle actual GitHub rate limit header values', () => {
      // Common GitHub API rate limit values
      expect(parseRateLimitHeader('5000')).toBe(5000) // Default authenticated limit
      expect(parseRateLimitHeader('60')).toBe(60) // Unauthenticated limit
      expect(parseRateLimitHeader('0')).toBe(0) // Rate limited
      expect(parseRateLimitHeader('4999')).toBe(4999) // After one request
    })

    it('should handle missing headers from error responses', () => {
      // Simulate headers object with missing values
      const headers: Record<string, string | undefined> = {
        'x-ratelimit-limit': undefined,
        'x-ratelimit-remaining': 'not_a_number',
        'x-ratelimit-reset': '',
      }

      expect(parseRateLimitHeader(headers['x-ratelimit-limit'])).toBe(0)
      expect(parseRateLimitHeader(headers['x-ratelimit-remaining'])).toBe(0)
      expect(parseRateLimitHeader(headers['x-ratelimit-reset'])).toBe(0)
    })

    it('should handle malformed headers from edge case responses', () => {
      // These are actual malformed values seen in the test suite
      expect(parseRateLimitHeader('invalid_number')).toBe(0)
      expect(parseRateLimitHeader('not_a_number')).toBe(0)
      expect(parseRateLimitHeader('invalid_timestamp')).toBe(0)
    })
  })
})
