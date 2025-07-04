#!/usr/bin/env node

/**
 * Simplified Database Migration Runner for contribux
 * Compatible with latest @neondatabase/serverless
 */

const path = require('node:path')
const fs = require('node:fs')

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') })
}

const { neon } = require('@neondatabase/serverless')

// Helper function to get migration file path
function getMigrationFilePath(filename, migrationsDir) {
  if (filename === '02-schema.sql') {
    return path.join(__dirname, '../../database/schema.sql')
  }
  return path.join(migrationsDir, filename)
}

// Helper function to check if migration was already applied
async function isMigrationApplied(sql, filename) {
  const existing = await sql`
    SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
  `
  return existing.length > 0
}

// Helper function to execute migration file
async function executeMigrationFile(sql, filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
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

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const migrationsDir = path.join(__dirname, '../../database/init')

  const migrationFiles = [
    '01-extensions.sql',
    '02-schema.sql',
    '03-functions.sql',
    '04-sample-data.sql',
  ]

  try {
    // Create migrations tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // Run each migration
    for (const filename of migrationFiles) {
      if (await isMigrationApplied(sql, filename)) {
        continue
      }

      const filePath = getMigrationFilePath(filename, migrationsDir)

      if (!fs.existsSync(filePath)) {
        process.exit(1)
      }

      await executeMigrationFile(sql, filePath)

      // Record migration
      await sql`
        INSERT INTO schema_migrations (filename)
        VALUES (${filename})
      `
    }

    // Verify setup
    await sql`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `

    await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename != 'schema_migrations'
      ORDER BY tablename
    `
  } catch (_error) {
    process.exit(1)
  }
}

if (require.main === module) {
  runMigrations()
}

module.exports = { runMigrations }
