const { neon } = require('@neondatabase/serverless');

// Use the test database URL directly
const DATABASE_URL_TEST = "postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-hidden-union-a8b34lc5-pooler.eastus2.azure.neon.tech/neondb?sslmode=require";

async function testConnection() {
  try {
    const sql = neon(DATABASE_URL_TEST);
    
    console.log('Testing database connection...');
    const version = await sql`SELECT version()`;
    console.log('✅ Connection successful:', version[0].version);
    
    console.log('Testing webauthn_credentials table...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'webauthn_credentials'
    `;
    console.log('Tables found:', tables);
    console.log('Is array?', Array.isArray(tables));
    console.log('Length:', tables?.length);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testConnection();