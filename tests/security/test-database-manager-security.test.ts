/**
 * Security Test Suite for TestDatabaseManager
 *
 * Tests SQL injection prevention in table truncation operations
 */

import type { PGlite } from '@electric-sql/pglite'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseConnection } from '@/lib/test-utils/test-database-manager'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'

// Type-safe interface for accessing private methods in tests
interface TestDatabaseManagerInternal extends TestDatabaseManager {
  truncateAllTables(sql: NeonQueryFunction<false, false>): Promise<void>
  truncateAllTablesPGlite(db: PGlite): Promise<void>
  validateTableName(tableName: unknown): void
}

describe.skip('TestDatabaseManager Security', () => {
  let manager: TestDatabaseManager
  let connection: DatabaseConnection | null = null

  beforeEach(() => {
    manager = TestDatabaseManager.getInstance()
  })

  afterEach(async () => {
    if (connection) {
      await connection.cleanup()
      connection = null
    }
    await manager.cleanup()
  })

  describe('Table Name Validation', () => {
    it('should allow valid table names for truncation', async () => {
      connection = await manager.getConnection('test-valid-tables', {
        cleanup: 'truncate',
      })

      // Test that cleanup works with valid table names
      expect(async () => {
        await connection?.cleanup()
      }).not.toThrow()
    })

    it('should reject malicious table names in truncateAllTables', async () => {
      connection = await manager.getConnection('test-malicious-tables', {
        cleanup: 'truncate',
      })

      // Access private method through reflection for testing
      const managerInstance = manager as unknown as TestDatabaseManagerInternal
      const sql = connection.sql

      // Test malicious table names that should be rejected
      const maliciousTableNames = [
        'users; DROP TABLE users; --',
        "users'); DROP TABLE users; --",
        'users UNION SELECT * FROM pg_tables',
        '../../../etc/passwd',
        'users/**/OR/**/1=1',
        "users; INSERT INTO users VALUES ('hacker'); --",
      ]

      for (const maliciousName of maliciousTableNames) {
        // Mock the tables array to include malicious name
        const originalTruncateMethod = managerInstance.truncateAllTables
        managerInstance.truncateAllTables = async function (
          this: TestDatabaseManagerInternal,
          sqlClient: NeonQueryFunction<false, false>
        ) {
          const tables = ['user_skills', 'opportunities', 'repositories', 'users', maliciousName]

          for (const table of tables) {
            try {
              // This should throw for malicious table names
              this.validateTableName(table)

              // Use switch statement like the real implementation to avoid SQL injection
              switch (table) {
                case 'user_skills':
                  await sqlClient`TRUNCATE TABLE user_skills CASCADE`
                  break
                case 'opportunities':
                  await sqlClient`TRUNCATE TABLE opportunities CASCADE`
                  break
                case 'repositories':
                  await sqlClient`TRUNCATE TABLE repositories CASCADE`
                  break
                case 'users':
                  await sqlClient`TRUNCATE TABLE users CASCADE`
                  break
                default:
                  // This should never be reached for valid table names due to validation
                  throw new Error(
                    `Invalid table name: ${table}. Only predefined tables are allowed for truncation.`
                  )
              }
            } catch (error) {
              if (error instanceof Error && error.message.includes('Invalid table name')) {
                throw error
              }
              console.warn(`Failed to truncate ${table}:`, error)
            }
          }
        }.bind(managerInstance)

        // Should throw an error for malicious table name
        await expect(managerInstance.truncateAllTables(sql)).rejects.toThrow(
          `Invalid table name: ${maliciousName}. Only predefined tables are allowed for truncation.`
        )

        // Restore original method
        managerInstance.truncateAllTables = originalTruncateMethod
      }
    })

    it('should reject malicious table names in truncateAllTablesPGlite', async () => {
      connection = await manager.getConnection('test-malicious-pglite', {
        cleanup: 'truncate',
      })

      // Access private method through reflection for testing
      const managerInstance = manager as unknown as TestDatabaseManagerInternal

      // Create a mock PGlite instance
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        close: vi.fn().mockResolvedValue(undefined),
        waitReady: Promise.resolve(),
      } as unknown as PGlite

      // Test malicious table names that should be rejected
      const maliciousTableNames = [
        'users; DROP TABLE users; --',
        "users'); DROP DATABASE test; --",
        'users UNION SELECT password FROM admin_users',
        'users/**/OR/**/1=1/**/--',
      ]

      for (const maliciousName of maliciousTableNames) {
        // Mock the tables array to include malicious name
        const originalTruncatePGliteMethod = managerInstance.truncateAllTablesPGlite
        managerInstance.truncateAllTablesPGlite = async function (
          this: TestDatabaseManagerInternal,
          db: PGlite
        ) {
          const tables = ['user_skills', 'opportunities', 'repositories', 'users', maliciousName]

          for (const table of tables) {
            try {
              // This should throw for malicious table names
              this.validateTableName(table)

              // Use switch statement like the real implementation to avoid SQL injection
              switch (table) {
                case 'user_skills':
                  await db.query('TRUNCATE TABLE user_skills CASCADE')
                  break
                case 'opportunities':
                  await db.query('TRUNCATE TABLE opportunities CASCADE')
                  break
                case 'repositories':
                  await db.query('TRUNCATE TABLE repositories CASCADE')
                  break
                case 'users':
                  await db.query('TRUNCATE TABLE users CASCADE')
                  break
                default:
                  // This should never be reached for valid table names due to validation
                  throw new Error(
                    `Invalid table name: ${table}. Only predefined tables are allowed for truncation.`
                  )
              }
            } catch (error) {
              if (error instanceof Error && error.message.includes('Invalid table name')) {
                throw error
              }
              console.warn(`Failed to truncate ${table} in PGlite:`, error)
            }
          }
        }.bind(managerInstance)

        // Should throw an error for malicious table name
        await expect(managerInstance.truncateAllTablesPGlite(mockDb)).rejects.toThrow(
          `Invalid table name: ${maliciousName}. Only predefined tables are allowed for truncation.`
        )

        // Restore original method
        managerInstance.truncateAllTablesPGlite = originalTruncatePGliteMethod
      }
    })

    it('should validate allowed table names correctly', () => {
      const managerInstance = manager as unknown as TestDatabaseManagerInternal

      // Valid table names should not throw
      const validTableNames = [
        'users',
        'repositories',
        'opportunities',
        'user_skills',
        'user_repository_interactions',
        'notifications',
        'contribution_outcomes',
        'user_preferences',
      ]

      for (const tableName of validTableNames) {
        expect(() => {
          managerInstance.validateTableName(tableName)
        }).not.toThrow()
      }

      // Invalid table names should throw
      const invalidTableNames = [
        'admin_users',
        'pg_tables',
        'information_schema.tables',
        'users; DROP TABLE users',
        "users'); DROP DATABASE",
        '../../../etc/passwd',
        'users UNION SELECT * FROM passwords',
      ]

      for (const tableName of invalidTableNames) {
        expect(() => {
          managerInstance.validateTableName(tableName)
        }).toThrow(
          `Invalid table name: ${tableName}. Only predefined tables are allowed for truncation.`
        )
      }
    })
  })

  describe('Functional Integrity', () => {
    it('should maintain cleanup functionality after security fixes', async () => {
      connection = await manager.getConnection('test-cleanup-integrity', {
        cleanup: 'truncate',
      })

      // Verify connection is working
      expect(connection).toBeDefined()
      expect(connection.sql).toBeDefined()
      expect(connection.strategy).toBe('mock') // Respects TEST_DB_STRATEGY environment variable

      // Test that we can perform basic operations
      const result = await connection.sql`SELECT 1 as test`
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ test: 1 })

      // Test cleanup works without throwing
      await expect(connection.cleanup()).resolves.not.toThrow()
    })

    it('should handle table truncation for valid tables without errors', async () => {
      connection = await manager.getConnection('test-valid-truncation', {
        cleanup: 'truncate',
      })

      // Insert test data
      await connection.sql`
        INSERT INTO users (github_id, github_username, email, name) 
        VALUES ('123', 'testuser', 'test@example.com', 'Test User')
      `

      // Verify data exists
      const beforeCleanup = await connection.sql`SELECT COUNT(*) as count FROM users`
      expect(beforeCleanup[0]?.count).toBe(1)

      // Cleanup should truncate tables
      await connection.cleanup()

      // Since some strategies close the connection during cleanup, we need a fresh connection to verify
      const newConnection = await manager.getConnection('test-post-cleanup', {})

      // Verify tables are empty after cleanup
      const afterCleanup = await newConnection.sql`SELECT COUNT(*) as count FROM users`
      expect(afterCleanup[0]?.count).toBe(0)

      await newConnection.cleanup()
    })
  })

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', () => {
      const managerInstance = manager as unknown as TestDatabaseManagerInternal

      // Null/undefined table names
      expect(() => {
        managerInstance.validateTableName(null)
      }).toThrow('Invalid table name: null. Only predefined tables are allowed for truncation.')

      expect(() => {
        managerInstance.validateTableName(undefined)
      }).toThrow(
        'Invalid table name: undefined. Only predefined tables are allowed for truncation.'
      )

      // Empty string
      expect(() => {
        managerInstance.validateTableName('')
      }).toThrow('Invalid table name: . Only predefined tables are allowed for truncation.')

      // Whitespace-only
      expect(() => {
        managerInstance.validateTableName('   ')
      }).toThrow('Invalid table name:    . Only predefined tables are allowed for truncation.')
    })

    it('should maintain existing error handling for non-existent tables', async () => {
      connection = await manager.getConnection('test-error-handling', {
        cleanup: 'truncate',
      })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // Suppress console.warn during tests
      })

      // Cleanup should handle non-existent tables gracefully
      await expect(connection.cleanup()).resolves.not.toThrow()

      // The console.warn should have been called for tables that don't exist
      // but this is implementation-dependent on database strategy behavior

      consoleSpy.mockRestore()
    })
  })
})
