#!/usr/bin/env node

/**
 * Database Migration Runner for contribux
 * Runs all SQL migrations in order with proper error handling and rollback support
 */

const path = require('path');

// Load environment variables from .env.test in test environment
if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });
}

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

class MigrationRunner {
  constructor(databaseUrl) {
    this.sql = neon(databaseUrl);
    this.migrationsDir = path.join(__dirname, '../../database/init');
    this.migrationFiles = [
      '01-extensions.sql',
      '02-schema.sql', 
      '03-functions.sql',
      '04-sample-data.sql'
    ];
  }

  async runMigrations() {
    console.log('🚀 Starting database migrations...');
    
    try {
      // Create migrations tracking table
      await this.createMigrationsTable();
      
      // Run each migration file
      for (const file of this.migrationFiles) {
        await this.runMigration(file);
      }
      
      console.log('✅ All migrations completed successfully!');
      
      // Verify database structure
      await this.verifyDatabase();
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  }

  async createMigrationsTable() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        checksum VARCHAR(64)
      )
    `;
    
    console.log('📋 Created migrations tracking table');
  }

  async runMigration(filename) {
    console.log(`📄 Processing migration: ${filename}`);
    
    // Check if migration already applied
    const existing = await this.sql`
      SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
    `;
    
    if (existing.length > 0) {
      console.log(`⏭️  Migration ${filename} already applied at ${existing[0].applied_at}`);
      return;
    }

    const filePath = path.join(this.migrationsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Handle schema.sql reference in 02-schema.sql
    if (filename === '02-schema.sql' && content.includes('\\i')) {
      const schemaPath = path.join(__dirname, '../../database/schema.sql');
      content = fs.readFileSync(schemaPath, 'utf8');
    }

    // Calculate checksum for integrity verification
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    try {
      // Execute migration in a transaction
      await this.sql.begin(async (sql) => {
        await sql.unsafe(content);
        await sql`
          INSERT INTO schema_migrations (filename, checksum)
          VALUES (${filename}, ${checksum})
        `;
      });
      
      console.log(`✅ Applied migration: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Failed to apply migration ${filename}:`, error.message);
      throw error;
    }
  }

  async verifyDatabase() {
    console.log('🔍 Verifying database structure...');
    
    try {
      // Check extensions
      const extensions = await this.sql`
        SELECT extname FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'vector')
        ORDER BY extname
      `;
      console.log('📦 Extensions:', extensions.map(e => e.extname).join(', '));

      // Check main tables
      const tables = await this.sql`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('users', 'repositories', 'opportunities', 'user_preferences', 'notifications', 'contribution_outcomes', 'user_repository_interactions')
        ORDER BY tablename
      `;
      console.log('🗄️  Tables:', tables.map(t => t.tablename).join(', '));

      // Check HNSW indexes
      const hnsw_indexes = await this.sql`
        SELECT indexname FROM pg_indexes 
        WHERE indexname LIKE '%hnsw%' 
        ORDER BY indexname
      `;
      console.log('🔍 HNSW Indexes:', hnsw_indexes.map(i => i.indexname).join(', '));

      // Check sample data
      const userCount = await this.sql`SELECT COUNT(*) as count FROM users`;
      const repoCount = await this.sql`SELECT COUNT(*) as count FROM repositories`;
      console.log(`📊 Sample data: ${userCount[0].count} users, ${repoCount[0].count} repositories`);

      console.log('✅ Database verification completed successfully!');
      
    } catch (error) {
      console.error('❌ Database verification failed:', error.message);
      throw error;
    }
  }

  async rollback(filename) {
    console.log(`🔄 Rolling back migration: ${filename}`);
    
    try {
      await this.sql`
        DELETE FROM schema_migrations WHERE filename = ${filename}
      `;
      console.log(`✅ Rolled back migration: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Failed to rollback migration ${filename}:`, error.message);
      throw error;
    }
  }

  async getAppliedMigrations() {
    const migrations = await this.sql`
      SELECT filename, applied_at, checksum 
      FROM schema_migrations 
      ORDER BY applied_at
    `;
    return migrations;
  }

  async resetDatabase() {
    console.log('🧹 Resetting database...');
    
    try {
      // Drop all tables in the correct order (respecting foreign keys)
      const dropTablesSQL = `
        DROP TABLE IF EXISTS user_repository_interactions CASCADE;
        DROP TABLE IF EXISTS contribution_outcomes CASCADE;
        DROP TABLE IF EXISTS notifications CASCADE;
        DROP TABLE IF EXISTS user_preferences CASCADE;
        DROP TABLE IF EXISTS opportunities CASCADE;
        DROP TABLE IF EXISTS repositories CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS schema_migrations CASCADE;
        
        -- Drop custom types
        DROP TYPE IF EXISTS user_role CASCADE;
        DROP TYPE IF EXISTS repository_status CASCADE;
        DROP TYPE IF EXISTS opportunity_status CASCADE;
        DROP TYPE IF EXISTS skill_level CASCADE;
        DROP TYPE IF EXISTS contribution_type CASCADE;
        DROP TYPE IF EXISTS notification_type CASCADE;
        DROP TYPE IF EXISTS outcome_status CASCADE;
      `;
      
      await this.sql.unsafe(dropTablesSQL);
      console.log('✅ Database reset completed');
      
    } catch (error) {
      console.error('❌ Database reset failed:', error.message);
      throw error;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const runner = new MigrationRunner(databaseUrl);

  try {
    switch (command) {
      case 'migrate':
        await runner.runMigrations();
        break;
        
      case 'status':
        const applied = await runner.getAppliedMigrations();
        console.log('📋 Applied migrations:');
        applied.forEach(m => {
          console.log(`  ✅ ${m.filename} (${m.applied_at})`);
        });
        break;
        
      case 'reset':
        await runner.resetDatabase();
        break;
        
      case 'rollback':
        const filename = args[1];
        if (!filename) {
          console.error('❌ Filename required for rollback');
          process.exit(1);
        }
        await runner.rollback(filename);
        break;
        
      default:
        console.log(`
Usage: node run-migrations.js [command] [options]

Commands:
  migrate     - Run all pending migrations (default)
  status      - Show applied migrations
  reset       - Drop all tables and reset database
  rollback    - Rollback specific migration (requires filename)

Environment Variables:
  DATABASE_URL_TEST  - Test database connection string
  DATABASE_URL       - Fallback database connection string
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { MigrationRunner };