#!/usr/bin/env node
// Script to set up the test database schema

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function setupTestDatabase() {
  const dbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ No database URL configured');
    process.exit(1);
  }

  console.log('🔗 Connecting to test database...');
  const sql = neon(dbUrl);

  try {
    // Read and apply schema
    console.log('📖 Reading schema file...');
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the entire schema at once using sql.unsafe
    console.log('📝 Applying complete schema...');
    
    try {
      await sql`${sql.unsafe(schema)}`;
      console.log('✅ Schema applied successfully');
    } catch (error) {
      // If complete execution fails, try to execute statement by statement
      console.log('⚠️  Complete schema execution failed, trying statement by statement...');
      
      // Split the schema more carefully, handling PostgreSQL-specific syntax
      const statements = [];
      let currentStatement = '';
      let inFunction = false;
      let dollarQuoteCount = 0;
      
      const lines = schema.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine.startsWith('--') || trimmedLine === '') {
          continue;
        }
        
        // Track dollar-quoted strings (for functions)
        if (trimmedLine.includes('$$')) {
          dollarQuoteCount += (trimmedLine.match(/\$\$/g) || []).length;
          inFunction = dollarQuoteCount % 2 !== 0;
        }
        
        currentStatement += line + '\n';
        
        // End of statement if we hit semicolon and not in a function
        if (trimmedLine.endsWith(';') && !inFunction) {
          statements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
      
      // Add remaining statement if any
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }
      
      console.log(`📝 Applying ${statements.length} SQL statements individually...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          try {
            await sql`${sql.unsafe(statement)}`;
            console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
          } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('does not exist')) {
              console.log(`⚠️  Statement ${i + 1} skipped (${error.message.split('\n')[0]})`);
            } else {
              console.error(`❌ Statement ${i + 1} failed:`, error.message);
              console.error(`Statement: ${statement.substring(0, 200)}...`);
            }
          }
        }
      }
    }

    // Read and apply search functions
    const searchFunctionsPath = path.join(__dirname, '..', 'database', 'search_functions.sql');
    if (fs.existsSync(searchFunctionsPath)) {
      console.log('📖 Reading search functions...');
      const searchFunctions = fs.readFileSync(searchFunctionsPath, 'utf8');
      
      // Parse search functions more carefully
      const functionStatements = [];
      let currentStatement = '';
      let inFunction = false;
      let dollarQuoteCount = 0;
      
      const lines = searchFunctions.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine.startsWith('--') || trimmedLine === '') {
          continue;
        }
        
        // Track dollar-quoted strings (for functions)
        if (trimmedLine.includes('$$')) {
          dollarQuoteCount += (trimmedLine.match(/\$\$/g) || []).length;
          inFunction = dollarQuoteCount % 2 !== 0;
        }
        
        currentStatement += line + '\n';
        
        // End of statement if we hit semicolon and not in a function
        if (trimmedLine.endsWith(';') && !inFunction) {
          functionStatements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
      
      // Add remaining statement if any
      if (currentStatement.trim()) {
        functionStatements.push(currentStatement.trim());
      }

      console.log(`📝 Applying ${functionStatements.length} search function statements...`);

      for (let i = 0; i < functionStatements.length; i++) {
        const statement = functionStatements[i];
        if (statement.trim()) {
          try {
            await sql`${sql.unsafe(statement)}`;
            console.log(`✅ Function statement ${i + 1}/${functionStatements.length} executed`);
          } catch (error) {
            if (error.message.includes('already exists')) {
              console.log(`⚠️  Function ${i + 1} already exists, skipping`);
            } else {
              console.error(`❌ Function statement ${i + 1} failed:`, error.message);
            }
          }
        }
      }
    }

    // Apply sample data if exists
    const sampleDataPath = path.join(__dirname, '..', 'database', 'init', '04-sample-data.sql');
    if (fs.existsSync(sampleDataPath)) {
      console.log('📖 Reading sample data...');
      const sampleData = fs.readFileSync(sampleDataPath, 'utf8');
      
      // Parse sample data statements
      const sampleStatements = [];
      let currentStatement = '';
      let inFunction = false;
      let dollarQuoteCount = 0;
      
      const lines = sampleData.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine.startsWith('--') || trimmedLine === '') {
          continue;
        }
        
        // Track dollar-quoted strings (for functions)
        if (trimmedLine.includes('$$')) {
          dollarQuoteCount += (trimmedLine.match(/\$\$/g) || []).length;
          inFunction = dollarQuoteCount % 2 !== 0;
        }
        
        currentStatement += line + '\n';
        
        // End of statement if we hit semicolon and not in a function
        if (trimmedLine.endsWith(';') && !inFunction) {
          sampleStatements.push(currentStatement.trim());
          currentStatement = '';
        }
      }
      
      // Add remaining statement if any
      if (currentStatement.trim()) {
        sampleStatements.push(currentStatement.trim());
      }

      console.log(`📝 Applying ${sampleStatements.length} sample data statements...`);
      
      // Sample data statements parsed successfully

      for (let i = 0; i < sampleStatements.length; i++) {
        const statement = sampleStatements[i];
        if (statement.trim()) {
          try {
            const result = await sql`${sql.unsafe(statement)}`;
            console.log(`✅ Sample data statement ${i + 1}/${sampleStatements.length} executed (${result.length} rows affected)`);
          } catch (error) {
            if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
              console.log(`⚠️  Sample data ${i + 1} already exists, skipping`);
            } else {
              console.error(`❌ Sample data statement ${i + 1} failed:`, error.message);
              console.error(`Statement preview: ${statement.substring(0, 100)}...`);
            }
          }
        }
      }
    }

    console.log('🎉 Test database setup complete!');
    
    // Verify setup by checking tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log(`📊 Created ${tables.length} tables:`, tables.map(t => t.table_name).join(', '));

  } catch (error) {
    console.error('❌ Test database setup failed:', error);
    process.exit(1);
  }
}

setupTestDatabase();