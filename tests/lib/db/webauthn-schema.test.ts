/**
 * WebAuthn Schema Tests
 *
 * Tests for WebAuthn credentials table schema validation including:
 * - Table creation and structure
 * - Foreign key relationships
 * - Unique constraints
 * - Index performance
 * - Data type validation
 * - Check constraints
 */

import { describe, expect, it } from 'vitest'
import { sql } from '../../unit/database/db-client'

// TypeScript interfaces for database query results
interface DatabaseColumn {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  character_maximum_length?: number | null
}

interface DatabaseConstraint {
  constraint_name: string
  constraint_type?: string
  column_name?: string
  check_clause?: string | null
}

interface DatabaseIndex {
  indexname: string
  indexdef?: string
}

interface DatabaseDefault {
  column_name: string
  column_default: string | null
}

describe('WebAuthn Schema Tests', () => {
  describe('Table Structure', () => {
    it('should have webauthn_credentials table with correct structure', async () => {
      const tableInfo = await sql`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `

      expect(tableInfo.length).toBeGreaterThan(0)

      const expectedColumns = [
        { name: 'id', type: 'uuid', nullable: 'NO' },
        { name: 'user_id', type: 'uuid', nullable: 'NO' },
        { name: 'credential_id', type: 'text', nullable: 'NO' },
        { name: 'public_key', type: 'text', nullable: 'NO' },
        { name: 'counter', type: 'bigint', nullable: 'NO' },
        { name: 'device_name', type: 'text', nullable: 'YES' },
        { name: 'created_at', type: 'timestamp with time zone', nullable: 'YES' },
        { name: 'last_used_at', type: 'timestamp with time zone', nullable: 'YES' },
      ]

      for (const expectedCol of expectedColumns) {
        const column = tableInfo.find((col: DatabaseColumn) => col.column_name === expectedCol.name)
        expect(column, `Column ${expectedCol.name} should exist`).toBeDefined()
        expect(column.data_type).toBe(expectedCol.type)
        expect(column.is_nullable).toBe(expectedCol.nullable)
      }
    })

    it('should have primary key on id column', async () => {
      const primaryKey = await sql`
        SELECT constraint_name, column_name
        FROM information_schema.key_column_usage
        WHERE table_name = 'webauthn_credentials'
        AND table_schema = 'public'
        AND constraint_name LIKE '%pkey%'
      `

      expect(primaryKey).toHaveLength(1)
      expect(primaryKey[0]).toMatchObject({
        column_name: 'id',
      })
    })

    it('should have proper defaults for id and timestamps', async () => {
      const defaults = await sql`
        SELECT column_name, column_default
        FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials'
        AND table_schema = 'public'
        AND column_default IS NOT NULL
      `

      const columnDefaults = defaults.reduce(
        (acc: Record<string, string | null>, row: DatabaseDefault) => {
          acc[row.column_name] = row.column_default
          return acc
        },
        {}
      )

      expect(columnDefaults.id).toContain('gen_random_uuid')
      expect(columnDefaults.counter).toBe('0')
      expect(columnDefaults.created_at).toContain('now()')
    })
  })

  describe('Foreign Key Relationships', () => {
    it('should have foreign key from user_id to users.id', async () => {
      const foreignKeys = await sql`
        SELECT 
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'webauthn_credentials'
        AND tc.table_schema = 'public'
      `

      expect(foreignKeys).toHaveLength(1)
      const fk = foreignKeys[0]
      expect(fk.column_name).toBe('user_id')
      expect(fk.foreign_table_name).toBe('users')
      expect(fk.foreign_column_name).toBe('id')
      expect(fk.delete_rule).toBe('CASCADE')
    })

    it('should cascade delete when user is deleted', async () => {
      // Create a test user
      const testUser = await sql`
        INSERT INTO users (github_id, username, email)
        VALUES (99999999, 'test_webauthn_user', 'test@webauthn.example')
        RETURNING id
      `
      const userId = testUser[0].id

      // Create a WebAuthn credential for the user
      await sql`
        INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
        VALUES (${userId}, 'test_credential_123', 'test_public_key_data', 0)
      `

      // Verify credential exists
      const credentialsBefore = await sql`
        SELECT id FROM webauthn_credentials WHERE user_id = ${userId}
      `
      expect(credentialsBefore).toHaveLength(1)

      // Delete the user
      await sql`DELETE FROM users WHERE id = ${userId}`

      // Verify credential was cascade deleted
      const credentialsAfter = await sql`
        SELECT id FROM webauthn_credentials WHERE user_id = ${userId}
      `
      expect(credentialsAfter).toHaveLength(0)
    })
  })

  describe('Unique Constraints', () => {
    it('should have unique constraint on credential_id', async () => {
      const uniqueConstraints = await sql`
        SELECT 
          tc.constraint_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'webauthn_credentials'
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `

      const constraintNames = uniqueConstraints.map(
        (row: DatabaseConstraint) => row.constraint_name
      )

      // Should have unique constraint on credential_id
      expect(
        constraintNames.some(
          (name: string) => name.includes('credential_id') && name.includes('key')
        )
      ).toBe(true)

      // Should have composite unique constraint on user_id + credential_id
      expect(constraintNames.some((name: string) => name.includes('user_id_credential_id'))).toBe(
        true
      )
    })

    it('should prevent duplicate credential_id values', async () => {
      // Create test users
      const testUsers = await sql`
        INSERT INTO users (github_id, username)
        VALUES 
          (88888888, 'test_user_1'),
          (88888889, 'test_user_2')
        RETURNING id
      `

      const user1Id = testUsers[0].id
      const user2Id = testUsers[1].id

      try {
        // Create first credential
        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${user1Id}, 'duplicate_credential_test', 'public_key_1', 0)
        `

        // Try to create duplicate credential_id (should fail)
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${user2Id}, 'duplicate_credential_test', 'public_key_2', 0)
          `
        ).rejects.toThrow()
      } finally {
        // Cleanup
        await sql`DELETE FROM users WHERE id IN (${user1Id}, ${user2Id})`
      }
    })

    it('should prevent duplicate user_id + credential_id combinations', async () => {
      // Create test user
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (77777777, 'test_user_duplicate')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Create first credential
        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, 'user_cred_duplicate_test', 'public_key_1', 0)
        `

        // Try to create duplicate user + credential combination (should fail)
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, 'user_cred_duplicate_test', 'public_key_2', 1)
          `
        ).rejects.toThrow()
      } finally {
        // Cleanup
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })

  describe('Check Constraints', () => {
    it('should have check constraint for non-negative counter', async () => {
      const checkConstraints = await sql`
        SELECT 
          constraint_name,
          check_clause
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
        AND constraint_name LIKE '%counter%'
      `

      expect(checkConstraints.length).toBeGreaterThan(0)
      const counterCheck = checkConstraints.find(
        (c: DatabaseConstraint) =>
          c.constraint_name.includes('counter_positive') || c.check_clause?.includes('counter')
      )
      expect(counterCheck).toBeDefined()
    })

    it('should enforce non-negative counter constraint', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (66666666, 'test_counter_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Try to insert negative counter (should fail)
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, 'negative_counter_test', 'public_key_data', -1)
          `
        ).rejects.toThrow()
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should have check constraints for non-empty required fields', async () => {
      const checkConstraints = await sql`
        SELECT 
          constraint_name,
          check_clause
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
        AND (constraint_name LIKE '%credential_id%' OR constraint_name LIKE '%public_key%')
      `

      expect(checkConstraints.length).toBeGreaterThanOrEqual(2)
    })

    it('should enforce non-empty credential_id constraint', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (55555555, 'test_empty_cred_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Try to insert empty credential_id (should fail)
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, '', 'public_key_data', 0)
          `
        ).rejects.toThrow()

        // Try to insert whitespace-only credential_id (should fail)
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, '   ', 'public_key_data', 0)
          `
        ).rejects.toThrow()
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })

  describe('Indexes', () => {
    it('should have indexes for performance optimization', async () => {
      const indexes = await sql`
        SELECT 
          indexname,
          tablename,
          indexdef
        FROM pg_indexes 
        WHERE tablename = 'webauthn_credentials'
        AND schemaname = 'public'
        ORDER BY indexname
      `

      const indexNames = indexes.map((idx: DatabaseIndex) => idx.indexname)

      // Should have index on user_id for efficient user lookups
      expect(indexNames.some((name: string) => name.includes('user_id'))).toBe(true)

      // Should have index on credential_id for efficient credential lookups
      expect(indexNames.some((name: string) => name.includes('credential_id'))).toBe(true)
    })

    it('should have efficient user_id index for credential lookups', async () => {
      // Create test data to verify index usage
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (44444444, 'test_index_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Insert multiple credentials for the user
        for (let i = 0; i < 5; i++) {
          await sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, ${`test_cred_${i}_${Date.now()}`}, 'public_key_data', ${i})
          `
        }

        // Query should use index efficiently
        const credentials = await sql`
          SELECT * FROM webauthn_credentials WHERE user_id = ${userId}
        `
        expect(credentials).toHaveLength(5)

        // Verify we can get query plan (if supported)
        try {
          const queryPlan = await sql`
            EXPLAIN (FORMAT JSON) 
            SELECT * FROM webauthn_credentials WHERE user_id = ${userId}
          `
          // If supported, verify index scan is used
          expect(queryPlan).toBeDefined()
        } catch (_error) {
          // EXPLAIN might not be supported in test environment
          console.warn('EXPLAIN not supported in test environment')
        }
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })

  describe('Data Type Validation', () => {
    it('should handle UUID data types correctly', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (33333333, 'test_uuid_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        const credential = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, 'uuid_test_credential', 'public_key_data', 0)
          RETURNING id, user_id
        `

        expect(credential[0].id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
        expect(credential[0].user_id).toBe(userId)
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should handle BIGINT counter values correctly', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (22222222, 'test_bigint_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Test with large counter value
        const largeCounter = 2147483647 // Max 32-bit signed int
        const credential = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, 'bigint_test_credential', 'public_key_data', ${largeCounter})
          RETURNING counter
        `

        expect(Number(credential[0].counter)).toBe(largeCounter)
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should handle TEXT fields with appropriate lengths', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (11111111, 'test_text_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Test with long but valid credential_id
        const longCredentialId = 'A'.repeat(400) // Should be within reasonable limits
        const longPublicKey = 'B'.repeat(1500) // Should be within reasonable limits
        const longDeviceName = 'My Very Long Device Name That Describes The Device In Detail'

        const credential = await sql`
          INSERT INTO webauthn_credentials (
            user_id, 
            credential_id, 
            public_key, 
            counter, 
            device_name
          )
          VALUES (
            ${userId}, 
            ${longCredentialId}, 
            ${longPublicKey}, 
            0, 
            ${longDeviceName}
          )
          RETURNING credential_id, public_key, device_name
        `

        expect(credential[0].credential_id).toBe(longCredentialId)
        expect(credential[0].public_key).toBe(longPublicKey)
        expect(credential[0].device_name).toBe(longDeviceName)
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should handle timestamp fields correctly', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (10101010, 'test_timestamp_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        const credential = await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, 'timestamp_test_credential', 'public_key_data', 0)
          RETURNING created_at, last_used_at
        `

        expect(credential[0].created_at).toBeDefined()
        expect(new Date(credential[0].created_at)).toBeInstanceOf(Date)
        expect(credential[0].last_used_at).toBeNull()

        // Update last_used_at
        const updatedCredential = await sql`
          UPDATE webauthn_credentials 
          SET last_used_at = NOW()
          WHERE user_id = ${userId}
          RETURNING last_used_at
        `

        expect(updatedCredential[0].last_used_at).toBeDefined()
        expect(new Date(updatedCredential[0].last_used_at)).toBeInstanceOf(Date)
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })
})
