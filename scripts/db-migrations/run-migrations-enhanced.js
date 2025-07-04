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

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  // Define migration groups
  const migrationGroups = [
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

  try {
    // Create migrations tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        migration_group VARCHAR(100) DEFAULT 'core'
      )
    `

    // Run migrations by group
    for (const group of migrationGroups) {
      for (const filename of group.files) {
        // Check if already applied
        const existing = await sql`
          SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
        `

        if (existing.length > 0) {
          continue
        }

        let filePath = path.join(group.directory, filename)

        // Handle schema.sql reference in 02-schema.sql
        if (filename === '02-schema.sql') {
          filePath = path.join(__dirname, '../../database/schema.sql')
        }

        if (!fs.existsSync(filePath)) {
          if (fs.existsSync(group.directory)) {
            const files = fs.readdirSync(group.directory)
            files.forEach(_file => {
              // File found in directory
            })
          } else {
            // Directory does not exist
          }
          continue // Skip missing files instead of failing
        }

        const content = fs.readFileSync(filePath, 'utf8')

        try {
          // Split content by semicolons and execute each statement
          const statements = content
            .split(/;\s*$/m)
            .filter(stmt => stmt.trim().length > 0)
            .map(stmt => `${stmt.trim()};`)

          for (const statement of statements) {
            if (statement.trim() && !statement.includes('\\i')) {
              // Use the query method for raw SQL
              await sql.query(statement)
            }
          }

          // Record migration
          await sql`
            INSERT INTO schema_migrations (filename, migration_group)
            VALUES (${filename}, ${group.name.toLowerCase().replace(' ', '_')})
          `
        } catch (error) {
          // For WebAuthn migration, provide helpful context
          if (filename.includes('webauthn')) {
          }

          throw error
        }
      }
    }

    const _extensions = await sql`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `

    const _tables = await sql`
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

    if (webauthnTable[0].exists) {
      // Check WebAuthn table structure
      const _webauthnColumns = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'webauthn_credentials'
        ORDER BY ordinal_position
      `

      // Check foreign key
      const foreignKeys = await sql`
        SELECT 
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'webauthn_credentials'
      `

      if (foreignKeys.length > 0) {
      } else {
      }
    } else {
    }
    const appliedMigrations = await sql`
      SELECT filename, migration_group, applied_at 
      FROM schema_migrations 
      ORDER BY applied_at DESC 
      LIMIT 10
    `

    appliedMigrations.forEach(_m => {})
  } catch (_error) {
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
    appliedMigrations.forEach(_m => {})

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

    if (pendingMigrations.length > 0) {
      pendingMigrations.forEach(_f => {})
    } else {
    }
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename
    `

    // WebAuthn specific check
    const _webauthnExists = tables.some(t => t.tablename === 'webauthn_credentials')
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
