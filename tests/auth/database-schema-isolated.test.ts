import { Client } from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DatabaseColumn, DatabaseTable, SQLFunction } from '../../src/types/database'

// This test is isolated from global setup to avoid any mocking interference
// Database URL should be set in environment variables
const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

describe('Authentication Database Schema (Isolated)', () => {
  let sql: SQLFunction

  beforeAll(async () => {
    if (!DATABASE_URL_TEST) {
      throw new Error('DATABASE_URL_TEST must be set in environment for this test')
    }

    // For local databases, use pg client
    if (DATABASE_URL_TEST.includes('localhost') || DATABASE_URL_TEST.includes('127.0.0.1')) {
      const client = new Client({ connectionString: DATABASE_URL_TEST })
      await client.connect()

      sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join('$')
        const result = await client.query(query, values)
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
          command: result.command,
          oid: result.oid,
          fields: result.fields?.map(field => ({
            name: field.name,
            tableID: field.tableID,
            columnID: field.columnID,
            dataTypeID: field.dataTypeID,
            dataTypeSize: field.dataTypeSize,
            dataTypeModifier: field.dataTypeModifier,
            format: field.format === 'text' ? ('text' as const) : ('binary' as const),
          })),
        }
      }

      // Store client for cleanup
      Object.assign(sql, { client })
    } else {
      // Dynamic import to avoid setup file interference
      const { neon } = await import('@neondatabase/serverless')
      const neonSql = neon(DATABASE_URL_TEST)

      sql = async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => {
        const rows = await neonSql(strings, ...values)
        return {
          rows: rows as readonly T[],
          rowCount: rows.length,
        }
      }
    }

    // Simple connection test
    try {
      const result = await sql`SELECT 1 as test`
      expect(Array.isArray(result.rows)).toBe(true)
      expect(result.rows).toHaveLength(1)
    } catch (error) {
      throw new Error(`Failed to connect to test database: ${error}`)
    }
  })

  describe('WebAuthn Tables', () => {
    it('should have webauthn_credentials table', async () => {
      const result = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      `

      expect(Array.isArray(result.rows)).toBe(true)
      expect(result.rows).toHaveLength(1)
      expect((result.rows as DatabaseTable[])[0]?.tableName).toBe('webauthn_credentials')
    })

    it('should have correct webauthn_credentials columns', async () => {
      const result = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials'
        ORDER BY ordinal_position
      `

      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'credential_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'public_key', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'counter', data_type: 'bigint', is_nullable: 'NO' },
        { column_name: 'credential_device_type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'credential_backed_up', data_type: 'boolean', is_nullable: 'NO' },
        { column_name: 'transports', data_type: 'ARRAY', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }, // Has DEFAULT NOW()
        { column_name: 'last_used_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'name', data_type: 'text', is_nullable: 'YES' },
      ]

      expect(Array.isArray(result.rows)).toBe(true)
      expect((result.rows as DatabaseColumn[]).length).toBeGreaterThanOrEqual(
        expectedColumns.length
      )

      expectedColumns.forEach(expected => {
        const column = (result.rows as DatabaseColumn[]).find(
          (c: DatabaseColumn) => c.columnName === expected.column_name
        )
        expect(column).toBeDefined()
        if (column) {
          expect(column.dataType).toContain(expected.data_type)
          expect(column.isNullable).toBe(expected.is_nullable)
        }
      })
    })
  })

  describe('Authentication Challenges Table', () => {
    it('should have auth_challenges table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'auth_challenges'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('auth_challenges')
    })
  })

  describe('Sessions Table', () => {
    it('should have user_sessions table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_sessions'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('user_sessions')
    })
  })

  describe('OAuth Accounts Table', () => {
    it('should have oauth_accounts table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'oauth_accounts'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('oauth_accounts')
    })
  })

  describe('Audit Logs Table', () => {
    it('should have security_audit_logs table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'security_audit_logs'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('security_audit_logs')
    })
  })

  describe('User Consent Table', () => {
    it('should have user_consents table for GDPR', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_consents'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('user_consents')
    })
  })

  describe('Refresh Tokens Table', () => {
    it('should have refresh_tokens table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'refresh_tokens'
      `

      expect(Array.isArray(tables.rows)).toBe(true)
      expect(tables.rows).toHaveLength(1)
      expect((tables.rows as DatabaseTable[])[0]?.tableName).toBe('refresh_tokens')
    })
  })

  describe('Foreign Key Relationships', () => {
    it('should have foreign key from webauthn_credentials to users', async () => {
      const fks = await sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'webauthn_credentials'
        AND constraint_type = 'FOREIGN KEY'
      `

      expect(Array.isArray(fks.rows)).toBe(true)
      expect((fks.rows as unknown[]).length).toBeGreaterThan(0)
    })

    it('should have foreign key from oauth_accounts to users', async () => {
      const fks = await sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'oauth_accounts'
        AND constraint_type = 'FOREIGN KEY'
      `

      expect(Array.isArray(fks.rows)).toBe(true)
      expect((fks.rows as unknown[]).length).toBeGreaterThan(0)
    })
  })
})
