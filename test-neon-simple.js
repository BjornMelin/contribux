// Simple test to see if the issue is with our approach
const { neon } = require('@neondatabase/serverless');

const DATABASE_URL_TEST = 'postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-hidden-union-a8b34lc5-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

console.log('Testing Neon driver...');
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV);

try {
  const sql = neon(DATABASE_URL_TEST);
  console.log('Neon client created successfully');
  
  // Test basic query
  sql`SELECT 1 as test`
    .then(result => {
      console.log('Query successful');
      console.log('Result type:', typeof result);
      console.log('Is array:', Array.isArray(result));
      console.log('Result:', result);
      
      // Test table query
      return sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webauthn_credentials'`;
    })
    .then(tables => {
      console.log('Table query successful');
      console.log('Tables result:', tables);
      console.log('Found webauthn_credentials:', tables?.length > 0);
    })
    .catch(error => {
      console.error('Error details:');
      console.error('- Message:', error.message);
      console.error('- Type:', typeof error);
      console.error('- Constructor:', error.constructor.name);
      console.error('- Stack:', error.stack);
      console.error('- Properties:', Object.keys(error));
    });
    
} catch (error) {
  console.error('Failed to create Neon client:', error);
}