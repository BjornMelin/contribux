#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from 'dotenv'
import { Client } from 'pg'

// Load test environment variables
config({ path: '.env.test' })

async function setupAuthSchema() {
  const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!TEST_DATABASE_URL) {
    console.error('❌ No test database URL configured')
    process.exit(1)
  }

  const client = new Client({ connectionString: TEST_DATABASE_URL })

  try {
    await client.connect()
    console.log('✅ Connected to test database')

    // Check if auth tables already exist
    const tableCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('webauthn_credentials', 'auth_challenges', 'user_sessions', 'oauth_accounts', 'security_audit_logs', 'user_consents', 'refresh_tokens')
    `)

    const tableCount = Number.parseInt(tableCheck.rows[0]?.count || '0')

    if (tableCount === 7) {
      console.log('✅ Auth tables already exist')
      return
    }

    console.log('📦 Creating auth schema...')

    // Read and execute the auth schema SQL
    const authSchemaPath = path.join(process.cwd(), 'database', 'auth-schema.sql')
    const authSchemaSql = await fs.readFile(authSchemaPath, 'utf-8')

    // Execute the schema
    await client.query(authSchemaSql)

    console.log('✅ Auth schema created successfully')
  } catch (error) {
    console.error('❌ Failed to set up auth schema:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAuthSchema()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

export { setupAuthSchema }
