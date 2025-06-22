// Database client utility for tests
// Uses pg driver for local PostgreSQL and neon driver for Neon databases

import { config } from "dotenv";
import { Client } from "pg";
import { neon } from "@neondatabase/serverless";

// Load test environment variables
config({ path: ".env.test" });

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database tests. Check .env.test file.');
}

// Function to execute SQL queries based on the database type
export async function executeSql(query: string, params: any[] = []) {
  if (TEST_DATABASE_URL.includes('localhost') || TEST_DATABASE_URL.includes('127.0.0.1')) {
    // Use pg driver for local PostgreSQL
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    try {
      await client.connect();
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      await client.end();
    }
  } else {
    // Use neon driver for Neon databases
    const sql = neon(TEST_DATABASE_URL);
    return await sql(query, params);
  }
}

// Helper to format arrays for PostgreSQL halfvec type
export function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

// Template literal function for SQL queries
export function sql(strings: TemplateStringsArray, ...values: any[]) {
  // Build the query with placeholders
  let query = strings[0];
  const params: any[] = [];
  
  for (let i = 0; i < values.length; i++) {
    // Check if value is an array of numbers (likely an embedding)
    if (Array.isArray(values[i]) && values[i].length > 0 && typeof values[i][0] === 'number') {
      // Format as PostgreSQL array for halfvec
      params.push(formatVector(values[i]));
    } else {
      params.push(values[i]);
    }
    query += `$${i + 1}${strings[i + 1]}`;
  }
  
  return executeSql(query, params);
}

// Create a client for tests that need persistent connections
export function createTestClient() {
  if (TEST_DATABASE_URL.includes('localhost') || TEST_DATABASE_URL.includes('127.0.0.1')) {
    return new Client({ connectionString: TEST_DATABASE_URL });
  } else {
    throw new Error('Persistent client not supported for Neon databases in tests');
  }
}