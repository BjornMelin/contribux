#!/usr/bin/env node

/**
 * Enhanced Database Migration Runner for contribux
 * Compatible with both Neon serverless and local PostgreSQL
 * Includes WebAuthn and other additional migrations
 */

const path = require('node:path')
const fs = require('node:fs')

// Load environment variables from .env.test in test environment
// Only load if the file exists (it won't in CI)
const envTestPath = path.join(__dirname, '../../.env.test')
if ((process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) && fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath })
}

// Helper function to check if migration is already applied
async function isMigrationApplied(sql, filename) {
  const existing = await sql`
    SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
  `
  return existing.length > 0
}

// Helper function to resolve migration file path
function resolveMigrationPath(group, filename) {
  return path.join(group.directory, filename)
}

// Helper function to execute SQL statements from file
async function executeMigrationStatements(sql, content) {
  const statements = content
    .split(/;\s*$/m)
    .filter(stmt => stmt.trim().length > 0)
    .map(stmt => `${stmt.trim()};`)

  for (const statement of statements) {
    if (statement.trim() && !statement.includes('\\i')) {
      await sql.query(statement)
    }
  }
}

// Helper function to record migration
async function recordMigration(sql, filename, group) {
  await sql`
    INSERT INTO schema_migrations (filename, migration_group)
    VALUES (${filename}, ${group.name.toLowerCase().replace(' ', '_')})
  `
}

/**
 * Creates a database client based on the environment
 * - Uses regular pg driver for local PostgreSQL in CI/testing
 * - Uses Neon serverless driver for production
 */
async function createDatabaseClient(connectionString) {
  const isLocalPostgres = 
    process.env.CI === 'true' || 
    process.env.USE_LOCAL_PG === 'true' ||
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')

  if (isLocalPostgres) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('Using standard pg driver for local PostgreSQL')
    
    // Use regular pg driver for local PostgreSQL
    const pg = require('pg')
    const { Client } = pg
    
    const client = new Client({ connectionString })
    await client.connect()

    // Create a wrapper that matches Neon's interface
    const wrapper = async function(strings, ...values) {
      // Convert tagged template to parameterized query
      let query = strings[0] || ''
      const params = []
      
      for (let i = 0; i < values.length; i++) {
        params.push(values[i])
        query += `$${i + 1}${strings[i + 1] || ''}`
      }
      
      const result = await client.query(query, params)
      return result.rows
    }

    // Add the query method for direct queries
    wrapper.query = async (query, params) => {
      const result = await client.query(query, params)
      return result
    }

    // Store the client for cleanup
    wrapper._pgClient = client

    return wrapper
  } else {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('Using Neon serverless driver')
    
    // Use Neon serverless driver for production
    const { neon } = require('@neondatabase/serverless')
    const sql = neon(connectionString)
    
    // Add query method for compatibility
    sql.query = async (queryText, params) => {
      if (params && params.length > 0) {
        // Neon doesn't support parameterized queries the same way
        // We need to convert to template literal format
        // This is a limitation we'll have to work around
        const result = await sql(queryText)
        return { rows: result }
      } else {
        // Simple query without parameters
        const result = await sql(queryText)
        return { rows: result }
      }
    }
    
    return sql
  }
}

/**
 * Closes the database client connection
 * Only needed for regular pg clients, Neon handles this automatically
 */
async function closeDatabaseClient(client) {
  if (client._pgClient && typeof client._pgClient.end === 'function') {
    await client._pgClient.end()
  }
}

function initializeDatabaseConnection() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  // Debug logging for CI
  if (process.env.CI) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('Running in CI environment')
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('NODE_ENV:', process.env.NODE_ENV)
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('DATABASE_URL_TEST exists:', !!process.env.DATABASE_URL_TEST)
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
  }

  if (!databaseUrl) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('ERROR: No database URL found. Set DATABASE_URL or DATABASE_URL_TEST')
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Environment variables available:', Object.keys(process.env).filter(k => k.includes('DATABASE')).join(', '))
    process.exit(1)
  }

  // Log connection info (but not the password)
  const urlParts = databaseUrl.match(/postgresql:\/\/([^:]+):.*@([^/]+)\/(.+)/)
  if (urlParts) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`Connecting to database: ${urlParts[3]} on ${urlParts[2]} as user ${urlParts[1]}`)
  }

  return databaseUrl
}

function getMigrationGroups() {
  // Get all SQL files from drizzle directory
  const drizzleDir = path.join(__dirname, '../../drizzle')
  let drizzleFiles = []
  
  if (fs.existsSync(drizzleDir)) {
    drizzleFiles = fs.readdirSync(drizzleDir)
      .filter(f => f.endsWith('.sql'))
      .sort() // Ensure proper order
  }
  
  return [
    {
      name: 'Drizzle Migrations',
      directory: drizzleDir,
      files: drizzleFiles,
    },
  ]
}

async function ensureMigrationTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      migration_group VARCHAR(100) DEFAULT 'core'
    )
  `
}

// Helper function to handle missing file scenarios
function handleMissingFile(group, filename) {
  if (fs.existsSync(group.directory)) {
    const files = fs.readdirSync(group.directory)
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`  ! ${filename} not found. Available files:`, files)
  } else {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`  ! Directory ${group.directory} does not exist`)
  }
}

// Helper function to execute single migration file
async function executeSingleMigration(sql, filename, group) {
  // Check if already applied
  if (await isMigrationApplied(sql, filename)) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`  ✓ ${filename} (already applied)`)
    return
  }

  const filePath = resolveMigrationPath(group, filename)

  if (!fs.existsSync(filePath)) {
    handleMissingFile(group, filename)
    return // Skip missing files instead of failing
  }

  const content = fs.readFileSync(filePath, 'utf8')
  await applyMigrationWithErrorHandling(sql, filename, content, group)
}

// Helper function to apply migration with error handling
async function applyMigrationWithErrorHandling(sql, filename, content, group) {
  try {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`  → Applying ${filename}...`)
    await executeMigrationStatements(sql, content)
    await recordMigration(sql, filename, group)
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`  ✓ ${filename} applied successfully`)
  } catch (error) {
    handleMigrationError(filename, error)
    throw error
  }
}

// Helper function to handle migration errors
function handleMigrationError(filename, error) {
  // For WebAuthn migration, provide helpful context
  if (filename.includes('webauthn')) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('  ! WebAuthn migration failed. This is expected if the table already exists.')
  }
  // biome-ignore lint/suspicious/noConsole: Development script
  console.error('  ! Migration error:', error.message)
}

async function executeMigrationGroups(sql, migrationGroups) {
  for (const group of migrationGroups) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(`\nProcessing ${group.name}...`)

    for (const filename of group.files) {
      await executeSingleMigration(sql, filename, group)
    }
  }
}

async function verifyMigrationResults(sql) {
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log('\nVerifying migration results...')

  const extensions = await sql`
    SELECT extname FROM pg_extension 
    WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
    ORDER BY extname
  `

  const tables = await sql`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'pg_%'
    AND tablename != 'schema_migrations'
    ORDER BY tablename
  `

  // Check for WebAuthn specific verification
  const webauthnTable = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'webauthn_credentials'
    ) as exists
  `

  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`Extensions: ${extensions.map(e => e.extname).join(', ')}`)
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`Tables: ${tables.map(t => t.tablename).join(', ')}`)
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`WebAuthn support: ${webauthnTable[0]?.exists ? 'enabled' : 'disabled'}`)
}

async function runMigrations() {
  const databaseUrl = initializeDatabaseConnection()
  const migrationGroups = getMigrationGroups()
  let sql = null

  try {
    // Create database client
    sql = await createDatabaseClient(databaseUrl)
    
    await ensureMigrationTable(sql)
    await executeMigrationGroups(sql, migrationGroups)
    await verifyMigrationResults(sql)

    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('\nMigrations completed successfully!')
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Migration failed:', error.message)
    process.exit(1)
  } finally {
    // Clean up database connection
    if (sql) {
      await closeDatabaseClient(sql)
    }
  }
}

// Status command
async function checkMigrationStatus() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  let sql = null

  try {
    sql = await createDatabaseClient(databaseUrl)

    // Check if migrations table exists
    const migrationTableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      ) as exists
    `

    if (!migrationTableExists[0].exists) {
      return
    }

    // Get applied migrations
    const appliedMigrations = await sql`
      SELECT filename, migration_group, applied_at 
      FROM schema_migrations 
      ORDER BY applied_at ASC
    `
    // Track applied migrations count
    const _appliedCount = appliedMigrations.length

    // Check for pending migrations
    const allMigrationFiles = [
      '01-extensions.sql',
      '02-schema.sql',
      '03-functions.sql',
      '04-sample-data.sql',
      'add_webauthn_credentials.sql',
    ]

    const appliedFileNames = appliedMigrations.map(m => m.filename)
    const pendingMigrations = allMigrationFiles.filter(f => !appliedFileNames.includes(f))

    const pendingCount = pendingMigrations.length

    // Log migration status
    if (pendingCount > 0) {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log(`  ${pendingCount} pending migrations found`)
    } else {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log('  All migrations up to date')
    }
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename
    `

    // WebAuthn specific check
    const webauthnExists = tables.some(t => t.tablename === 'webauthn_credentials')
    if (webauthnExists) {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log('  WebAuthn support enabled')
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Status check failed:', error.message)
    process.exit(1)
  } finally {
    if (sql) {
      await closeDatabaseClient(sql)
    }
  }
}

// Reset command (use with caution)
async function resetDatabase() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  // Only allow reset in test environment
  if (!databaseUrl.includes('test') && !databaseUrl.includes('localhost')) {
    process.exit(1)
  }

  let sql = null

  try {
    sql = await createDatabaseClient(databaseUrl)

    // Drop tables in reverse dependency order
    const dropStatements = [
      'DROP TABLE IF EXISTS webauthn_credentials CASCADE',
      'DROP TABLE IF EXISTS user_repository_interactions CASCADE',
      'DROP TABLE IF EXISTS contribution_outcomes CASCADE',
      'DROP TABLE IF EXISTS notifications CASCADE',
      'DROP TABLE IF EXISTS user_preferences CASCADE',
      'DROP TABLE IF EXISTS opportunities CASCADE',
      'DROP TABLE IF EXISTS repositories CASCADE',
      'DROP TABLE IF EXISTS users CASCADE',
      'DROP TABLE IF EXISTS schema_migrations CASCADE',
    ]

    for (const statement of dropStatements) {
      await sql.query(statement)
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Reset failed:', error.message)
    process.exit(1)
  } finally {
    if (sql) {
      await closeDatabaseClient(sql)
    }
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2] || 'run'

  switch (command) {
    case 'run':
    case 'migrate':
      runMigrations()
      break
    case 'status':
      checkMigrationStatus()
      break
    case 'reset':
      resetDatabase()
      break
    default:
      break
  }
}

module.exports = {
  runMigrations,
  checkMigrationStatus,
  resetDatabase,
  createDatabaseClient,
  closeDatabaseClient,
}