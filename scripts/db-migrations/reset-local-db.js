#!/usr/bin/env node

/**
 * Reset local database for contribux
 */

const path = require('path');

// Load environment variables from .env.test
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const { Client } = require('pg');

async function resetDatabase() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL_TEST or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🧹 Resetting database...');

  const client = new Client({
    connectionString: databaseUrl
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Drop all tables in correct order
    console.log('📦 Dropping tables...');
    await client.query(`
      DROP TABLE IF EXISTS user_repository_interactions CASCADE;
      DROP TABLE IF EXISTS contribution_outcomes CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS user_preferences CASCADE;
      DROP TABLE IF EXISTS opportunities CASCADE;
      DROP TABLE IF EXISTS repositories CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS schema_migrations CASCADE;
    `);

    // Drop custom types
    console.log('📦 Dropping types...');
    await client.query(`
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS repository_status CASCADE;
      DROP TYPE IF EXISTS opportunity_status CASCADE;
      DROP TYPE IF EXISTS skill_level CASCADE;
      DROP TYPE IF EXISTS contribution_type CASCADE;
      DROP TYPE IF EXISTS notification_type CASCADE;
      DROP TYPE IF EXISTS outcome_status CASCADE;
    `);

    // Drop functions
    console.log('📦 Dropping functions...');
    await client.query(`
      DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
      DROP FUNCTION IF EXISTS hybrid_search(text, vector, float, float, int) CASCADE;
      DROP FUNCTION IF EXISTS calculate_opportunity_complexity(uuid) CASCADE;
      DROP FUNCTION IF EXISTS match_user_to_opportunities(uuid, int) CASCADE;
    `);

    console.log('✅ Database reset completed');
    
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };