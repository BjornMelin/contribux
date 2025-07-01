/**
 * Database Migration Tests
 *
 * Tests for database migration execution and validation including:
 * - Migration execution validation
 * - Schema version consistency
 * - Rollback capability testing (where supported)
 * - Data integrity during migration
 * - WebAuthn migration specific tests
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sql } from '../../unit/database/db-client'

// TypeScript interfaces for database query results
interface DatabaseColumn {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface DatabaseConstraint {
  constraint_name: string
  constraint_type: string
  column_name: string
  check_clause?: string
}

interface DatabaseIndex {
  indexname: string
  indexdef: string
}

interface DatabaseComment {
  column_name: string
  comment: string
}

describe('Database Migration Tests', () => {
  describe('Migration File Validation', () => {
    it('should have valid WebAuthn migration file', () => {
      const migrationPath = join(process.cwd(), 'drizzle', '0007_add_webauthn_credentials.sql')

      expect(() => {
        const migrationContent = readFileSync(migrationPath, 'utf-8')
        expect(migrationContent).toContain('CREATE TABLE IF NOT EXISTS webauthn_credentials')
        expect(migrationContent).toContain(
          'user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE'
        )
        expect(migrationContent).toContain('credential_id TEXT NOT NULL UNIQUE')
        expect(migrationContent).toContain('public_key BYTEA NOT NULL')
        expect(migrationContent).toContain('counter BIGINT NOT NULL DEFAULT 0')
      }).not.toThrow()
    })

    it('should have proper SQL syntax in migration file', () => {
      const migrationPath = join(process.cwd(), 'drizzle', '0007_add_webauthn_credentials.sql')
      const migrationContent = readFileSync(migrationPath, 'utf-8')

      // Check for proper SQL termination
      const statements = migrationContent.split(';').filter(stmt => stmt.trim().length > 0)
      expect(statements.length).toBeGreaterThan(0)

      // Check for required elements
      expect(migrationContent).toContain('CREATE TABLE')
      expect(migrationContent).toContain('CREATE INDEX')
      expect(migrationContent).toContain('CONSTRAINT')
      expect(migrationContent).toContain('COMMENT ON')
    })
  })

  describe('Migration Execution', () => {
    it('should verify WebAuthn table exists after migration', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      `

      expect(tables).toHaveLength(1)
      expect(tables[0].table_name).toBe('webauthn_credentials')
    })

    it('should verify all required columns exist', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `

      const requiredColumns = [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false },
        { name: 'credential_id', type: 'text', nullable: false },
        { name: 'public_key', type: 'bytea', nullable: false },
        { name: 'counter', type: 'bigint', nullable: false },
        { name: 'device_name', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamp with time zone', nullable: true },
        { name: 'last_used_at', type: 'timestamp with time zone', nullable: true },
      ]

      expect(columns.length).toBe(requiredColumns.length)

      for (const requiredCol of requiredColumns) {
        const column = columns.find((col: DatabaseColumn) => col.column_name === requiredCol.name)
        expect(column, `Column ${requiredCol.name} should exist`).toBeDefined()
        expect(column.data_type).toBe(requiredCol.type)
        expect(column.is_nullable).toBe(requiredCol.nullable ? 'YES' : 'NO')
      }
    })

    it('should verify foreign key constraints are created', async () => {
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
      expect(foreignKeys[0].column_name).toBe('user_id')
      expect(foreignKeys[0].foreign_table_name).toBe('users')
      expect(foreignKeys[0].foreign_column_name).toBe('id')
      expect(foreignKeys[0].delete_rule).toBe('CASCADE')
    })

    it('should verify unique constraints are created', async () => {
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

      expect(uniqueConstraints.length).toBeGreaterThanOrEqual(2)

      // Should have unique constraint on credential_id
      const credentialIdUnique = uniqueConstraints.find(
        (c: DatabaseConstraint) => c.column_name === 'credential_id'
      )
      expect(credentialIdUnique).toBeDefined()

      // Should have composite unique constraint
      const compositeConstraints = uniqueConstraints.filter(
        (c: DatabaseConstraint) =>
          c.constraint_name.includes('user_id') && c.constraint_name.includes('credential_id')
      )
      expect(compositeConstraints.length).toBeGreaterThanOrEqual(1)
    })

    it('should verify indexes are created', async () => {
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

      // Should have index on user_id
      expect(indexNames.some((name: string) => name.includes('user_id'))).toBe(true)

      // Should have index on credential_id
      expect(indexNames.some((name: string) => name.includes('credential_id'))).toBe(true)
    })

    it('should verify check constraints are created', async () => {
      const checkConstraints = await sql`
        SELECT 
          constraint_name,
          check_clause
        FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
        AND constraint_name LIKE '%webauthn%' OR constraint_name LIKE '%counter%'
      `

      expect(checkConstraints.length).toBeGreaterThan(0)

      // Should have counter positive check
      const counterCheck = checkConstraints.find(
        (c: DatabaseConstraint) =>
          c.check_clause?.includes('counter') && c.check_clause.includes('>=')
      )
      expect(counterCheck).toBeDefined()
    })

    it('should verify table comments are created', async () => {
      const tableComments = await sql`
        SELECT 
          obj_description(c.oid) as comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'webauthn_credentials'
        AND n.nspname = 'public'
      `

      expect(tableComments).toHaveLength(1)
      expect(tableComments[0].comment).toContain('WebAuthn')
      expect(tableComments[0].comment).toContain('passwordless authentication')
    })

    it('should verify column comments are created', async () => {
      const columnComments = await sql`
        SELECT 
          a.attname as column_name,
          col_description(a.attrelid, a.attnum) as comment
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = 'webauthn_credentials'
        AND n.nspname = 'public'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND col_description(a.attrelid, a.attnum) IS NOT NULL
        ORDER BY a.attnum
      `

      expect(columnComments.length).toBeGreaterThanOrEqual(3)

      const commentsByColumn = columnComments.reduce(
        (acc: Record<string, string>, row: DatabaseComment) => {
          acc[row.column_name] = row.comment
          return acc
        },
        {}
      )

      expect(commentsByColumn.credential_id).toContain('Base64url-encoded')
      expect(commentsByColumn.public_key).toContain('public key')
      expect(commentsByColumn.counter).toContain('counter')
    })
  })

  describe('Data Integrity During Migration', () => {
    it('should allow inserting valid data after migration', async () => {
      // Create test user first
      const testUser = await sql`
        INSERT INTO users (github_id, username, email)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'migration_test_user', 'migration@test.example')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Insert WebAuthn credential
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
            'migration_test_credential', 
            ${`\\x${Buffer.from('test_public_key_data').toString('hex')}`}, 
            0, 
            'Migration Test Device'
          )
          RETURNING id, user_id, credential_id, counter, device_name, created_at
        `

        expect(credential).toHaveLength(1)
        expect(credential[0].user_id).toBe(userId)
        expect(credential[0].credential_id).toBe('migration_test_credential')
        expect(Number(credential[0].counter)).toBe(0)
        expect(credential[0].device_name).toBe('Migration Test Device')
        expect(credential[0].created_at).toBeDefined()
      } finally {
        // Cleanup
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should enforce constraints after migration', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'constraint_test_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Should fail with negative counter
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, 'negative_counter_test', ${'\\x1234'}, -1)
          `
        ).rejects.toThrow()

        // Should fail with empty credential_id
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, '', ${'\\x1234'}, 0)
          `
        ).rejects.toThrow()

        // Should fail with NULL public_key
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, 'null_pubkey_test', NULL, 0)
          `
        ).rejects.toThrow()
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should enforce foreign key constraints after migration', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'

      // Should fail with non-existent user_id
      await expect(
        sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${nonExistentUserId}, 'fk_test_credential', ${'\\x1234'}, 0)
        `
      ).rejects.toThrow()
    })

    it('should enforce unique constraints after migration', async () => {
      const testUsers = await sql`
        INSERT INTO users (github_id, username)
        VALUES 
          (${Math.floor(Math.random() * 1000000)}, 'unique_test_user_1'),
          (${Math.floor(Math.random() * 1000000)}, 'unique_test_user_2')
        RETURNING id
      `
      const user1Id = testUsers[0].id
      const user2Id = testUsers[1].id

      try {
        // Insert first credential
        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${user1Id}, 'unique_test_credential', ${'\\x1234'}, 0)
        `

        // Should fail with duplicate credential_id
        await expect(
          sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${user2Id}, 'unique_test_credential', ${'\\x5678'}, 0)
          `
        ).rejects.toThrow()
      } finally {
        await sql`DELETE FROM users WHERE id IN (${user1Id}, ${user2Id})`
      }
    })
  })

  describe('Schema Version Consistency', () => {
    it('should have consistent schema with Drizzle definitions', async () => {
      // This test verifies the database schema matches our TypeScript definitions

      // Check table exists
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'webauthn_credentials'
        ) as exists
      `
      expect(tableExists[0].exists).toBe(true)

      // Check column types match expected Drizzle types
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `

      const expectedSchema = {
        id: { type: 'uuid', nullable: false },
        user_id: { type: 'uuid', nullable: false },
        credential_id: { type: 'text', nullable: false },
        public_key: { type: 'bytea', nullable: false },
        counter: { type: 'bigint', nullable: false },
        device_name: { type: 'text', nullable: true },
        created_at: { type: 'timestamp with time zone', nullable: true },
        last_used_at: { type: 'timestamp with time zone', nullable: true },
      }

      for (const [columnName, expected] of Object.entries(expectedSchema)) {
        const column = columns.find((col: DatabaseColumn) => col.column_name === columnName)
        expect(column, `Column ${columnName} should exist`).toBeDefined()
        expect(column.data_type).toBe(expected.type)
        expect(column.is_nullable).toBe(expected.nullable ? 'YES' : 'NO')
      }
    })

    it('should have proper relationship with users table', async () => {
      // Verify the relationship works by creating and querying
      const testUser = await sql`
        INSERT INTO users (github_id, username, email)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'relationship_test_user', 'rel@test.example')
        RETURNING id, username
      `
      const userId = testUser[0].id

      try {
        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, 'relationship_test_cred', ${'\\x1234'}, 0)
        `

        // Test join query
        const joinResult = await sql`
          SELECT u.username, c.credential_id
          FROM users u
          JOIN webauthn_credentials c ON u.id = c.user_id
          WHERE u.id = ${userId}
        `

        expect(joinResult).toHaveLength(1)
        expect(joinResult[0].username).toBe('relationship_test_user')
        expect(joinResult[0].credential_id).toBe('relationship_test_cred')
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })

  describe('Performance After Migration', () => {
    it('should have efficient queries after migration', async () => {
      // Create test data
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'performance_test_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        // Insert multiple credentials
        for (let i = 0; i < 10; i++) {
          await sql`
            INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
            VALUES (${userId}, ${`perf_cred_${i}_${Date.now()}`}, ${`\\x${i.toString(16).padStart(4, '0')}`}, ${i})
          `
        }

        // Test query performance
        const startTime = Date.now()

        const credentials = await sql`
          SELECT * FROM webauthn_credentials WHERE user_id = ${userId}
        `

        const queryTime = Date.now() - startTime

        expect(credentials).toHaveLength(10)
        expect(queryTime).toBeLessThan(100) // Should be fast with proper indexes
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })

    it('should support efficient credential lookup by credential_id', async () => {
      const testUser = await sql`
        INSERT INTO users (github_id, username)
        VALUES (${Math.floor(Math.random() * 1000000)}, 'lookup_test_user')
        RETURNING id
      `
      const userId = testUser[0].id

      try {
        const credentialId = `lookup_test_${Date.now()}`

        await sql`
          INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
          VALUES (${userId}, ${credentialId}, ${'\\x1234'}, 0)
        `

        const startTime = Date.now()

        const credential = await sql`
          SELECT * FROM webauthn_credentials WHERE credential_id = ${credentialId}
        `

        const queryTime = Date.now() - startTime

        expect(credential).toHaveLength(1)
        expect(queryTime).toBeLessThan(50) // Should be very fast with unique index
      } finally {
        await sql`DELETE FROM users WHERE id = ${userId}`
      }
    })
  })
})
