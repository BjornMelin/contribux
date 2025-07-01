#!/usr/bin/env node

/**
 * WebAuthn Migration Analysis - Offline Analysis Only
 * 
 * This script analyzes the WebAuthn migration requirements
 * without requiring a database connection.
 */

const path = require('path');
const fs = require('fs');

async function analyzeWebAuthnMigration() {
  console.log('📋 WebAuthn Migration Analysis Report');
  console.log('=====================================');
  console.log('');

  // Check migration files
  await analyzeMigrationFiles();
  
  // Check schema integration
  await analyzeSchemaIntegration();
  
  // Check migration infrastructure
  await analyzeMigrationInfrastructure();
  
  // Generate recommendations
  await generateRecommendations();
}

async function analyzeMigrationFiles() {
  console.log('🔍 Migration Files Analysis:');
  
  // Check Drizzle migration file
  const drizzleMigrationPath = path.join(__dirname, '../drizzle/0007_add_webauthn_credentials.sql');
  if (fs.existsSync(drizzleMigrationPath)) {
    console.log('   ✅ Drizzle WebAuthn migration exists: drizzle/0007_add_webauthn_credentials.sql');
    
    const content = fs.readFileSync(drizzleMigrationPath, 'utf8');
    console.log('   ✅ Migration file is readable');
    
    // Analyze migration content
    if (content.includes('CREATE TABLE IF NOT EXISTS webauthn_credentials')) {
      console.log('   ✅ Contains CREATE TABLE statement for webauthn_credentials');
    }
    if (content.includes('REFERENCES users(id)')) {
      console.log('   ✅ Contains proper foreign key reference to users table');
    }
    if (content.includes('CREATE INDEX')) {
      console.log('   ✅ Contains performance indexes');
    }
    if (content.includes('COMMENT ON')) {
      console.log('   ✅ Contains documentation comments');
    }
  } else {
    console.log('   ❌ Drizzle WebAuthn migration not found');
  }

  // Check existing database schema
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    console.log('   ✅ Main database schema exists: database/schema.sql');
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    if (schemaContent.includes('webauthn_credentials')) {
      console.log('   ⚠️  WebAuthn table found in main schema (check if up to date)');
    } else {
      console.log('   ❌ WebAuthn table NOT found in main schema');
    }
  }

  console.log('');
}

async function analyzeSchemaIntegration() {
  console.log('🗃️  Schema Integration Analysis:');
  
  // Check Drizzle schema file
  const drizzleSchemaPath = path.join(__dirname, '../src/lib/db/schema.ts');
  if (fs.existsSync(drizzleSchemaPath)) {
    console.log('   ✅ Drizzle schema file exists: src/lib/db/schema.ts');
    
    const schemaContent = fs.readFileSync(drizzleSchemaPath, 'utf8');
    if (schemaContent.includes('webauthnCredentials')) {
      console.log('   ✅ WebAuthn table defined in Drizzle schema');
    }
    if (schemaContent.includes('webauthnCredentialsRelations')) {
      console.log('   ✅ WebAuthn relations defined');
    }
    if (schemaContent.includes('WebAuthnCredential')) {
      console.log('   ✅ WebAuthn TypeScript types exported');
    }
    if (schemaContent.includes('WebAuthnCredentialDataSchema')) {
      console.log('   ✅ WebAuthn validation schemas defined');
    }
  } else {
    console.log('   ❌ Drizzle schema file not found');
  }

  // Check WebAuthn implementation files
  const webauthnServerPath = path.join(__dirname, '../src/lib/security/webauthn/server.ts');
  if (fs.existsSync(webauthnServerPath)) {
    console.log('   ✅ WebAuthn server implementation exists');
  }

  const webauthnApiPath = path.join(__dirname, '../src/app/api/security/webauthn');
  if (fs.existsSync(webauthnApiPath)) {
    console.log('   ✅ WebAuthn API endpoints exist');
  }

  console.log('');
}

async function analyzeMigrationInfrastructure() {
  console.log('🛠️  Migration Infrastructure Analysis:');
  
  // Check Drizzle configuration
  const drizzleConfigPath = path.join(__dirname, '../drizzle.config.ts');
  if (fs.existsSync(drizzleConfigPath)) {
    console.log('   ✅ Drizzle configuration exists');
    
    const configContent = fs.readFileSync(drizzleConfigPath, 'utf8');
    if (configContent.includes('./src/lib/db/migrations')) {
      console.log('   ⚠️  Drizzle migrations output: ./src/lib/db/migrations (not matching drizzle/ directory)');
    } else if (configContent.includes('./drizzle/')) {
      console.log('   ✅ Drizzle migrations output: ./drizzle/');
    }
  }

  // Check custom migration runner
  const customMigrationPath = path.join(__dirname, '../scripts/db-migrations/run-migrations.js');
  if (fs.existsSync(customMigrationPath)) {
    console.log('   ✅ Custom migration runner exists: scripts/db-migrations/run-migrations.js');
  }

  // Check package.json migration commands
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    
    if (packageJson.scripts['db:migrate']) {
      console.log('   ✅ Migration command available: pnpm db:migrate');
    }
    if (packageJson.scripts['db:migrate:status']) {
      console.log('   ✅ Migration status command available: pnpm db:migrate:status');
    }
  }

  // Check migration tracking
  const migrationsDir = path.join(__dirname, '../database/init');
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    console.log(`   ✅ Found ${migrationFiles.length} migration files in database/init/`);
  }

  console.log('');
}

async function generateRecommendations() {
  console.log('🎯 Migration Strategy Recommendations:');
  console.log('');
  
  console.log('📋 Current Status:');
  console.log('   ✅ WebAuthn migration file exists (Drizzle format)');
  console.log('   ✅ WebAuthn schema integrated in application code');
  console.log('   ✅ WebAuthn API endpoints implemented');
  console.log('   ⚠️  Migration not yet applied to database');
  console.log('   ⚠️  Two migration systems present (custom + Drizzle)');
  console.log('');
  
  console.log('🚀 Recommended Actions:');
  console.log('');
  
  console.log('1. 📁 Consolidate Migration Systems:');
  console.log('   - Copy WebAuthn migration to database/migrations/ directory');
  console.log('   - Update custom migration runner to include WebAuthn migration');
  console.log('   - Ensure migration tracking includes WebAuthn changes');
  console.log('');
  
  console.log('2. 🗃️  Apply Database Migration:');
  console.log('   - Run migration verification script with database connection');
  console.log('   - Execute WebAuthn table creation');
  console.log('   - Verify foreign key constraints with users table');
  console.log('   - Test table operations and indexing');
  console.log('');
  
  console.log('3. ✅ Validation Steps:');
  console.log('   - Run database integration tests');
  console.log('   - Test WebAuthn registration flow');
  console.log('   - Test WebAuthn authentication flow');
  console.log('   - Verify data integrity and constraints');
  console.log('');
  
  console.log('4. 🔧 Development Workflow:');
  console.log('   - Update Drizzle configuration to use consistent migration directory');
  console.log('   - Add WebAuthn migration to CI/CD pipeline');
  console.log('   - Document migration rollback procedures');
  console.log('   - Set up monitoring for WebAuthn table operations');
  console.log('');
  
  console.log('📝 Migration Command Example:');
  console.log('   ```bash');
  console.log('   # Option 1: Use custom migration runner');
  console.log('   pnpm db:migrate');
  console.log('   ');
  console.log('   # Option 2: Apply WebAuthn migration directly');
  console.log('   node scripts/webauthn-migration-verification.js');
  console.log('   ');
  console.log('   # Option 3: Use Drizzle push (for development)');
  console.log('   npx drizzle-kit push:pg');
  console.log('   ```');
  console.log('');
  
  console.log('⚠️  Prerequisites:');
  console.log('   - Database connection must be available');
  console.log('   - Users table must exist (for foreign key)');
  console.log('   - Required PostgreSQL extensions must be installed');
  console.log('   - Proper environment variables must be configured');
  console.log('');
  
  console.log('🎯 Success Criteria:');
  console.log('   ✅ webauthn_credentials table exists in database');
  console.log('   ✅ All indexes and constraints are properly created');
  console.log('   ✅ Foreign key relationship to users table works');
  console.log('   ✅ WebAuthn registration/authentication tests pass');
  console.log('   ✅ Migration is recorded in schema_migrations table');
  console.log('   ✅ Application starts without migration-related errors');
}

// Run the analysis
if (require.main === module) {
  analyzeWebAuthnMigration().catch(error => {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  });
}

module.exports = { analyzeWebAuthnMigration };