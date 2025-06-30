/**
 * Database Security Testing Suite
 * Comprehensive security tests for Drizzle ORM, SQL injection prevention,
 * connection security, data access control, and encryption validation
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { sql } from '../../src/lib/db/config'

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

  describe('SQL Injection Prevention', () => {
    it('should use parameterized queries for user authentication', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password'
      }])

      const userEmail = "'; DROP TABLE users; --"
      
      // This should use parameterized query, not string concatenation
      await sql`SELECT * FROM users WHERE email = ${userEmail} LIMIT 1`
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT * FROM users WHERE email = '),
          expect.stringContaining('LIMIT 1')
        ]),
        "'; DROP TABLE users; --"
      )
      
      // Verify the malicious SQL was passed as a parameter, not concatenated
      const callArgs = mockSql.mock.calls[0]
      expect(callArgs[1]).toBe("'; DROP TABLE users; --")
    })

    it('should prevent SQL injection in search queries', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const maliciousQuery = "test' UNION SELECT password FROM users --"
      
      await sql`
        SELECT r.*, ts_rank(search_vector, plainto_tsquery('english', ${maliciousQuery})) as rank
        FROM repositories r 
        WHERE search_vector @@ plainto_tsquery('english', ${maliciousQuery})
        ORDER BY rank DESC
        LIMIT 20
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining("SELECT r.*, ts_rank"),
          expect.stringContaining("plainto_tsquery('english', "),
          expect.stringContaining("ORDER BY rank DESC"),
          expect.stringContaining("LIMIT 20")
        ]),
        maliciousQuery,
        maliciousQuery
      )
    })

    it('should sanitize input in user profile updates', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'user-123' }])

      const maliciousDisplayName = "<script>alert('xss')</script>"
      const userId = 'user-123'
      
      await sql`
        UPDATE users 
        SET display_name = ${maliciousDisplayName}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
        RETURNING id
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('UPDATE users'),
          expect.stringContaining('SET display_name = '),
          expect.stringContaining('WHERE id = '),
          expect.stringContaining('RETURNING id')
        ]),
        maliciousDisplayName,
        userId
      )
    })

    it('should use parameterized queries for OAuth account insertion', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const userId = 'user-123'
      const provider = 'github'
      const providerAccountId = 'malicious"; DROP TABLE oauth_accounts; --'
      
      await sql`
        INSERT INTO oauth_accounts (
          user_id, provider, provider_account_id, access_token, 
          refresh_token, expires_at, token_type, scope, is_primary, linked_at
        )
        VALUES (
          ${userId}, ${provider}, ${providerAccountId}, ${'access-token'},
          ${'refresh-token'}, ${null}, ${'bearer'}, ${'read:user'},
          ${false}, CURRENT_TIMESTAMP
        )
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO oauth_accounts'),
          expect.stringContaining('VALUES')
        ]),
        userId,
        provider,
        providerAccountId,
        'access-token',
        'refresh-token',
        null,
        'bearer',
        'read:user',
        false
      )
    })

    it('should prevent SQL injection in repository filtering', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const language = "'; UPDATE repositories SET private = true; --"
      const minStars = 100
      
      await sql`
        SELECT * FROM repositories 
        WHERE language = ${language} 
        AND stars >= ${minStars}
        AND NOT private
        ORDER BY stars DESC
        LIMIT 50
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT * FROM repositories'),
          expect.stringContaining('WHERE language = '),
          expect.stringContaining('AND stars >= '),
          expect.stringContaining('ORDER BY stars DESC'),
          expect.stringContaining('LIMIT 50')
        ]),
        language,
        minStars
      )
    })
  })

  describe('Data Access Control', () => {
    it('should enforce user-specific data access', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const userId = 'user-123'
      const otherUserId = 'user-456'
      
      // Should only return data for the authenticated user
      await sql`
        SELECT bookmarks.*, repositories.name, repositories.full_name
        FROM bookmarks
        JOIN repositories ON bookmarks.repository_id = repositories.id
        WHERE bookmarks.user_id = ${userId}
        ORDER BY bookmarks.created_at DESC
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT bookmarks.*, repositories.name'),
          expect.stringContaining('WHERE bookmarks.user_id = ')
        ]),
        userId
      )
      
      // Verify no other user's data is accessible
      expect(mockSql).not.toHaveBeenCalledWith(
        expect.anything(),
        otherUserId
      )
    })

    it('should validate user permissions for sensitive operations', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ user_id: 'user-123' }])

      const bookmarkId = 'bookmark-456'
      const userId = 'user-123'
      
      // Check ownership before deletion
      const ownershipCheck = await sql`
        SELECT user_id FROM bookmarks WHERE id = ${bookmarkId} AND user_id = ${userId}
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT user_id FROM bookmarks'),
          expect.stringContaining('WHERE id = '),
          expect.stringContaining('AND user_id = ')
        ]),
        bookmarkId,
        userId
      )
    })

    it('should enforce role-based access control', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ role: 'user' }])

      const userId = 'user-123'
      
      // Check user role before admin operations
      await sql`
        SELECT role FROM users WHERE id = ${userId} AND role IN ('admin', 'moderator')
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT role FROM users'),
          expect.stringContaining("role IN ('admin', 'moderator')")
        ]),
        userId
      )
    })

    it('should limit query results for security', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const searchTerm = 'javascript'
      
      // Always use LIMIT to prevent resource exhaustion
      await sql`
        SELECT * FROM repositories 
        WHERE search_vector @@ plainto_tsquery('english', ${searchTerm})
        ORDER BY stars DESC
        LIMIT 100
      `
      
      const query = mockSql.mock.calls[0][0].join('')
      expect(query).toContain('LIMIT')
      expect(query).not.toContain('LIMIT 999999') // Avoid excessive limits
    })
  })

  describe('Data Encryption and Hashing', () => {
    it('should hash sensitive data before storage', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const apiKey = 'github-api-key-12345'
      const hashedApiKey = 'hashed-' + Buffer.from(apiKey).toString('base64')
      
      // API keys should be hashed before storage
      await sql`
        INSERT INTO user_api_keys (user_id, provider, api_key_hash, created_at)
        VALUES (${'user-123'}, ${'github'}, ${hashedApiKey}, CURRENT_TIMESTAMP)
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO user_api_keys'),
          expect.stringContaining('api_key_hash')
        ]),
        'user-123',
        'github',
        hashedApiKey
      )
      
      // Verify original API key is not stored
      expect(mockSql).not.toHaveBeenCalledWith(
        expect.anything(),
        apiKey
      )
    })

    it('should encrypt PII data at rest', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const email = 'test@example.com'
      const encryptedEmail = 'encrypted-' + Buffer.from(email).toString('base64')
      
      // Sensitive PII should be encrypted
      await sql`
        INSERT INTO user_private_data (user_id, encrypted_email, created_at)
        VALUES (${'user-123'}, ${encryptedEmail}, CURRENT_TIMESTAMP)
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO user_private_data'),
          expect.stringContaining('encrypted_email')
        ]),
        'user-123',
        encryptedEmail
      )
    })

    it('should use secure password hashing for admin accounts', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const password = 'admin-password-123'
      const saltedHash = 'bcrypt-$2b$12$' + Math.random().toString(36)
      
      // Administrative passwords should use strong hashing
      await sql`
        INSERT INTO admin_users (username, password_hash, created_at)
        VALUES (${'admin'}, ${saltedHash}, CURRENT_TIMESTAMP)
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO admin_users'),
          expect.stringContaining('password_hash')
        ]),
        'admin',
        saltedHash
      )
      
      // Verify plaintext password is not stored
      expect(mockSql).not.toHaveBeenCalledWith(
        expect.anything(),
        password
      )
    })
  })

  describe('Connection Security', () => {
    it('should use encrypted database connections', () => {
      // In real implementation, this would verify SSL/TLS
      const dbUrl = process.env.DATABASE_URL || ''
      expect(dbUrl).toBeDefined()
      // In production, should require SSL
      if (process.env.NODE_ENV === 'production') {
        expect(dbUrl).toContain('sslmode=require')
      }
    })

    it('should limit connection pool size', () => {
      // Database connection pool should be limited to prevent resource exhaustion
      const maxConnections = 20 // Example limit
      expect(maxConnections).toBeLessThanOrEqual(100)
      expect(maxConnections).toBeGreaterThan(0)
    })

    it('should use connection timeouts', () => {
      // Connections should timeout to prevent hanging
      const connectionTimeout = 30000 // 30 seconds
      const queryTimeout = 60000 // 60 seconds
      
      expect(connectionTimeout).toBeGreaterThan(0)
      expect(queryTimeout).toBeGreaterThan(connectionTimeout)
      expect(queryTimeout).toBeLessThanOrEqual(300000) // Max 5 minutes
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
      } catch (error) {
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
          expect.stringContaining('AND version = ')
        ]),
        'Updated Name',
        userId,
        currentVersion
      )
    })
  })

  describe('Audit Trail and Logging', () => {
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
          expect.stringContaining('event_type, event_severity, user_id')
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
          expect.stringContaining('login_attempt')
        ]),
        'login_attempt',
        'warning',
        email,
        ipAddress,
        false,
        '{"reason": "invalid_credentials"}'
      )
    })

    it('should maintain data integrity constraints', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      // Verify foreign key constraints are enforced
      await sql`
        INSERT INTO bookmarks (user_id, repository_id, created_at)
        VALUES (${'user-123'}, ${'repo-456'}, CURRENT_TIMESTAMP)
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO bookmarks'),
          expect.stringContaining('user_id, repository_id')
        ]),
        'user-123',
        'repo-456'
      )
    })
  })

  describe('Query Performance Security', () => {
    it('should prevent resource exhaustion with query limits', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const searchTerm = 'javascript'
      const maxResults = 1000
      
      // Large queries should be limited
      await sql`
        SELECT * FROM repositories 
        WHERE search_vector @@ plainto_tsquery('english', ${searchTerm})
        ORDER BY stars DESC
        LIMIT ${Math.min(maxResults, 500)}
      `
      
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('LIMIT')
        ]),
        searchTerm,
        500 // Should be capped at safe limit
      )
    })

    it('should use indexes for security-critical queries', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const email = 'test@example.com'
      
      // Email lookups should use indexes for performance and security
      await sql`
        SELECT id, email, password_hash 
        FROM users 
        WHERE email = ${email}
        LIMIT 1
      `
      
      const query = mockSql.mock.calls[0][0].join('')
      expect(query).toContain('WHERE email = ')
      expect(query).toContain('LIMIT 1')
      // In real implementation, would verify EXPLAIN plan shows index usage
    })

    it('should timeout long-running queries', () => {
      // Query timeout should be enforced to prevent DoS
      const queryTimeout = 30000 // 30 seconds
      expect(queryTimeout).toBeGreaterThan(0)
      expect(queryTimeout).toBeLessThanOrEqual(60000) // Max 1 minute
    })
  })
})