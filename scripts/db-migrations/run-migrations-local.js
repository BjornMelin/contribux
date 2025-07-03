#!/usr/bin/env node

/**
 * Local Database Migration Runner for contribux
 * Uses standard pg driver for local PostgreSQL
 */

const path = require('node:path')
const fs = require('node:fs')

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') })
}

const { Client } = require('pg')

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const client = new Client({
    connectionString: databaseUrl,
  })

  const migrationsDir = path.join(__dirname, '../../database/init')

  const migrationFiles = [
    '01-extensions.sql',
    '02-schema.sql',
    '03-functions.sql',
    '04-sample-data.sql',
  ]

  try {
    await client.connect()

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    // Run each migration
    for (const filename of migrationFiles) {
      // Check if already applied
      const existing = await client.query(
        'SELECT applied_at FROM schema_migrations WHERE filename = $1',
        [filename]
      )

      if (existing.rows.length > 0) {
        continue
      }

      let filePath = path.join(migrationsDir, filename)

      // Handle schema.sql reference in 02-schema.sql
      if (filename === '02-schema.sql') {
        filePath = path.join(__dirname, '../../database/schema.sql')
      }

      // Handle search_functions.sql reference in 03-functions.sql
      if (filename === '03-functions.sql') {
        filePath = path.join(__dirname, '../../database/search_functions.sql')
      }

      if (!fs.existsSync(filePath)) {
        await client.end()
        process.exit(1)
      }

      const content = fs.readFileSync(filePath, 'utf8')
      await client.query(content)

      // Record migration
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
    }

    const _extensions = await client.query(`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `)

    const _tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename != 'schema_migrations'
      ORDER BY tablename
    `)

    const _userCount = await client.query('SELECT COUNT(*) as count FROM users')
    const _repoCount = await client.query('SELECT COUNT(*) as count FROM repositories')
  } catch (_error) {
    process.exit(1)
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  runMigrations()
}

module.exports = { runMigrations }
