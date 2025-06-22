#!/usr/bin/env node

/**
 * Local Database Migration Runner for contribux
 * Uses standard pg driver for local PostgreSQL
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });
}

const { Client } = require('pg');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🚀 Starting database migrations...');
  console.log('📍 Using database:', databaseUrl.includes('localhost') ? 'Local PostgreSQL' : 'Remote PostgreSQL');

  const client = new Client({
    connectionString: databaseUrl
  });

  const migrationsDir = path.join(__dirname, '../../database/init');
  
  const migrationFiles = [
    '01-extensions.sql',
    '02-schema.sql', 
    '03-functions.sql',
    '04-sample-data.sql'
  ];

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('📋 Created migrations tracking table');

    // Run each migration
    for (const filename of migrationFiles) {
      console.log(`\n📄 Processing migration: ${filename}`);
      
      // Check if already applied
      const existing = await client.query(
        'SELECT applied_at FROM schema_migrations WHERE filename = $1',
        [filename]
      );
      
      if (existing.rows.length > 0) {
        console.log(`⏭️  Migration ${filename} already applied at ${existing.rows[0].applied_at}`);
        continue;
      }

      let filePath = path.join(migrationsDir, filename);
      
      // Handle schema.sql reference in 02-schema.sql
      if (filename === '02-schema.sql') {
        filePath = path.join(__dirname, '../../database/schema.sql');
      }
      
      // Handle search_functions.sql reference in 03-functions.sql
      if (filename === '03-functions.sql') {
        filePath = path.join(__dirname, '../../database/search_functions.sql');
      }
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${filePath}`);
        await client.end();
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      try {
        // Execute migration
        console.log(`   Executing SQL from ${filePath}...`);
        
        await client.query(content);
        
        // Record migration
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        
        console.log(`✅ Applied migration: ${filename}`);
        
      } catch (error) {
        console.error(`❌ Failed to apply migration ${filename}:`, error.message);
        throw error;
      }
    }

    console.log('\n✅ All migrations completed successfully!');
    
    // Verify database
    console.log('\n🔍 Verifying database structure...');
    
    const extensions = await client.query(`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `);
    console.log('📦 Extensions:', extensions.rows.map(e => e.extname).join(', '));

    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename != 'schema_migrations'
      ORDER BY tablename
    `);
    console.log('🗄️  Tables:', tables.rows.map(t => t.tablename).join(', '));

    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    const repoCount = await client.query('SELECT COUNT(*) as count FROM repositories');
    console.log(`📊 Sample data: ${userCount.rows[0].count} users, ${repoCount.rows[0].count} repositories`);

    console.log('\n✅ Database setup completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };