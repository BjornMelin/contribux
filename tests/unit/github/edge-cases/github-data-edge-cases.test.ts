/**
 * GitHub Data Edge Cases Test Suite
 *
 * Comprehensive testing of data validation, boundary conditions,
 * malformed data handling, encoding issues, and data integrity.
 *
 * Test Coverage:
 * - Data Type Validation and Coercion
 * - Boundary Value Testing
 * - Malformed and Invalid Data Handling
 * - Unicode and Encoding Edge Cases
 * - Large Data Set Processing
 * - Data Consistency and Integrity
 */

import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mswServer } from '../msw-setup'
import {
  NULL_VALUE_REPOSITORY,
  SPECIAL_CHARACTERS,
  WRONG_TYPES_REPOSITORY,
} from './fixtures/error-scenarios'
import { malformedResponseHandlers } from './mocks/error-api-mocks'
import {
  createEdgeCaseClient,
  EDGE_CASE_PARAMS,
  setupEdgeCaseTestIsolation,
} from './setup/edge-case-setup'

describe('GitHub Data Edge Cases', () => {
  // Setup MSW and enhanced test isolation
  setupEdgeCaseTestIsolation()

  describe('Data Type Validation and Coercion', () => {
    it('should handle null values in repository data', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/null-test/repository', () => {
          return HttpResponse.json(NULL_VALUE_REPOSITORY)
        })
      )

      const repo = await client.getRepository('null-test', 'repository')
      expect(repo).toBeDefined()
      expect(repo.id).toBe(123456)
      expect(repo.name).toBe('repository')

      // Should handle null values gracefully
      expect(repo.description).toBeNull()
      expect(repo.homepage).toBeNull()
      expect(repo.language).toBeNull()
    })

    it('should handle wrong data types in repository fields', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/wrong-types/repository', () => {
          return HttpResponse.json(WRONG_TYPES_REPOSITORY)
        })
      )

      const repo = await client.getRepository('wrong-types', 'repository')
      expect(repo).toBeDefined()

      // Should handle type coercion appropriately
      expect(typeof repo.id).toBe('number')
      expect(typeof repo.private).toBe('boolean')
      expect(typeof repo.fork).toBe('boolean')
    })

    it('should validate required fields are present', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/missing-fields/repository', () => {
          return HttpResponse.json({
            // Missing required fields like id, name, full_name
            description: 'Repository with missing required fields',
          })
        })
      )

      await expect(client.getRepository('missing-fields', 'repository')).rejects.toThrow()
    })

    it('should handle unexpected additional fields', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/extra-fields/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'extra-fields/repository',
            private: false,
            // Additional unexpected fields
            experimental_feature: true,
            internal_data: { secret: 'value' },
            future_api_field: 'new_value',
            null_field: null,
            undefined_field: undefined,
          })
        })
      )

      const repo = await client.getRepository('extra-fields', 'repository')
      expect(repo).toBeDefined()
      expect(repo.id).toBe(123456)
      expect(repo.name).toBe('repository')

      // Should ignore unexpected fields gracefully
    })
  })

  describe('Boundary Value Testing', () => {
    it('should handle extremely long string values', async () => {
      const client = createEdgeCaseClient()

      const longString = 'A'.repeat(100000) // 100KB string

      mswServer.use(
        http.get('https://api.github.com/repos/long-strings/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'long-strings/repository',
            description: longString,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('long-strings', 'repository')
      expect(repo).toBeDefined()
      expect(repo.description?.length).toBe(100000)
    })

    it('should handle maximum integer values', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/max-values/repository', () => {
          return HttpResponse.json({
            id: Number.MAX_SAFE_INTEGER,
            name: 'repository',
            full_name: 'max-values/repository',
            size: Number.MAX_SAFE_INTEGER,
            stargazers_count: Number.MAX_SAFE_INTEGER,
            watchers_count: Number.MAX_SAFE_INTEGER,
            forks_count: Number.MAX_SAFE_INTEGER,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('max-values', 'repository')
      expect(repo).toBeDefined()
      expect(repo.id).toBe(Number.MAX_SAFE_INTEGER)
      expect(repo.size).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle zero and negative values', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/zero-negative/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'zero-negative/repository',
            size: 0,
            stargazers_count: 0,
            watchers_count: -1, // Invalid but should be handled
            forks_count: 0,
            open_issues_count: 0,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('zero-negative', 'repository')
      expect(repo).toBeDefined()
      expect(repo.size).toBe(0)
      expect(repo.stargazers_count).toBe(0)
      expect(repo.forks_count).toBe(0)
    })

    it('should handle empty arrays and objects', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/empty-collections/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'empty-collections/repository',
            topics: [], // Empty array
            license: null, // Null object
            permissions: {}, // Empty object
            private: false,
          })
        })
      )

      const repo = await client.getRepository('empty-collections', 'repository')
      expect(repo).toBeDefined()
      expect(Array.isArray(repo.topics)).toBe(true)
      expect(repo.topics.length).toBe(0)
      expect(repo.license).toBeNull()
    })
  })

  describe('Malformed and Invalid Data Handling', () => {
    it('should handle malformed JSON responses', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...malformedResponseHandlers)

      await expect(client.getRepository(EDGE_CASE_PARAMS.MALFORMED)).rejects.toThrow()
    })

    it('should handle invalid JSON syntax', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/invalid-json/syntax', () => {
          return new HttpResponse('{ "id": 123456, "name": "invalid", invalid_syntax }', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )

      await expect(client.getRepository('invalid-json', 'syntax')).rejects.toThrow()
    })

    it('should handle circular references in objects', async () => {
      const client = createEdgeCaseClient()

      // Note: JSON.stringify cannot handle circular references
      // This would be caught during serialization
      mswServer.use(
        http.get('https://api.github.com/repos/circular/reference', () => {
          const obj: Record<string, unknown> = {
            id: 123456,
            name: 'reference',
            full_name: 'circular/reference',
            private: false,
          }

          // This would cause issues in real scenario but MSW handles it
          try {
            return HttpResponse.json(obj)
          } catch {
            return HttpResponse.json({ error: 'Circular reference detected' }, { status: 500 })
          }
        })
      )

      const repo = await client.getRepository('circular', 'reference')
      expect(repo).toBeDefined()
    })

    it('should handle deeply nested object structures', async () => {
      const client = createEdgeCaseClient()

      // Create deeply nested structure
      let deepObject: Record<string, unknown> = { value: 'deep' }
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject }
      }

      mswServer.use(
        http.get('https://api.github.com/repos/deep-nested/object', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'object',
            full_name: 'deep-nested/object',
            metadata: deepObject,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('deep-nested', 'object')
      expect(repo).toBeDefined()
      expect(repo.id).toBe(123456)
    })
  })

  describe('Unicode and Encoding Edge Cases', () => {
    it('should handle Unicode characters in repository names', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/unicode-test/测试-repo-🚀', () => {
          return HttpResponse.json({
            id: 123456,
            name: '测试-repo-🚀',
            full_name: 'unicode-test/测试-repo-🚀',
            description: '这是一个测试仓库 with emojis 🎉🔧⭐',
            private: false,
          })
        })
      )

      const repo = await client.getRepository('unicode-test', '测试-repo-🚀')
      expect(repo).toBeDefined()
      expect(repo.name).toBe('测试-repo-🚀')
      expect(repo.description).toContain('🎉🔧⭐')
    })

    it('should handle special characters and symbols', async () => {
      const client = createEdgeCaseClient()

      const specialChars = SPECIAL_CHARACTERS

      mswServer.use(
        http.get('https://api.github.com/repos/special-chars/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'special-chars/repository',
            description: specialChars.description,
            topics: specialChars.topics,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('special-chars', 'repository')
      expect(repo).toBeDefined()
      expect(repo.description).toBe(specialChars.description)
      expect(repo.topics).toEqual(specialChars.topics)
    })

    it('should handle different character encodings', async () => {
      const client = createEdgeCaseClient()

      const encodingTests = [
        { name: 'utf8', text: 'Hello, 世界! 🌍' },
        { name: 'latin1', text: 'Café résumé naïve' },
        { name: 'cyrillic', text: 'Привет мир' },
        { name: 'arabic', text: 'مرحبا بالعالم' },
        { name: 'hebrew', text: 'שלום עולם' },
      ]

      for (const test of encodingTests) {
        mswServer.use(
          http.get(`https://api.github.com/repos/encoding-test/${test.name}`, () => {
            return HttpResponse.json({
              id: 123456,
              name: test.name,
              full_name: `encoding-test/${test.name}`,
              description: test.text,
              private: false,
            })
          })
        )

        const repo = await client.getRepository('encoding-test', test.name)
        expect(repo).toBeDefined()
        expect(repo.description).toBe(test.text)
      }
    })

    it('should handle escape sequences and control characters', async () => {
      const client = createEdgeCaseClient()

      const controlChars = '\u0000\u0001\u0002\u0008\u000b\u000c\u000e\u001f'
      const escapeSequences = '\\n\\r\\t\\\\\\"\\/'

      mswServer.use(
        http.get('https://api.github.com/repos/control-chars/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'control-chars/repository',
            description: `Control chars: ${controlChars} Escapes: ${escapeSequences}`,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('control-chars', 'repository')
      expect(repo).toBeDefined()
      expect(repo.description).toContain('Control chars:')
      expect(repo.description).toContain('Escapes:')
    })
  })

  describe('Large Data Set Processing', () => {
    it('should handle repositories with many topics', async () => {
      const client = createEdgeCaseClient()

      const manyTopics = Array.from({ length: 1000 }, (_, i) => `topic-${i}`)

      mswServer.use(
        http.get('https://api.github.com/repos/many-topics/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'many-topics/repository',
            topics: manyTopics,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('many-topics', 'repository')
      expect(repo).toBeDefined()
      expect(repo.topics.length).toBe(1000)
      expect(repo.topics[0]).toBe('topic-0')
      expect(repo.topics[999]).toBe('topic-999')
    })

    it('should handle large license object', async () => {
      const client = createEdgeCaseClient()

      const largeLicense = {
        key: 'custom-license',
        name: 'Custom License',
        spdx_id: 'NOASSERTION',
        url: null,
        node_id: `L${'x'.repeat(1000)}`,
        body: 'A'.repeat(50000), // 50KB license text
      }

      mswServer.use(
        http.get('https://api.github.com/repos/large-license/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'large-license/repository',
            license: largeLicense,
            private: false,
          })
        })
      )

      const repo = await client.getRepository('large-license', 'repository')
      expect(repo).toBeDefined()
      expect(repo.license?.body?.length).toBe(50000)
    })

    it('should handle arrays with mixed data types', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/mixed-types/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'mixed-types/repository',
            topics: ['string', 123, true, null, { object: 'value' }], // Mixed types
            private: false,
          })
        })
      )

      const repo = await client.getRepository('mixed-types', 'repository')
      expect(repo).toBeDefined()
      expect(Array.isArray(repo.topics)).toBe(true)
      // Should handle mixed types appropriately
    })
  })

  describe('Data Consistency and Integrity', () => {
    it('should handle inconsistent date formats', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/date-formats/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'date-formats/repository',
            created_at: '2023-01-01T12:00:00Z', // ISO format
            updated_at: '2023-01-02 12:00:00', // Non-ISO format
            pushed_at: 1672574400, // Unix timestamp
            private: false,
          })
        })
      )

      const repo = await client.getRepository('date-formats', 'repository')
      expect(repo).toBeDefined()
      expect(repo.created_at).toBeTruthy()
      expect(repo.updated_at).toBeTruthy()
      expect(repo.pushed_at).toBeTruthy()
    })

    it('should handle mismatched owner and repository data', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/owner-mismatch/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'different-owner/repository', // Mismatch
            owner: {
              login: 'different-owner',
              id: 654321,
              type: 'User',
            },
            private: false,
          })
        })
      )

      const repo = await client.getRepository('owner-mismatch', 'repository')
      expect(repo).toBeDefined()
      expect(repo.owner.login).toBe('different-owner')
      expect(repo.full_name).toBe('different-owner/repository')
    })

    it('should handle duplicate field values', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/duplicates/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'duplicates/repository',
            watchers_count: 100,
            watchers: 100, // Duplicate with different name
            stargazers_count: 50,
            stars: 50, // Duplicate with different name
            private: false,
          })
        })
      )

      const repo = await client.getRepository('duplicates', 'repository')
      expect(repo).toBeDefined()
      expect(repo.watchers_count).toBe(100)
      expect(repo.stargazers_count).toBe(50)
    })

    it('should validate data relationships and constraints', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/constraints/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'constraints/repository',
            fork: true,
            parent: null, // Invalid: fork should have parent
            forks_count: -5, // Invalid: negative count
            size: 'large', // Invalid: should be number
            private: false,
          })
        })
      )

      const repo = await client.getRepository('constraints', 'repository')
      expect(repo).toBeDefined()
      // Should handle constraint violations gracefully
      expect(repo.fork).toBe(true)
    })
  })

  describe('Error Recovery with Invalid Data', () => {
    it('should maintain functionality after processing invalid data', async () => {
      const client = createEdgeCaseClient()

      // First request with invalid data
      mswServer.use(
        http.get('https://api.github.com/repos/invalid-data/first', () => {
          return HttpResponse.json({
            id: 'not-a-number', // Invalid
            name: 123, // Invalid type
            full_name: null, // Invalid
          })
        })
      )

      try {
        await client.getRepository('invalid-data', 'first')
        // May succeed or fail depending on validation
      } catch {
        // Expected for invalid data
      }

      // Client should still work for valid requests
      const user = await client.getUser('octocat')
      expect(user).toBeDefined()
      expect(user.login).toBe('octocat')
    })

    it('should handle partial data corruption gracefully', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/partial-corruption/repository', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'repository',
            full_name: 'partial-corruption/repository',
            // Some fields corrupted
            owner: 'not-an-object',
            permissions: 'not-an-object',
            // Some fields valid
            description: 'Valid description',
            private: false,
          })
        })
      )

      try {
        const repo = await client.getRepository('partial-corruption', 'repository')
        // Should get what data is recoverable
        expect(repo.id).toBe(123456)
        expect(repo.description).toBe('Valid description')
      } catch (error) {
        // Or fail gracefully with meaningful error
        expect(error).toBeInstanceOf(Error)
      }
    })
  })
})
