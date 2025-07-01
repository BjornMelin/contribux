#!/usr/bin/env node

/**
 * Enhanced Database Migration Runner for contribux
 * Compatible with latest @neondatabase/serverless
 * Includes WebAuthn and other additional migrations
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

  console.log('🚀 Starting enhanced database migrations...');
  console.log('📍 Using database:', databaseUrl.includes('localhost') ? 'Local PostgreSQL' : 'Neon PostgreSQL');

  const sql = neon(databaseUrl);
  
  // Define migration groups
  const migrationGroups = [
    {
      name: 'Core Schema',
      directory: path.join(__dirname, '../../database/init'),
      files: [
        '01-extensions.sql',
        '02-schema.sql', 
        '03-functions.sql',
        '04-sample-data.sql'
      ]
    },
    {
      name: 'Additional Features',
      directory: path.join(__dirname, '../../database/migrations'),
      files: [
        'add_webauthn_credentials.sql'
      ]
    }
  ];

  try {
    // Create migrations tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        migration_group VARCHAR(100) DEFAULT 'core'
      )
    `;
    console.log('📋 Created/verified migrations tracking table');

    // Run migrations by group
    for (const group of migrationGroups) {
      console.log(`\n📦 Processing migration group: ${group.name}`);
      
      for (const filename of group.files) {
        console.log(`\n📄 Processing migration: ${filename}`);
        
        // Check if already applied
        const existing = await sql`
          SELECT applied_at FROM schema_migrations WHERE filename = ${filename}
        `;
        
        if (existing.length > 0) {
          console.log(`⏭️  Migration ${filename} already applied at ${existing[0].applied_at}`);
          continue;
        }

        let filePath = path.join(group.directory, filename);
        
        // Handle schema.sql reference in 02-schema.sql
        if (filename === '02-schema.sql') {
          filePath = path.join(__dirname, '../../database/schema.sql');
        }
        
        if (!fs.existsSync(filePath)) {
          console.error(`❌ Migration file not found: ${filePath}`);
          console.error(`   Available files in ${group.directory}:`);
          if (fs.existsSync(group.directory)) {
            const files = fs.readdirSync(group.directory);
            files.forEach(file => console.error(`   - ${file}`));
          } else {
            console.error(`   Directory does not exist: ${group.directory}`);
          }
          continue; // Skip missing files instead of failing
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
            INSERT INTO schema_migrations (filename, migration_group)
            VALUES (${filename}, ${group.name.toLowerCase().replace(' ', '_')})
          `;
          
          console.log(`✅ Applied migration: ${filename}`);
          
        } catch (error) {
          console.error(`❌ Failed to apply migration ${filename}:`, error.message);
          
          // For WebAuthn migration, provide helpful context
          if (filename.includes('webauthn')) {
            console.error('💡 WebAuthn migration troubleshooting:');
            console.error('   - Ensure users table exists before running WebAuthn migration');
            console.error('   - Check that PostgreSQL extensions are installed');
            console.error('   - Verify database permissions for table creation');
          }
          
          throw error;
        }
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

    // Check for WebAuthn specific verification
    const webauthnTable = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webauthn_credentials'
      ) as exists
    `;

    if (webauthnTable[0].exists) {
      console.log('🔐 WebAuthn credentials table verified');
      
      // Check WebAuthn table structure
      const webauthnColumns = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'webauthn_credentials'
        ORDER BY ordinal_position
      `;
      console.log('🔐 WebAuthn columns:', webauthnColumns.map(c => c.column_name).join(', '));
      
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
      `;
      
      if (foreignKeys.length > 0) {
        console.log('🔗 WebAuthn foreign key verified');
      } else {
        console.log('⚠️  WebAuthn foreign key not found');
      }
    } else {
      console.log('⚠️  WebAuthn credentials table not found - may need manual application');
    }

    console.log('\n📋 Migration Summary:');
    const appliedMigrations = await sql`
      SELECT filename, migration_group, applied_at 
      FROM schema_migrations 
      ORDER BY applied_at DESC 
      LIMIT 10
    `;
    
    appliedMigrations.forEach(m => {
      console.log(`   ✅ ${m.filename} (${m.migration_group}) - ${m.applied_at}`);
    });

    console.log('\n✅ Database setup completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\n🔧 Troubleshooting tips:');
    console.error('   1. Verify database connection and credentials');
    console.error('   2. Ensure database exists and is accessible');
    console.error('   3. Check that all required extensions are available');
    console.error('   4. Verify that previous migrations completed successfully');
    console.error('   5. For WebAuthn issues, ensure users table exists first');
    process.exit(1);
  }
}

// Status command
async function checkMigrationStatus() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('📊 Migration Status Report');
  console.log('==========================');

  const sql = neon(databaseUrl);

  try {
    // Check if migrations table exists
    const migrationTableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      ) as exists
    `;

    if (!migrationTableExists[0].exists) {
      console.log('⚠️  Migration tracking table does not exist. Run migrations first.');
      return;
    }

    // Get applied migrations
    const appliedMigrations = await sql`
      SELECT filename, migration_group, applied_at 
      FROM schema_migrations 
      ORDER BY applied_at ASC
    `;

    console.log(`\n📋 Applied Migrations (${appliedMigrations.length} total):`);
    appliedMigrations.forEach(m => {
      console.log(`   ✅ ${m.filename} (${m.migration_group || 'core'}) - ${m.applied_at}`);
    });

    // Check for pending migrations
    const allMigrationFiles = [
      '01-extensions.sql',
      '02-schema.sql',
      '03-functions.sql',
      '04-sample-data.sql',
      'add_webauthn_credentials.sql'
    ];

    const appliedFileNames = appliedMigrations.map(m => m.filename);
    const pendingMigrations = allMigrationFiles.filter(f => !appliedFileNames.includes(f));

    if (pendingMigrations.length > 0) {
      console.log(`\n⏳ Pending Migrations (${pendingMigrations.length} total):`);
      pendingMigrations.forEach(f => {
        console.log(`   📄 ${f}`);
      });
    } else {
      console.log('\n✅ All known migrations have been applied');
    }

    // Database structure summary
    console.log('\n🗄️  Database Structure:');
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename
    `;
    console.log(`   Tables (${tables.length}):`, tables.map(t => t.tablename).join(', '));

    // WebAuthn specific check
    const webauthnExists = tables.some(t => t.tablename === 'webauthn_credentials');
    console.log(`   🔐 WebAuthn Support: ${webauthnExists ? '✅ Enabled' : '❌ Not Available'}`);

  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    process.exit(1);
  }
}

// Reset command (use with caution)
async function resetDatabase() {
  console.log('⚠️  WARNING: This will reset the entire database!');
  console.log('This operation cannot be undone.');
  
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Only allow reset in test environment
  if (!databaseUrl.includes('test') && !databaseUrl.includes('localhost')) {
    console.error('❌ Database reset is only allowed for test databases');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log('🗑️  Dropping all tables...');
    
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
      'DROP TABLE IF EXISTS schema_migrations CASCADE'
    ];

    for (const statement of dropStatements) {
      await sql.query(statement);
    }

    console.log('✅ Database reset completed');
    console.log('💡 Run migrations to recreate the database structure');

  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2] || 'run';

  switch (command) {
    case 'run':
    case 'migrate':
      runMigrations();
      break;
    case 'status':
      checkMigrationStatus();
      break;
    case 'reset':
      resetDatabase();
      break;
    default:
      console.log('Usage: node run-migrations-enhanced.js [run|status|reset]');
      console.log('  run    - Apply pending migrations (default)');
      console.log('  status - Check migration status');
      console.log('  reset  - Reset database (test databases only)');
      break;
  }
}

module.exports = { 
  runMigrations, 
  checkMigrationStatus, 
  resetDatabase 
};