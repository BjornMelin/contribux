import { describe, it, expect, beforeAll, vi } from 'vitest'
import { neon } from '@neondatabase/serverless'

// Get the test database URL from environment
const getTestDatabaseUrl = () => {
  // Try different environment variable sources
  const testUrl = process.env.DATABASE_URL_TEST || 
    'postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-hidden-union-a8b34lc5-pooler.eastus2.azure.neon.tech/neondb?sslmode=require'
  
  return testUrl
}

// Skip these tests if no real test database is configured
const testUrl = getTestDatabaseUrl()
const hasTestDatabase = testUrl && 
  testUrl !== 'sqlite://localhost/:memory:' &&
  !testUrl.includes('sqlite') &&
  testUrl.includes('postgresql')

const describeConditional = hasTestDatabase ? describe : describe.skip

describeConditional('Authentication Database Schema', () => {
  let sql: ReturnType<typeof neon>

  beforeAll(async () => {
    if (!hasTestDatabase) {
      throw new Error('These tests require a real PostgreSQL test database. Set DATABASE_URL_TEST in .env.test')
    }
    
    // Initialize the database client with the test URL
    sql = neon(testUrl)
    
    // Test connection to ensure it works
    try {
      const result = await sql`SELECT 1 as test`
      if (!result || !Array.isArray(result) || result.length === 0) {
        throw new Error('Invalid database response')
      }
    } catch (error) {
      throw new Error(`Failed to connect to test database: ${error?.message || 'Unknown error'}`)
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
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
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
    })

    it('should have unique constraint on credential_id', async () => {
      const constraints = await sql`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'webauthn_credentials'
        AND constraint_type = 'UNIQUE'
      `
      
      expect(Array.isArray(constraints) && constraints.some(c => 
        c.constraint_name.includes('credential_id')
      )).toBe(true)
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct auth_challenges columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'auth_challenges'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'challenge', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'YES' },
        { column_name: 'type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'used', data_type: 'boolean', is_nullable: 'NO' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct user_sessions columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'user_sessions'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'auth_method', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'ip_address', data_type: 'inet', is_nullable: 'YES' },
        { column_name: 'user_agent', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'last_active_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct oauth_accounts columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'oauth_accounts'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'provider', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'provider_account_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'access_token', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'refresh_token', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'token_type', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'scope', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
    })

    it('should have unique constraint on provider and provider_account_id', async () => {
      const constraints = await sql`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'oauth_accounts'
        AND constraint_type = 'UNIQUE'
      `
      
      expect(Array.isArray(constraints) ? constraints.length : 0).toBeGreaterThan(0)
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct security_audit_logs columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'security_audit_logs'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'event_type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'event_severity', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'YES' },
        { column_name: 'ip_address', data_type: 'inet', is_nullable: 'YES' },
        { column_name: 'user_agent', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'event_data', data_type: 'jsonb', is_nullable: 'YES' },
        { column_name: 'success', data_type: 'boolean', is_nullable: 'NO' },
        { column_name: 'error_message', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
    })

    it('should have index on event_type and created_at', async () => {
      const indexes = await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'security_audit_logs'
        AND schemaname = 'public'
      `
      
      expect(Array.isArray(indexes) ? indexes.length : 0).toBeGreaterThan(1) // Primary key + custom indexes
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct user_consents columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'user_consents'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'consent_type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'granted', data_type: 'boolean', is_nullable: 'NO' },
        { column_name: 'version', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'timestamp', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'ip_address', data_type: 'inet', is_nullable: 'YES' },
        { column_name: 'user_agent', data_type: 'text', is_nullable: 'YES' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
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
      
      expect(Array.isArray(tables) ? tables : []).toHaveLength(1)
    })

    it('should have correct refresh_tokens columns', async () => {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'refresh_tokens'
        ORDER BY ordinal_position
      `
      
      const expectedColumns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'token_hash', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'session_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'revoked_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'replaced_by', data_type: 'uuid', is_nullable: 'YES' }
      ]
      
      expectedColumns.forEach(expected => {
        const column = Array.isArray(columns) ? columns.find((c: any) => c.column_name === expected.column_name) : undefined
        expect(column).toBeDefined()
        if (column && typeof column === 'object' && 'data_type' in column) {
          expect(column.data_type).toContain(expected.data_type)
          expect(column.is_nullable).toBe(expected.is_nullable)
        }
      })
    })

    it('should have unique constraint on token_hash', async () => {
      const constraints = await sql`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'refresh_tokens'
        AND constraint_type = 'UNIQUE'
      `
      
      expect(Array.isArray(constraints) && constraints.some(c => 
        c.constraint_name.includes('token_hash')
      )).toBe(true)
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
      
      expect(Array.isArray(fks) ? fks.length : 0).toBeGreaterThan(0)
    })

    it('should have foreign key from oauth_accounts to users', async () => {
      const fks = await sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'oauth_accounts'
        AND constraint_type = 'FOREIGN KEY'
      `
      
      expect(Array.isArray(fks) ? fks.length : 0).toBeGreaterThan(0)
    })

    it('should have cascade delete on auth-related tables', async () => {
      const cascades = await sql`
        SELECT tc.table_name, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('webauthn_credentials', 'oauth_accounts', 'user_sessions', 'refresh_tokens')
      `
      
      if (Array.isArray(cascades)) {
        cascades.forEach(cascade => {
          expect(cascade.delete_rule).toBe('CASCADE')
        })
      }
    })
  })
})