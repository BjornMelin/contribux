// Database test utilities for contribux
import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'

// Test database connection utility
export class TestDatabaseHelper {
  public sql: NeonQueryFunction<false, false>

  constructor(connectionUrl?: string) {
    const testUrl = connectionUrl || 
                   process.env.DATABASE_URL_TEST || 
                   process.env.DATABASE_URL
    
    if (!testUrl) {
      throw new Error('No test database URL configured')
    }

    this.sql = neon(testUrl)
  }

  // Test basic connectivity
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.sql`SELECT 1 as test`
      return result.length === 1 && result[0].test === 1
    } catch (error) {
      console.error('Database connection test failed:', error)
      return false
    }
  }

  // Get database version
  async getDatabaseVersion(): Promise<string> {
    const result = await this.sql`SELECT version() as version`
    return result[0].version as string
  }

  // Check if required extensions are installed
  async checkExtensions(): Promise<{ extension: string; installed: boolean; version?: string }[]> {
    const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto']
    
    const extensions = await this.sql`
      SELECT extname, extversion
      FROM pg_extension 
      WHERE extname = ANY(${requiredExtensions})
    `

    return requiredExtensions.map(ext => {
      const found = extensions.find(e => e.extname === ext)
      return {
        extension: ext,
        installed: !!found,
        version: found?.extversion as string
      }
    })
  }

  // Verify table structure
  async checkTables(): Promise<{ table: string; exists: boolean; columns?: number }[]> {
    const requiredTables = [
      'users', 'repositories', 'opportunities', 
      'user_preferences', 'notifications', 
      'contribution_outcomes', 'user_repository_interactions'
    ]

    const tables = await this.sql`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name = ANY(${requiredTables})
    `

    return requiredTables.map(table => {
      const found = tables.find(t => t.table_name === table)
      return {
        table,
        exists: !!found,
        columns: found ? Number(found.column_count) : undefined
      }
    })
  }

  // Check if search functions exist
  async checkSearchFunctions(): Promise<{ function: string; exists: boolean }[]> {
    const requiredFunctions = [
      'hybrid_search_opportunities',
      'hybrid_search_repositories', 
      'search_similar_users',
      'find_matching_opportunities_for_user'
    ]

    const functions = await this.sql`
      SELECT routine_name
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
      AND routine_name = ANY(${requiredFunctions})
    `

    return requiredFunctions.map(func => ({
      function: func,
      exists: functions.some(f => f.routine_name === func)
    }))
  }

  // Check vector indexes
  async checkVectorIndexes(): Promise<{ index: string; table: string; exists: boolean }[]> {
    const expectedIndexes = [
      { index: 'idx_users_profile_embedding_hnsw', table: 'users' },
      { index: 'idx_repositories_embedding_hnsw', table: 'repositories' },
      { index: 'idx_opportunities_title_embedding_hnsw', table: 'opportunities' },
      { index: 'idx_opportunities_description_embedding_hnsw', table: 'opportunities' }
    ]

    const indexes = await this.sql`
      SELECT indexname, tablename
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND indexname LIKE '%hnsw%'
    `

    return expectedIndexes.map(expected => ({
      index: expected.index,
      table: expected.table,
      exists: indexes.some(idx => idx.indexname === expected.index)
    }))
  }

  // Get sample data counts
  async getSampleDataCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    
    const tables = ['users', 'repositories', 'opportunities', 'user_preferences']
    
    for (const table of tables) {
      try {
        // Use individual queries for each table to avoid identifier issues
        let result: any[]
        switch (table) {
          case 'users':
            result = await this.sql`SELECT COUNT(*) as count FROM users`
            break
          case 'repositories':
            result = await this.sql`SELECT COUNT(*) as count FROM repositories`
            break
          case 'opportunities':
            result = await this.sql`SELECT COUNT(*) as count FROM opportunities`
            break
          case 'user_preferences':
            result = await this.sql`SELECT COUNT(*) as count FROM user_preferences`
            break
          default:
            result = [{ count: 0 }]
        }
        counts[table] = Number(result[0].count)
      } catch (error) {
        console.warn(`Failed to count rows in ${table}:`, error)
        counts[table] = 0
      }
    }

    return counts
  }

  // Test vector operations
  async testVectorOperations(): Promise<boolean> {
    try {
      // Create test embeddings
      const testEmbedding1 = new Array(1536).fill(0.1)
      const testEmbedding2 = new Array(1536).fill(0.2)
      
      const embedding1String = `[${testEmbedding1.join(',')}]`
      const embedding2String = `[${testEmbedding2.join(',')}]`

      // Test cosine distance operation
      const result = await this.sql`
        SELECT ${embedding1String}::halfvec(1536) <-> ${embedding2String}::halfvec(1536) as distance
      `

      return typeof result[0].distance === 'number' && result[0].distance > 0
    } catch (error) {
      console.error('Vector operations test failed:', error)
      return false
    }
  }

  // Test search functions with sample data
  async testSearchFunctions(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    try {
      // Test opportunities search
      const oppResults = await this.sql`
        SELECT * FROM hybrid_search_opportunities('javascript', NULL, 1.0, 0.0, 0.1, 5)
      `
      results.hybrid_search_opportunities = Array.isArray(oppResults)

      // Test repositories search  
      const repoResults = await this.sql`
        SELECT * FROM hybrid_search_repositories('javascript', NULL, 1.0, 0.0, 0.1, 5)
      `
      results.hybrid_search_repositories = Array.isArray(repoResults)

      // Test user similarity search
      const testEmbedding = new Array(1536).fill(0)
      const embeddingString = `[${testEmbedding.join(',')}]`
      
      const userResults = await this.sql`
        SELECT * FROM search_similar_users(${embeddingString}::halfvec(1536), 0.1, 3)
      `
      results.search_similar_users = Array.isArray(userResults)

    } catch (error) {
      console.error('Search functions test failed:', error)
      return Object.fromEntries(
        Object.keys(results).map(key => [key, false])
      )
    }

    return results
  }

  // Comprehensive health check
  async performHealthCheck(): Promise<{
    overall: boolean
    details: {
      connection: boolean
      extensions: { extension: string; installed: boolean }[]
      tables: { table: string; exists: boolean }[]
      functions: { function: string; exists: boolean }[]
      indexes: { index: string; exists: boolean }[]
      vectorOps: boolean
      searchFunctions: Record<string, boolean>
      sampleData: Record<string, number>
    }
  }> {
    const connection = await this.testConnection()
    const extensions = await this.checkExtensions()
    const tables = await this.checkTables()
    const functions = await this.checkSearchFunctions()
    const indexes = await this.checkVectorIndexes()
    const vectorOps = await this.testVectorOperations()
    const searchFunctions = await this.testSearchFunctions()
    const sampleData = await this.getSampleDataCounts()

    const overall = connection &&
                   extensions.every(e => e.installed) &&
                   tables.every(t => t.exists) &&
                   functions.every(f => f.exists) &&
                   indexes.every(i => i.exists) &&
                   vectorOps &&
                   Object.values(searchFunctions).every(Boolean)

    return {
      overall,
      details: {
        connection,
        extensions: extensions.map(e => ({ extension: e.extension, installed: e.installed })),
        tables: tables.map(t => ({ table: t.table, exists: t.exists })),
        functions: functions.map(f => ({ function: f.function, exists: f.exists })),
        indexes: indexes.map(i => ({ index: i.index, exists: i.exists })),
        vectorOps,
        searchFunctions,
        sampleData
      }
    }
  }

  // Clean up test data (for test isolation)
  async cleanTestData(): Promise<void> {
    // Delete in reverse dependency order
    await this.sql`DELETE FROM user_repository_interactions`
    await this.sql`DELETE FROM contribution_outcomes`
    await this.sql`DELETE FROM notifications`
    await this.sql`DELETE FROM user_preferences`
    await this.sql`DELETE FROM opportunities`
    await this.sql`DELETE FROM repositories`
    await this.sql`DELETE FROM users`
  }

  // Reset sequences (if any auto-increment fields exist)
  async resetSequences(): Promise<void> {
    // This database uses UUIDs, so no sequences to reset
    // But we can update any counters or view counts
    await this.sql`
      UPDATE opportunities SET 
        view_count = 0, 
        application_count = 0, 
        completion_count = 0
    `
  }
}

// Utility function to create test database helper
export function createTestDatabaseHelper(connectionUrl?: string): TestDatabaseHelper {
  return new TestDatabaseHelper(connectionUrl)
}

// Utility function for test setup
export async function setupTestDatabase(): Promise<TestDatabaseHelper> {
  const helper = createTestDatabaseHelper()
  
  // Verify database is ready
  const isConnected = await helper.testConnection()
  if (!isConnected) {
    throw new Error('Test database is not accessible. Please run: pnpm db:setup')
  }

  return helper
}

// Utility function for test cleanup
export async function cleanupTestDatabase(helper: TestDatabaseHelper): Promise<void> {
  await helper.cleanTestData()
  await helper.resetSequences()
}