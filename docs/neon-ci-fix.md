# Neon Serverless CI/Local PostgreSQL Fix

## Problem

The Neon serverless driver (`@neondatabase/serverless`) was failing in CI with a "fetch failed" error when trying to connect to a local PostgreSQL instance. This is because:

1. **Neon uses HTTP/WebSocket connections** instead of traditional TCP connections
2. **Local PostgreSQL only supports TCP connections**
3. The Neon driver attempts to make HTTP requests to the PostgreSQL server, which fails

## Solution

We implemented a **conditional driver selection** pattern that automatically detects the environment and uses the appropriate database driver:

- **Production/Neon Cloud**: Uses `@neondatabase/serverless` (HTTP/WebSocket)
- **CI/Local Development**: Uses standard `pg` driver (TCP)

### Implementation Details

#### 1. Migration Script (`scripts/db-migrations/run-migrations-enhanced.cjs`)

Added conditional logic in the `createDatabaseClient` function:

```javascript
async function createDatabaseClient(connectionString) {
  const isLocalPostgres = 
    process.env.CI === 'true' || 
    process.env.USE_LOCAL_PG === 'true' ||
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')

  if (isLocalPostgres) {
    // Use standard pg driver for local PostgreSQL
    const pg = require('pg')
    const { Client } = pg
    
    const client = new Client({ connectionString })
    await client.connect()

    // Create wrapper matching Neon's tagged template interface
    const wrapper = async function(strings, ...values) {
      // Convert to parameterized query
      let query = strings[0] || ''
      const params = []
      
      for (let i = 0; i < values.length; i++) {
        params.push(values[i])
        query += `$${i + 1}${strings[i + 1] || ''}`
      }
      
      const result = await client.query(query, params)
      return result.rows
    }

    // Add query method for compatibility
    wrapper.query = async (query, params) => {
      const result = await client.query(query, params)
      return result
    }

    wrapper._pgClient = client
    return wrapper
  } else {
    // Use Neon serverless driver for production
    const { neon } = require('@neondatabase/serverless')
    const sql = neon(connectionString)
    
    // Add query method for compatibility
    sql.query = async (queryText, params) => {
      const result = await sql(queryText)
      return { rows: result }
    }
    
    return sql
  }
}
```

#### 2. Main Database Connection (`src/lib/db/index.ts`)

Updated to support conditional Drizzle ORM adapters:

```typescript
async function createDatabase() {
  const databaseUrl = getDatabaseUrl()
  const drizzleConfig = {
    schema,
    logger: env.NODE_ENV === 'development',
  }

  if (isLocalPostgres()) {
    // Use postgres.js for local PostgreSQL
    const postgres = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    
    const sql = postgres.default(databaseUrl, {
      max: 10,
      idle_timeout: 30,
    })
    
    const db = drizzle(sql, drizzleConfig)
    return { db, sql }
  } else {
    // Use Neon for production
    const { neon } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-http')
    
    const sql = neon(databaseUrl, {
      fetchOptions: { cache: 'no-cache' },
    })
    
    const db = drizzle(sql, drizzleConfig)
    return { db, sql }
  }
}
```

#### 3. Client Factory (`src/lib/db/client-factory.ts`)

Created a reusable factory for conditional database clients:

```typescript
export async function createDatabaseClient(connectionString: string): Promise<DatabaseClient> {
  const isLocalPostgres = 
    process.env.CI === 'true' || 
    process.env.USE_LOCAL_PG === 'true' ||
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')

  if (isLocalPostgres) {
    // pg driver implementation
  } else {
    // Neon driver implementation
  }
}
```

### Environment Detection

The solution detects local PostgreSQL environments by checking:

1. **CI environment variable**: `CI=true` (set by GitHub Actions)
2. **Explicit flag**: `USE_LOCAL_PG=true` 
3. **Connection string**: Contains `localhost` or `127.0.0.1`

### Dependencies Added

- `pg`: Standard PostgreSQL driver for Node.js (TCP connections)
- `postgres`: Modern PostgreSQL driver for use with Drizzle ORM

## Usage

### In CI (GitHub Actions)

The CI environment automatically uses the local PostgreSQL driver:

```yaml
- name: Run migrations
  env:
    CI: true  # Automatically set by GitHub Actions
    DATABASE_URL: postgresql://test:test@localhost:5432/contribux_test
  run: pnpm db:migrate
```

### Local Development

For local PostgreSQL development:

```bash
# Option 1: Use localhost in connection string
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb pnpm dev

# Option 2: Set explicit flag
USE_LOCAL_PG=true DATABASE_URL=postgresql://user:pass@remote:5432/mydb pnpm dev
```

### Production (Neon)

No changes needed - continues to use Neon serverless driver:

```bash
DATABASE_URL=postgresql://user:pass@ep-example.neon.tech/neondb pnpm start
```

## Testing

Test the conditional driver with:

```bash
# Test script for conditional driver
node scripts/test-conditional-db.js

# Test database connection
node scripts/test-db-connection.js

# Run migrations (will use appropriate driver)
pnpm db:migrate
```

## Benefits

1. **No CI configuration changes** - Works with existing PostgreSQL service
2. **No proxy required** - Avoids complexity of running Neon proxy in CI
3. **Unified interface** - Same code works with both drivers
4. **Automatic detection** - No manual configuration needed
5. **Backwards compatible** - Existing Neon deployments continue to work

## Alternative Solutions (Not Used)

1. **Neon Proxy**: Run `local-neon-http-proxy` Docker container in CI
   - Pros: Uses Neon driver everywhere
   - Cons: Additional CI complexity, potential reliability issues

2. **Neon Local**: Use full Neon Local container
   - Pros: Complete Neon compatibility
   - Cons: Heavy resource usage, slow CI startup

3. **Mock/Stub**: Mock database in tests
   - Pros: Fast tests
   - Cons: Not testing real database behavior

## Troubleshooting

### "fetch failed" Error
- Ensure the conditional logic is detecting your environment correctly
- Check that `pg` package is installed: `pnpm add pg`

### Connection Timeout
- Local PostgreSQL may need different timeout settings
- Adjust connection pool settings in `postgres.js` config

### Type Errors
- Ensure both `@neondatabase/serverless` and `postgres` packages are installed
- TypeScript types are handled through conditional imports