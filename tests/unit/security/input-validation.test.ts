/**
 * Input Validation System Tests
 * Tests comprehensive input validation and sanitization functionality
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SecurityError } from '@/lib/security/error-boundaries'
import {
  CommonSchemas,
  createValidationMiddleware,
  GitHubSchemas,
  InputValidator,
  Sanitizers,
  ValidationPatterns,
} from '@/lib/security/input-validation'

describe('ValidationPatterns', () => {
  describe('GITHUB_USERNAME', () => {
    it('should validate valid GitHub usernames', () => {
      const validUsernames = [
        'user123',
        'test-user',
        'Test-User-123',
        'a',
        '0-test',
        'user-name-with-39-chars-exactly-fits',
      ]

      validUsernames.forEach(username => {
        expect(ValidationPatterns.GITHUB_USERNAME.test(username)).toBe(true)
      })
    })

    it('should reject invalid GitHub usernames', () => {
      const invalidUsernames = [
        'user-',
        '-user',
        'user--name',
        'user name',
        'user@name',
        'user.name',
        'a-very-long-username-that-exceeds-39-characters',
        '',
      ]

      invalidUsernames.forEach(username => {
        expect(ValidationPatterns.GITHUB_USERNAME.test(username)).toBe(false)
      })
    })
  })

  describe('SEMVER', () => {
    it('should validate semantic versions', () => {
      const validVersions = [
        '1.0.0',
        '0.0.1',
        '1.2.3',
        '1.0.0-alpha',
        '1.0.0-alpha.1',
        '1.0.0-0.3.7',
        '1.0.0-x.7.z.92',
        '1.0.0+20130313144700',
        '1.0.0-beta+exp.sha.5114f85',
      ]

      validVersions.forEach(version => {
        expect(ValidationPatterns.SEMVER.test(version)).toBe(true)
      })
    })

    it('should reject invalid semantic versions', () => {
      const invalidVersions = ['1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-', '1.2.3+']

      invalidVersions.forEach(version => {
        expect(ValidationPatterns.SEMVER.test(version)).toBe(false)
      })
    })
  })
})

describe('Sanitizers', () => {
  describe('stripHtml', () => {
    it('should remove dangerous HTML tags', () => {
      const input = 'Hello <script>alert("XSS")</script>World'
      expect(Sanitizers.stripHtml(input)).toBe('Hello World')
    })

    it('should remove all HTML tags', () => {
      const input = '<p>Hello <strong>World</strong></p>'
      expect(Sanitizers.stripHtml(input)).toBe('Hello World')
    })

    it('should handle nested tags', () => {
      const input = '<div><script>bad</script><p>Good</p></div>'
      expect(Sanitizers.stripHtml(input)).toBe('Good')
    })
  })

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(Sanitizers.escapeHtml('<script>')).toBe('&lt;script&gt;')
      expect(Sanitizers.escapeHtml('&"\'</>')).toBe('&amp;&quot;&#39;&lt;&#x2F;&gt;')
    })
  })

  describe('normalizeWhitespace', () => {
    it('should normalize whitespace', () => {
      expect(Sanitizers.normalizeWhitespace('  hello   world  ')).toBe('hello world')
      expect(Sanitizers.normalizeWhitespace('hello\n\t\rworld')).toBe('hello world')
    })
  })

  describe('removeNullBytes', () => {
    it('should remove null bytes', () => {
      expect(Sanitizers.removeNullBytes('hello\0world')).toBe('helloworld')
      expect(Sanitizers.removeNullBytes('\0\0test\0')).toBe('test')
    })
  })

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(Sanitizers.truncate('hello world', 5)).toBe('hello')
      expect(Sanitizers.truncate('short', 10)).toBe('short')
    })
  })
})

describe('CommonSchemas', () => {
  describe('email', () => {
    it('should validate and normalize emails', () => {
      const result = CommonSchemas.email.parse('TEST@EXAMPLE.COM ')
      expect(result).toBe('test@example.com')
    })

    it('should reject invalid emails', () => {
      expect(() => CommonSchemas.email.parse('not-an-email')).toThrow()
      expect(() => CommonSchemas.email.parse('')).toThrow()
    })
  })

  describe('username', () => {
    it('should validate GitHub usernames', () => {
      const result = CommonSchemas.username.parse('test-user')
      expect(result).toBe('test-user')
    })

    it('should reject invalid usernames', () => {
      expect(() => CommonSchemas.username.parse('ab')).toThrow()
      expect(() => CommonSchemas.username.parse('user--name')).toThrow()
    })
  })

  describe('safeText', () => {
    it('should sanitize text input', () => {
      const input = '  <script>alert("xss")</script>Hello World  '
      const result = CommonSchemas.safeText.parse(input)
      expect(result).toBe('Hello World')
    })
  })

  describe('url', () => {
    it('should validate URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://sub.domain.com/path?query=value',
      ]

      validUrls.forEach(url => {
        expect(CommonSchemas.url.parse(url)).toBe(url)
      })
    })

    it('should reject non-HTTP(S) URLs', () => {
      expect(() => CommonSchemas.url.parse('ftp://example.com')).toThrow()
      expect(() => CommonSchemas.url.parse('javascript:alert(1)')).toThrow()
    })
  })

  describe('pagination', () => {
    it('should provide default values', () => {
      const result = CommonSchemas.pagination.parse({})
      expect(result).toEqual({
        page: 1,
        limit: 20,
        sort: 'desc',
      })
    })

    it('should validate limits', () => {
      expect(() => CommonSchemas.pagination.parse({ limit: 0 })).toThrow()
      expect(() => CommonSchemas.pagination.parse({ limit: 101 })).toThrow()
    })
  })
})

describe('GitHubSchemas', () => {
  describe('repository', () => {
    it('should validate repository input', () => {
      const input = {
        owner: 'test-user',
        name: 'test-repo',
        description: '<p>Test description</p>',
        private: true,
        topics: ['javascript', 'typescript'],
      }

      const result = GitHubSchemas.repository.parse(input)
      expect(result.description).toBe('Test description')
    })
  })

  describe('webhookPayload', () => {
    it('should validate webhook payload structure', () => {
      const payload = {
        action: 'opened',
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'user/test-repo',
          owner: {
            login: 'user',
            id: 456,
          },
        },
        sender: {
          login: 'sender',
          id: 789,
        },
        extra_field: 'allowed',
      }

      const result = GitHubSchemas.webhookPayload.parse(payload)
      expect(result).toMatchObject(payload)
    })
  })
})

describe('InputValidator', () => {
  let validator: InputValidator

  beforeEach(() => {
    validator = InputValidator.getInstance()
  })

  describe('validate', () => {
    it('should validate input successfully', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      })

      const result = await validator.validate(schema, {
        name: 'Test',
        age: 25,
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'Test', age: 25 })
    })

    it('should return validation errors', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      })

      const result = await validator.validate(schema, {
        name: 'Test',
        age: -1,
      })

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('should throw on validation error when configured', async () => {
      const schema = z.string()

      await expect(validator.validate(schema, 123, { throwOnError: true })).rejects.toThrow(
        SecurityError
      )
    })

    it('should detect SQL injection attempts', async () => {
      const schema = z.string()
      const input = "'; DROP TABLE users; --"

      await expect(validator.validate(schema, input)).rejects.toThrow(
        'Potential injection detected'
      )
    })

    it('should detect XSS attempts', async () => {
      const schema = z.object({
        comment: z.string(),
      })

      const input = {
        comment: "test'; $.get('evil.com'); //",
      }

      await expect(validator.validate(schema, input)).rejects.toThrow(
        'Potential injection detected'
      )
    })

    it('should reject oversized input', async () => {
      const schema = z.string()
      const largeInput = 'x'.repeat(2 * 1024 * 1024) // 2MB

      await expect(validator.validate(schema, largeInput)).rejects.toThrow('Input too large')
    })
  })

  describe('validateBatch', () => {
    it('should validate multiple inputs', async () => {
      const schemas = {
        name: z.string(),
        age: z.number().min(0),
        email: CommonSchemas.email,
      }

      const inputs = {
        name: 'Test',
        age: 25,
        email: 'test@example.com',
      }

      const result = await validator.validateBatch(schemas, inputs)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        name: 'Test',
        age: 25,
        email: 'test@example.com',
      })
    })

    it('should return errors for failed validations', async () => {
      const schemas = {
        name: z.string(),
        age: z.number().min(0),
      }

      const inputs = {
        name: 123,
        age: -1,
      }

      const result = await validator.validateBatch(schemas, inputs as Record<string, unknown>)

      expect(result.success).toBe(false)
      expect(result.errors?.name).toBeDefined()
      expect(result.errors?.age).toBeDefined()
    })
  })

  describe('createValidatedHandler', () => {
    it('should create a validated handler', async () => {
      const schema = z.object({
        x: z.number(),
        y: z.number(),
      })

      const handler = validator.createValidatedHandler(schema, async input => input.x + input.y)

      const result = await handler({ x: 5, y: 3 }, {})
      expect(result).toBe(8)
    })

    it('should throw on invalid input', async () => {
      const schema = z.object({
        x: z.number(),
      })

      const handler = validator.createValidatedHandler(schema, async input => input.x)

      await expect(handler({ x: 'not a number' }, {})).rejects.toThrow()
    })
  })
})

describe('createValidationMiddleware', () => {
  it('should validate request body', async () => {
    const schema = z.object({
      name: z.string(),
      email: CommonSchemas.email,
    })

    const middleware = createValidationMiddleware(schema)

    const request = new Request('http://example.com', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'test@example.com',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const result = await middleware(request)
    expect(result).toEqual({
      name: 'Test',
      email: 'test@example.com',
    })
  })

  it('should validate query parameters', async () => {
    const schema = z.object({
      page: z.string().transform(Number),
      limit: z.string().transform(Number),
    })

    const middleware = createValidationMiddleware(schema, 'query')

    const request = new Request('http://example.com?page=2&limit=10')

    const result = await middleware(request)
    expect(result).toEqual({
      page: 2,
      limit: 10,
    })
  })
})
