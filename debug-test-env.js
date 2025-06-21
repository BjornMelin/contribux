// Debug test environment
const { config } = require("dotenv");

// Load the same env as tests
config({ path: ".env.test" });

console.log('Environment variables in test context:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL_TEST available?', !!process.env.DATABASE_URL_TEST);
console.log('DATABASE_URL_TEST value:', process.env.DATABASE_URL_TEST?.substring(0, 50) + '...');

// Test the condition from the test file
const hasTestDatabase = process.env.DATABASE_URL_TEST && 
  process.env.DATABASE_URL_TEST !== 'sqlite://localhost/:memory:' &&
  !process.env.DATABASE_URL_TEST.includes('sqlite');

console.log('hasTestDatabase condition result:', hasTestDatabase);

// Test neon connection
const { neon } = require('@neondatabase/serverless');

if (hasTestDatabase) {
  const sql = neon(process.env.DATABASE_URL_TEST);
  console.log('Neon client created');
  
  sql`SELECT 1 as test`
    .then(result => {
      console.log('Connection test successful:', result);
    })
    .catch(error => {
      console.error('Connection test failed:', error.message);
      console.error('Error type:', typeof error);
      console.error('Error properties:', Object.keys(error));
    });
} else {
  console.log('No test database configured, tests would be skipped');
}