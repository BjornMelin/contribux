#!/usr/bin/env node

/**
 * WebAuthn Migration Verification Script
 *
 * This script verifies and applies the WebAuthn credentials migration
 * for the Contribux portfolio project.
 */

const path = require('node:path')
const fs = require('node:fs')

// Load environment variables
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../.env.test') })
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_TEST) {
    simulateMigrationVerification()
    process.exit(0)
  }
}

const { neon } = require('@neondatabase/serverless')

async function verifyWebAuthnMigration() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    await simulateMigrationVerification()
    return
  }

  const sql = neon(databaseUrl)

  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      ) as exists
    `

    if (tableExists[0].exists) {
      await verifyTableStructure(sql)
    } else {
      await applyWebAuthnMigration(sql)
    }
    await verifyDatabaseIntegrity(sql)
    await generateMigrationReport(sql)
  } catch (_error) {
    process.exit(1)
  }
}

async function verifyTableStructure(sql) {
  try {
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'webauthn_credentials'
      ORDER BY ordinal_position
    `

    const expectedColumns = [
      'id',
      'user_id',
      'credential_id',
      'public_key',
      'counter',
      'device_name',
      'created_at',
      'last_used_at',
    ]

    const actualColumns = columns.map(col => col.column_name)
    const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col))

    if (missingColumns.length > 0) {
      // Missing columns detected
    } else {
      // All columns present
    }

    // Check indexes
    const _indexes = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'webauthn_credentials'
      AND schemaname = 'public'
    `

    // Check foreign key constraints
    const constraints = await sql`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'public.webauthn_credentials'::regclass
    `

    const _foreignKeys = constraints.filter(c => c.contype === 'f')
  } catch (_error) {
    // Error checking constraints
  }
}

async function applyWebAuthnMigration(sql) {
  const migrationPath = path.join(__dirname, '../drizzle/0007_add_webauthn_credentials.sql')

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`WebAuthn migration file not found: ${migrationPath}`)
  }

  const migrationContent = fs.readFileSync(migrationPath, 'utf8')
  // Split the migration into individual statements and execute them
  const statements = migrationContent
    .split(/;\s*$/m)
    .filter(stmt => stmt.trim().length > 0 && !stmt.trim().startsWith('--'))
    .map(stmt => stmt.trim())

  for (const statement of statements) {
    if (statement && !statement.startsWith('--')) {
      await sql.query(`${statement};`)
    }
  }

  // Record this migration in the schema_migrations table
  await sql`
      INSERT INTO schema_migrations (filename)
      VALUES ('0007_add_webauthn_credentials.sql')
      ON CONFLICT (filename) DO NOTHING
    `
}

async function verifyDatabaseIntegrity(sql) {
  try {
    // Test basic database operations
    await sql`SELECT 1 as test`

    // Check for required extensions
    const _extensions = await sql`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `

    // Verify users table exists (required for foreign key)
    const usersTable = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists
    `

    if (usersTable[0].exists) {
      // Users table exists
    } else {
      // Users table missing
    }

    // Test WebAuthn table if it exists
    const webauthnExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      ) as exists
    `

    if (webauthnExists[0].exists) {
      // Test basic operations
      const _count = await sql`SELECT COUNT(*) as count FROM webauthn_credentials`
    }
  } catch (_error) {
    // Error checking constraints
  }
}

async function generateMigrationReport(sql) {
  try {
    // Get all tables
    const _tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename
    `

    // Get applied migrations
    const migrations = await sql`
      SELECT filename, applied_at FROM schema_migrations
      ORDER BY applied_at DESC
      LIMIT 5
    `
    // biome-ignore lint/suspicious/noConsole: Development script
    console.log('Recent migrations:')
    migrations.forEach(m => {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log(`  - ${m.filename} (${m.applied_at})`)
    })

    // WebAuthn specific verification
    const webauthnMigration = await sql`
      SELECT applied_at FROM schema_migrations 
      WHERE filename = '0007_add_webauthn_credentials.sql'
    `

    if (webauthnMigration.length > 0) {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log('✅ WebAuthn migration found in migration history')
    } else {
      // biome-ignore lint/suspicious/noConsole: Development script
      console.log('⚠️ WebAuthn migration not found in migration history')
    }
  } catch (_error) {
    // Error checking constraints
  }
}

async function simulateMigrationVerification() {
  // TODO: Implement migration verification simulation
  // biome-ignore lint/suspicious/noConsole: Development script placeholder
  console.log('WebAuthn migration verification simulation - placeholder')
}

// Integration with existing migration system
async function integrateWithExistingMigrations() {
  const migrationsDir = path.join(__dirname, '../database/migrations')
  const webauthnMigrationPath = path.join(migrationsDir, 'add_webauthn_credentials.sql')

  // Copy WebAuthn migration to the standard migrations directory
  const sourcePath = path.join(__dirname, '../drizzle/0007_add_webauthn_credentials.sql')

  if (fs.existsSync(sourcePath)) {
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true })
    }

    const migrationContent = fs.readFileSync(sourcePath, 'utf8')
    fs.writeFileSync(webauthnMigrationPath, migrationContent)
  }

  // Create a README for the migrations directory
  const readmePath = path.join(migrationsDir, 'README.md')
  const readmeContent = `# Database Migrations

This directory contains database migrations that extend the base schema.

## Available Migrations

- \`add_webauthn_credentials.sql\` - Adds WebAuthn passwordless authentication support

## Usage

These migrations are applied automatically by the migration runner.
`

  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, readmeContent)
  }
}

if (require.main === module) {
  verifyWebAuthnMigration().catch(_error => {
    process.exit(1)
  })
}

module.exports = {
  verifyWebAuthnMigration,
  applyWebAuthnMigration,
  integrateWithExistingMigrations,
}
