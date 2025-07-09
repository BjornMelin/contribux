#!/usr/bin/env node

/**
 * Enhanced Database Migration Runner for contribux
 * Compatible with latest @neondatabase/serverless
 * Includes WebAuthn and other additional migrations
 */

const path = require('node:path')
const fs = require('node:fs')

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') })
}

const { neon } = require('@neondatabase/serverless')

// Helper function to check if migration is already applied
async function isMigrationApplied(sql, filename) {
  const existing = await sql`
    SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
  `
  return existing.length > 0
}

// Helper function to resolve migration file path
function resolveMigrationPath(group, filename) {
  if (filename === '02-schema.sql') {
    return path.join(__dirname, '../../database/schema.sql')
  }
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

function initializeDatabaseConnection() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('No database URL found. Set DATABASE_URL or DATABASE_URL_TEST')
    process.exit(1)
  }

  return neon(databaseUrl)
}

function getMigrationGroups() {
  return [
    {
      name: 'Core Schema',
      directory: path.join(__dirname, '../../database/init'),
      files: ['01-extensions.sql', '02-schema.sql', '03-functions.sql', '04-sample-data.sql'],
    },
    {
      name: 'Additional Features',
      directory: path.join(__dirname, '../../database/migrations'),
      files: ['add_webauthn_credentials.sql'],
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
function handleMigrationError(filename, _error) {
  // For WebAuthn migration, provide helpful context
  if (filename.includes('webauthn')) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('  ! WebAuthn migration failed. This is expected if the table already exists.')
  }
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
  const sql = initializeDatabaseConnection()
  const migrationGroups = getMigrationGroups()

  try {
    await ensureMigrationTable(sql)
    await executeMigrationGroups(sql, migrationGroups)
    await verifyMigrationResults(sql)

    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('\nMigrations completed successfully!')
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Migration failed:', error.message)
    process.exit(1)
  }
}

// Status command
async function checkMigrationStatus() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
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
  } catch (_error) {
    process.exit(1)
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

  const sql = neon(databaseUrl)

  try {
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
  } catch (_error) {
    process.exit(1)
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
}
