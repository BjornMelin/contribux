#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function reloadSearchFunctions() {
  // Get test database URL based on environment configuration
  const testUrl = process.env.DATABASE_URL_TEST;
  const devUrl = process.env.DATABASE_URL_DEV;
  const mainUrl = process.env.DATABASE_URL;

  let connectionString;
  if (testUrl) {
    connectionString = testUrl;
  } else if (devUrl) {
    console.warn('Using DEV database URL for reload. Consider setting DATABASE_URL_TEST.');
    connectionString = devUrl;
  } else if (mainUrl) {
    console.warn('Using main database URL for reload. This is not recommended for production.');
    connectionString = mainUrl;
  } else {
    throw new Error('No database URL found. Please set DATABASE_URL_TEST, DATABASE_URL_DEV, or DATABASE_URL environment variable.');
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    console.log('Reloading search functions...');
    
    // First, drop existing functions to avoid type conflicts
    console.log('Dropping existing functions...');
    await pool.query(`
      DROP FUNCTION IF EXISTS get_repository_health_metrics(UUID);
      DROP FUNCTION IF EXISTS find_matching_opportunities_for_user(UUID, DOUBLE PRECISION, INTEGER);
      DROP FUNCTION IF EXISTS hybrid_search_repositories(TEXT, halfvec(1536), DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
      DROP FUNCTION IF EXISTS hybrid_search_opportunities(TEXT, halfvec(1536), DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
      DROP FUNCTION IF EXISTS search_similar_users(halfvec(1536), DOUBLE PRECISION, INTEGER);
      DROP FUNCTION IF EXISTS get_trending_opportunities(INTEGER, INTEGER, INTEGER);
    `);
    
    // Read the search functions SQL file
    const sqlFile = path.join(__dirname, '..', 'database', 'init', 'search_functions.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await pool.query(sql);
    
    console.log('Search functions reloaded successfully!');
  } catch (error) {
    console.error('Error reloading search functions:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

reloadSearchFunctions();