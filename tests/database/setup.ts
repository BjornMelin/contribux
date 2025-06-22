// Database test setup - uses real database connection for integration tests
import { config } from "dotenv";

// Load test environment variables
config({ path: ".env.test" });

// Ensure NODE_ENV is set to test
process.env.NODE_ENV = 'test';

// Verify we have the required database URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database tests. Check .env.test file.');
}

// Export test database URL for use in tests
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

console.log('Database tests using:', TEST_DATABASE_URL.replace(/:[^:@]*@/, ':***@'));