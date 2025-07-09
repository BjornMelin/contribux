#!/usr/bin/env node

/**
 * Database Fix Verification Script
 * Verifies that all database connectivity issues have been resolved
 */

import { config } from 'dotenv'

// Load environment variables
config()

async function verifyDatabaseFix() {
  try {
    // Import the actual application database module
    const { checkDatabaseHealth, sql } = await import('../src/lib/db/index.ts')
    const healthResult = await checkDatabaseHealth()
    if (healthResult.error) {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.error('Database health check failed:', healthResult.error)
      process.exit(1)
    }
    const _testQuery = await sql`SELECT current_timestamp as now, current_database() as db_name`
    const _tableCount = await sql`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    const { getDatabaseUrl } = await import('../src/lib/validation/env.ts')
    const _mainUrl = getDatabaseUrl()
  } catch (_error) {
    process.exit(1)
  }
}

// Run the verification
verifyDatabaseFix().catch(_error => {
  process.exit(1)
})
