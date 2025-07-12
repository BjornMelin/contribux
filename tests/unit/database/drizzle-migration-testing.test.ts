/**
 * Drizzle Migration Testing Utilities
 *
 * Comprehensive testing for migration scenarios, schema changes,
 * and data integrity during database evolution.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFactories } from '@/lib/test-utils/database-factories'
import type { DatabaseConnection } from '@/lib/test-utils/test-database-manager'
import { getTestDatabase } from '@/lib/test-utils/test-database-manager'

describe('Drizzle Migration Testing Suite', () => {
  let testDb: DatabaseConnection
  let factories: ReturnType<typeof createTestFactories>

  beforeEach(async () => {
    // Use a unique test ID for each test to ensure proper isolation
    const testId = `migration-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    testDb = await getTestDatabase(testId, {
      cleanup: 'truncate',
      verbose: false, // Reduce verbosity for cleaner test output
    })

    factories = createTestFactories(testDb.sql)
  })

  afterEach(async () => {
    // Ensure cleanup after each test
    if (testDb) {
      try {
        await testDb.cleanup()
      } catch (error) {
        console.warn('Cleanup error in migration test:', error)
      }
    }
  })

  describe('Schema Evolution Testing', () => {
    it('should test adding new columns safely', async () => {
      const { sql } = testDb

      // Create initial data
      const user = await factories.users.create({
        github_username: 'migration-user',
        email: 'migration@example.com',
      })

      // Simulate adding a new column (nullable)
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS temp_migration_field TEXT
      `

      // Verify existing data is not affected
      const userData = await sql`
        SELECT * FROM users WHERE id = ${user.id}
      `

      expect(userData).toHaveLength(1)
      expect(userData[0]?.email).toBe('migration@example.com')
      expect(userData[0]?.temp_migration_field).toBeNull()

      // Test updating new column
      await sql`
        UPDATE users 
        SET temp_migration_field = 'migrated_value'
        WHERE id = ${user.id}
      `

      const updatedData = await sql`
        SELECT temp_migration_field FROM users WHERE id = ${user.id}
      `

      expect(updatedData[0]?.temp_migration_field).toBe('migrated_value')

      // Cleanup - remove the test column
      await sql`
        ALTER TABLE users 
        DROP COLUMN IF EXISTS temp_migration_field
      `
    })

    it('should test modifying column types safely', async () => {
      const { sql } = testDb

      // Create test table for type modification testing
      await sql`
        CREATE TABLE IF NOT EXISTS migration_test_table (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          test_number INTEGER,
          test_text VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `

      // Insert test data
      await sql`
        INSERT INTO migration_test_table (test_number, test_text)
        VALUES (123, 'test'), (456, 'another test')
      `

      // Verify initial data
      const initialData = await sql`
        SELECT test_number, test_text FROM migration_test_table ORDER BY test_number
      `

      expect(initialData).toHaveLength(2)
      expect(initialData[0]?.test_number).toBe(123)

      // Simulate changing column type (INTEGER to BIGINT)
      await sql`
        ALTER TABLE migration_test_table 
        ALTER COLUMN test_number TYPE BIGINT
      `

      // Verify data integrity after type change
      const afterTypeChange = await sql`
        SELECT test_number, test_text FROM migration_test_table ORDER BY test_number
      `

      expect(afterTypeChange).toHaveLength(2)
      expect(afterTypeChange[0]?.test_number).toBe(123) // Data should be preserved
      expect(typeof afterTypeChange[0]?.test_number).toBe('number')

      // Test with larger number to verify BIGINT capacity
      await sql`
        INSERT INTO migration_test_table (test_number, test_text)
        VALUES (9223372036854775807, 'max bigint')
      `

      const bigintTest = await sql`
        SELECT test_number FROM migration_test_table 
        WHERE test_text = 'max bigint'
      `

      expect(bigintTest[0]?.test_number).toBeDefined()

      // Cleanup
      await sql`DROP TABLE IF EXISTS migration_test_table`
    })

    it('should test adding constraints safely', async () => {
      const { sql } = testDb

      // Create test table
      await sql`
        CREATE TABLE IF NOT EXISTS constraint_test_table (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT,
          status TEXT,
          score INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `

      // Insert valid test data
      await sql`
        INSERT INTO constraint_test_table (email, status, score)
        VALUES 
          ('user1@example.com', 'active', 85),
          ('user2@example.com', 'inactive', 92),
          ('user3@example.com', 'active', 78)
      `

      // Add NOT NULL constraint (should succeed with existing data)
      await sql`
        ALTER TABLE constraint_test_table 
        ALTER COLUMN email SET NOT NULL
      `

      // Add CHECK constraint
      await sql`
        ALTER TABLE constraint_test_table 
        ADD CONSTRAINT score_range CHECK (score >= 0 AND score <= 100)
      `

      // Add UNIQUE constraint
      await sql`
        ALTER TABLE constraint_test_table 
        ADD CONSTRAINT unique_email UNIQUE (email)
      `

      // Test constraints work
      const validData = await sql`
        SELECT COUNT(*) FROM constraint_test_table
      `
      expect(Number(validData[0]?.count)).toBe(3)

      // Test constraint violations
      let constraintViolated = false
      try {
        await sql`
          INSERT INTO constraint_test_table (email, status, score)
          VALUES ('user1@example.com', 'active', 75)
        `
      } catch (_error) {
        constraintViolated = true
      }
      expect(constraintViolated).toBe(true) // Should violate unique constraint

      constraintViolated = false
      try {
        await sql`
          INSERT INTO constraint_test_table (email, status, score)
          VALUES ('user4@example.com', 'active', 150)
        `
      } catch (_error) {
        constraintViolated = true
      }
      expect(constraintViolated).toBe(true) // Should violate check constraint

      // Cleanup
      await sql`DROP TABLE IF EXISTS constraint_test_table`
    })

    it('should test index creation and performance impact', async () => {
      const { sql } = testDb

      // Create test table with data
      await sql`
        CREATE TABLE IF NOT EXISTS index_test_table (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          category TEXT,
          value INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `

      // Insert test data with proper UUID generation
      const testData = Array.from({ length: 100 }, (_, i) => ({
        category: ['A', 'B', 'C'][i % 3],
        value: Math.floor(Math.random() * 1000),
      }))

      for (const data of testData) {
        await sql`
          INSERT INTO index_test_table (user_id, category, value)
          VALUES (gen_random_uuid(), ${data.category}, ${data.value})
        `
      }

      // Benchmark query before index
      const beforeIndex = performance.now()
      const beforeResults = await sql`
        SELECT * FROM index_test_table 
        WHERE category = 'A' AND value > 500
        ORDER BY created_at DESC
        LIMIT 10
      `
      const beforeDuration = performance.now() - beforeIndex

      // Create index
      await sql`
        CREATE INDEX IF NOT EXISTS idx_category_value 
        ON index_test_table (category, value)
      `

      await sql`
        CREATE INDEX IF NOT EXISTS idx_user_id 
        ON index_test_table (user_id)
      `

      // Benchmark query after index
      const afterIndex = performance.now()
      const afterResults = await sql`
        SELECT * FROM index_test_table 
        WHERE category = 'A' AND value > 500
        ORDER BY created_at DESC
        LIMIT 10
      `
      const afterDuration = performance.now() - afterIndex

      expect(beforeResults.length).toBe(afterResults.length)

      // With small dataset, may not see significant improvement
      // but ensure queries still work correctly
      expect(afterResults.length).toBeGreaterThan(0)

      console.log(
        `Index performance: Before ${beforeDuration.toFixed(2)}ms, After ${afterDuration.toFixed(2)}ms`
      )

      // Verify indexes were created
      const indexes = await sql`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'index_test_table'
        AND indexname LIKE 'idx_%'
      `

      expect(indexes.length).toBeGreaterThanOrEqual(2)

      // Cleanup
      await sql`DROP TABLE IF EXISTS index_test_table`
    })
  })

  describe('Data Migration Scenarios', () => {
    it('should test migrating JSONB data structure', async () => {
      const { sql } = testDb

      // Create initial user with old preference structure
      const user = await factories.users.create({
        github_username: 'jsonb-migration-user',
        email: 'jsonb@example.com',
        preferences: {
          theme: 'dark',
          notifications: true, // Old structure
        } as Record<string, unknown>,
      })

      // Simulate data migration - restructure preferences
      await sql`
        UPDATE users 
        SET preferences = jsonb_set(
          preferences,
          '{emailNotifications}',
          preferences->'notifications'
        )
        WHERE id = ${user.id}
      `

      await sql`
        UPDATE users 
        SET preferences = preferences - 'notifications'
        WHERE id = ${user.id}
      `

      // Verify migration
      const migratedUser = await sql`
        SELECT preferences FROM users WHERE id = ${user.id}
      `

      const prefs = migratedUser[0]?.preferences as Record<string, unknown>
      expect(prefs.emailNotifications).toBe(true)
      expect(prefs.notifications).toBeUndefined()
      expect(prefs.theme).toBe('dark')
    })

    it('should test migrating vector embeddings format', async () => {
      const { sql } = testDb

      // Create repository first
      const repo = await factories.repositories.create({
        name: 'vector-migration-repo',
        language: 'JavaScript',
      })

      // Create opportunity with embedding (opportunities table has embeddings, not repositories)
      const opportunity = await factories.opportunities.create({
        repository_id: repo.id,
        title: 'Vector migration test',
        issue_number: 1,
      })

      // Simulate old format - direct array storage
      const oldEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
      await sql`
        UPDATE opportunities 
        SET embedding = ${JSON.stringify(oldEmbedding)}
        WHERE id = ${opportunity.id}
      `

      // Test migration to new format (if needed)
      const beforeMigration = await sql`
        SELECT embedding FROM opportunities WHERE id = ${opportunity.id}
      `

      expect(JSON.parse(beforeMigration[0]?.embedding || '[]')).toEqual(oldEmbedding)

      // Simulate migration - normalize to 1536 dimensions
      await sql`
        UPDATE opportunities 
        SET embedding = ${JSON.stringify(
          Array.from({ length: 1536 }, (_, i) => (i < oldEmbedding.length ? oldEmbedding[i] : 0))
        )}
        WHERE id = ${opportunity.id}
      `

      const afterMigration = await sql`
        SELECT embedding FROM opportunities WHERE id = ${opportunity.id}
      `

      const newEmbedding = JSON.parse(afterMigration[0]?.embedding)
      expect(newEmbedding).toHaveLength(1536)
      expect(newEmbedding[0]).toBe(0.1)
      expect(newEmbedding[4]).toBe(0.5)
      expect(newEmbedding[1535]).toBe(0) // Padded values
    })

    it('should test batch data migration performance', async () => {
      const { sql } = testDb

      // Create large dataset for migration testing
      const batchSize = 100
      const users = await Promise.all(
        Array.from({ length: batchSize }, (_, i) =>
          factories.users.create({
            github_username: `batch-user-${i}`,
            email: `batch-${i}@example.com`,
            preferences: {
              theme: 'light',
              oldSetting: `value-${i}`, // Old setting to migrate
            } as Record<string, unknown>,
          })
        )
      )

      expect(users).toHaveLength(batchSize)

      // Test batch migration performance
      const start = performance.now()

      // Migrate in batches to avoid memory issues
      const userIds = users.map(u => u.id)
      const chunkSize = 25

      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize)

        await sql`
          UPDATE users 
          SET preferences = jsonb_set(
            preferences - 'oldSetting',
            '{newSetting}',
            preferences->'oldSetting'
          )
          WHERE id = ANY(${chunk})
        `
      }

      const duration = performance.now() - start

      // Verify migration completed
      const migratedCount = await sql`
        SELECT COUNT(*) FROM users 
        WHERE preferences->>'newSetting' IS NOT NULL
        AND preferences ? 'oldSetting' = false
      `

      expect(Number(migratedCount[0]?.count)).toBe(batchSize)
      expect(duration).toBeLessThan(5000) // Should complete in reasonable time

      console.log(`Batch migration (${batchSize} records): ${duration.toFixed(2)}ms`)
    })
  })

  describe('Migration Rollback Testing', () => {
    it('should test migration rollback procedures', async () => {
      if (testDb.strategy === 'pglite') {
        // PGlite has limited transaction support
        expect(true).toBe(true)
        return
      }

      const { sql } = testDb

      await sql`BEGIN`

      try {
        // Create backup data
        const _originalUsers = await sql`
          SELECT id, preferences FROM users LIMIT 5
        `

        // Perform "migration"
        await sql`
          UPDATE users 
          SET preferences = jsonb_set(
            preferences,
            '{migratedField}',
            '"migrated_value"'
          )
        `

        // Verify migration
        const afterMigration = await sql`
          SELECT preferences FROM users 
          WHERE preferences ? 'migratedField'
        `

        expect(afterMigration.length).toBeGreaterThan(0)

        // Simulate rollback
        await sql`ROLLBACK`

        // Verify rollback - changes should be undone
        const afterRollback = await sql`
          SELECT preferences FROM users 
          WHERE preferences ? 'migratedField'
        `

        expect(afterRollback).toHaveLength(0)
      } catch (error) {
        await sql`ROLLBACK`
        throw error
      }
    })

    it('should test migration failure handling', async () => {
      const { sql } = testDb

      // Test handling of failed migration
      let migrationFailed = false

      try {
        // Attempt invalid migration
        await sql`
          ALTER TABLE users 
          ADD CONSTRAINT invalid_constraint 
          CHECK (invalid_column > 0)
        `
      } catch (error) {
        migrationFailed = true
        expect(error).toBeDefined()
      }

      expect(migrationFailed).toBe(true)

      // Verify database is still in consistent state
      const tableInfo = await sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users'
      `

      expect(tableInfo.length).toBeGreaterThan(0) // Table should still exist
    })

    it('should test partial migration recovery', async () => {
      const { sql } = testDb

      // Create test scenario where migration partially succeeds
      await sql`
        CREATE TABLE IF NOT EXISTS partial_migration_test (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          data TEXT,
          migrated BOOLEAN DEFAULT FALSE
        )
      `

      // Insert test data
      await sql`
        INSERT INTO partial_migration_test (data)
        VALUES ('record1'), ('record2'), ('record3'), ('record4'), ('record5')
      `

      // Simulate partial migration - only migrate some records
      await sql`
        UPDATE partial_migration_test 
        SET migrated = TRUE, data = data || '_migrated'
        WHERE id IN (
          SELECT id FROM partial_migration_test LIMIT 3
        )
      `

      // Check migration status
      const migrationStatus = await sql`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE migrated = TRUE) as migrated_count,
          COUNT(*) FILTER (WHERE migrated = FALSE) as pending_count
        FROM partial_migration_test
      `

      const status = migrationStatus[0]
      expect(Number(status?.total)).toBe(5)
      expect(Number(status?.migrated_count)).toBe(3)
      expect(Number(status?.pending_count)).toBe(2)

      // Complete the migration
      await sql`
        UPDATE partial_migration_test 
        SET migrated = TRUE, data = data || '_migrated'
        WHERE migrated = FALSE
      `

      // Verify completion
      const finalStatus = await sql`
        SELECT COUNT(*) as migrated FROM partial_migration_test WHERE migrated = TRUE
      `

      expect(Number(finalStatus[0]?.migrated)).toBe(5)

      // Cleanup
      await sql`DROP TABLE IF EXISTS partial_migration_test`
    })
  })

  describe('Schema Validation and Constraints', () => {
    it('should validate foreign key constraint enforcement', async () => {
      const { sql } = testDb

      // Create valid relationship
      const _user = await factories.users.create({
        github_username: 'fk-test-user',
        email: 'fk@example.com',
      })

      const repo = await factories.repositories.create({
        name: 'fk-test-repo',
        language: 'Go',
      })

      // Create valid opportunity (uses foreign key to repositories)
      await sql`
        INSERT INTO opportunities (repository_id, issue_number, title, description, difficulty, estimated_hours)
        VALUES (${repo.id}, 123, 'Test opportunity', 'Test description', 'beginner', 2)
      `

      // Test foreign key constraint violation with invalid repository ID
      let fkViolated = false
      try {
        await sql`
          INSERT INTO opportunities (repository_id, issue_number, title, description, difficulty, estimated_hours)
          VALUES (gen_random_uuid(), 124, 'Invalid opportunity', 'Test description', 'beginner', 2)
        `
      } catch (_error) {
        fkViolated = true
      }

      expect(fkViolated).toBe(true)

      // Test cascade behavior if implemented
      const opportunitiesBefore = await sql`
        SELECT COUNT(*) FROM opportunities WHERE repository_id = ${repo.id}
      `

      expect(Number(opportunitiesBefore[0]?.count)).toBe(1)
    })

    it('should test unique constraint handling', async () => {
      const { sql } = testDb

      // Create user with unique GitHub ID
      await factories.users.create({
        github_username: 'unique-test-1',
        email: 'unique1@example.com',
      })

      // Test unique constraint on github_id
      let uniqueViolated = false
      try {
        await sql`
          INSERT INTO users (github_id, username, email)
          VALUES (
            (SELECT github_id FROM users WHERE email = 'unique1@example.com'),
            'unique-test-2',
            'unique2@example.com'
          )
        `
      } catch (_error) {
        uniqueViolated = true
      }

      expect(uniqueViolated).toBe(true)

      // Test unique constraint on email
      uniqueViolated = false
      try {
        await sql`
          INSERT INTO users (github_id, username, email)
          VALUES (99999, 'unique-test-3', 'unique1@example.com')
        `
      } catch (_error) {
        uniqueViolated = true
      }

      expect(uniqueViolated).toBe(true)
    })

    it('should test JSONB schema validation patterns', async () => {
      const { sql } = testDb

      // Test valid JSONB structures (using only existing columns)
      const validUser = await factories.users.create({
        github_username: 'jsonb-validation-user',
        email: 'jsonb-validation@example.com',
        preferences: {
          theme: 'dark',
          emailNotifications: true,
          topicPreferences: ['javascript', 'typescript'],
          difficultyPreference: 'intermediate',
        },
      })

      // Test JSONB queries and validation
      const jsonbQueries = await sql`
        SELECT 
          preferences->'theme' as theme,
          preferences->'topicPreferences' as topics,
          preferences->'difficultyPreference' as difficulty,
          preferences ? 'emailNotifications' as has_email_prefs
        FROM users 
        WHERE id = ${validUser.id}
      `

      const result = jsonbQueries[0]
      expect(result?.theme).toBe('dark') // Actual string value
      expect(result?.has_email_prefs).toBe(true)
      expect(result?.difficulty).toBe('intermediate')

      // Test JSONB array operations
      const arrayQueries = await sql`
        SELECT 
          jsonb_array_length(preferences->'topicPreferences') as topic_count,
          preferences->'topicPreferences' ? 'javascript' as has_js
        FROM users 
        WHERE id = ${validUser.id}
      `

      expect(Number(arrayQueries[0]?.topic_count)).toBe(2)
      expect(arrayQueries[0]?.has_js).toBe(true)
    })
  })
})
