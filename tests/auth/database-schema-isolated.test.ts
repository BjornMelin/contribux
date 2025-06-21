import { describe, it, expect, beforeAll } from 'vitest'

// This test is isolated from global setup to avoid any mocking interference
// Database URL should be set in environment variables
const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST

describe('Authentication Database Schema (Isolated)', () => {
  let sql: any

  beforeAll(async () => {
    if (!DATABASE_URL_TEST) {
      throw new Error('DATABASE_URL_TEST must be set in environment for this test')
    }
    
    // Dynamic import to avoid setup file interference
    const { neon } = await import('@neondatabase/serverless')
    sql = neon(DATABASE_URL_TEST)
    
    // Simple connection test
    try {
      const result = await sql`SELECT 1 as test`
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
    } catch (error) {
      throw new Error(`Failed to connect to test database: ${error}`)
    }
  })

  describe('WebAuthn Tables', () => {
    it('should have webauthn_credentials table', async () => {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      `
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('webauthn_credentials')
    })

    it('should have correct webauthn_credentials columns', async () => {
      const columns = await sql`
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
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'last_used_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'name', data_type: 'text', is_nullable: 'YES' }
      ]
      
      expect(Array.isArray(columns)).toBe(true)
      expect(columns.length).toBeGreaterThanOrEqual(expectedColumns.length)
      
      expectedColumns.forEach(expected => {
        const column = columns.find((c: any) => c.column_name === expected.column_name)
        expect(column).toBeDefined()
        if (column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('auth_challenges')
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('user_sessions')
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('oauth_accounts')
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('security_audit_logs')
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('user_consents')
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
      
      expect(Array.isArray(tables)).toBe(true)
      expect(tables).toHaveLength(1)
      expect(tables[0]?.table_name).toBe('refresh_tokens')
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
      
      expect(Array.isArray(fks)).toBe(true)
      expect(fks.length).toBeGreaterThan(0)
    })

    it('should have foreign key from oauth_accounts to users', async () => {
      const fks = await sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'oauth_accounts'
        AND constraint_type = 'FOREIGN KEY'
      `
      
      expect(Array.isArray(fks)).toBe(true)
      expect(fks.length).toBeGreaterThan(0)
    })
  })
})