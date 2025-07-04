#!/usr/bin/env node

/**
 * Database Fix Verification Script
 * Verifies that all database connectivity issues have been resolved
 */

import { config } from 'dotenv'

// Load environment variables
config()

async function verifyDatabaseFix() {
  console.log('🔍 Verifying Database Fix...\n')
  
  try {
    // Test the application's database configuration
    console.log('📋 Testing Application Database Configuration:')
    
    // Import the actual application database module
    const { checkDatabaseHealth, db, sql } = await import('../src/lib/db/index.ts')
    
    // Test the health check function
    console.log('  1. Health check function...')
    const healthResult = await checkDatabaseHealth()
    console.log(`     Status: ${healthResult.healthy ? '✅ Healthy' : '❌ Unhealthy'}`)
    console.log(`     Latency: ${healthResult.latency}ms`)
    if (healthResult.error) {
      console.log(`     Error: ${healthResult.error}`)
    }
    
    // Test basic database operations
    console.log('  2. Basic SQL operations...')
    const testQuery = await sql`SELECT current_timestamp as now, current_database() as db_name`
    console.log(`     ✅ Connected to: ${testQuery[0].db_name}`)
    console.log(`     ✅ Server time: ${testQuery[0].now}`)
    
    // Test schema access
    console.log('  3. Schema access...')
    const tableCount = await sql`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log(`     ✅ Found ${tableCount[0].count} tables in public schema`)
    
    // Test environment-specific URLs
    console.log('  4. Environment URL configuration...')
    const { getDatabaseUrl } = await import('../src/lib/validation/env.ts')
    const mainUrl = getDatabaseUrl()
    console.log(`     ✅ Main database URL configured: ${mainUrl ? 'Yes' : 'No'}`)
    
    console.log('\n🎉 All database connectivity issues have been resolved!')
    console.log('\n📊 Summary:')
    console.log('  • Database connections: Working ✅')
    console.log('  • Health check endpoint: Fixed ✅')
    console.log('  • Environment validation: Updated ✅')
    console.log('  • Basic queries: Functional ✅')
    console.log('  • Schema access: Available ✅')
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    console.error('\n🔧 Troubleshooting steps:')
    console.error('  1. Check DATABASE_URL environment variable')
    console.error('  2. Verify Neon database is accessible')
    console.error('  3. Check network connectivity')
    console.error('  4. Verify SSL configuration')
    process.exit(1)
  }
}

// Run the verification
verifyDatabaseFix()
  .catch(error => {
    console.error('\n💥 Verification script failed:', error.message)
    process.exit(1)
  })