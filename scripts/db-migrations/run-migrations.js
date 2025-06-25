#!/usr/bin/env node

/**
 * Simplified Database Migration Runner for contribux
 * Compatible with latest @neondatabase/serverless
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });
}

const { neon } = require('@neondatabase/serverless');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🚀 Starting database migrations...');
  console.log('📍 Using database:', databaseUrl.includes('localhost') ? 'Local PostgreSQL' : 'Neon PostgreSQL');

  const sql = neon(databaseUrl);
  const migrationsDir = path.join(__dirname, '../../database/init');
  
  const migrationFiles = [
    '01-extensions.sql',
    '02-schema.sql', 
    '03-functions.sql',
    '04-sample-data.sql'
  ];

  try {
    // Create migrations tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    console.log('📋 Created migrations tracking table');

    // Run each migration
    for (const filename of migrationFiles) {
      console.log(`\n📄 Processing migration: ${filename}`);
      
      // Check if already applied
      const existing = await sql`
        SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
      `;
      
      if (existing.length > 0) {
        console.log(`⏭️  Migration ${filename} already applied at ${existing[0].applied_at}`);
        continue;
      }

      let filePath = path.join(migrationsDir, filename);
      
      // Handle schema.sql reference in 02-schema.sql
      if (filename === '02-schema.sql') {
        filePath = path.join(__dirname, '../../database/schema.sql');
      }
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      try {
        // Execute migration
        console.log(`   Executing SQL from ${filePath}...`);
        
        // Split content by semicolons and execute each statement
        const statements = content
          .split(/;\s*$/m)
          .filter(stmt => stmt.trim().length > 0)
          .map(stmt => stmt.trim() + ';');
        
        for (const statement of statements) {
          if (statement.trim() && !statement.includes('\\i')) {
            // Use the query method for raw SQL
            await sql.query(statement);
          }
        }
        
        // Record migration
        await sql`
          INSERT INTO schema_migrations (filename)
          VALUES (${filename})
        `;
        
        console.log(`✅ Applied migration: ${filename}`);
        
      } catch (error) {
        console.error(`❌ Failed to apply migration ${filename}:`, error.message);
        throw error;
      }
    }

    console.log('\n✅ All migrations completed successfully!');
    
    // Verify database
    console.log('\n🔍 Verifying database structure...');
    
    const extensions = await sql`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
      ORDER BY extname
    `;
    console.log('📦 Extensions:', extensions.map(e => e.extname).join(', '));

    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename != 'schema_migrations'
      ORDER BY tablename
    `;
    console.log('🗄️  Tables:', tables.map(t => t.tablename).join(', '));

    console.log('\n✅ Database setup completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };