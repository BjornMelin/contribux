// Local PostgreSQL database test utilities for contribux
import { Pool, type PoolClient } from 'pg'

// Local test database connection utility using standard pg driver
export class LocalTestDatabaseHelper {
  private pool: Pool

  constructor(connectionUrl?: string) {
    const testUrl = connectionUrl || 
                   process.env.DATABASE_URL_TEST || 
                   process.env.DATABASE_URL ||
                   'postgresql://postgres:password@localhost:5433/contribux_test'
    
    this.pool = new Pool({
      connectionString: testUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }

  // Test basic connectivity
  async testConnection(): Promise<boolean> {
    let client: PoolClient | null = null
    try {
      client = await this.pool.connect()
      const result = await client.query('SELECT 1 as test')
      return result.rows.length === 1 && result.rows[0].test === 1
    } catch (error) {
      console.error('Database connection test failed:', error)
      return false
    } finally {
      if (client) client.release()
    }
  }

  // Get database version
  async getDatabaseVersion(): Promise<string> {
    const client = await this.pool.connect()
    try {
      const result = await client.query('SELECT version() as version')
      return result.rows[0].version
    } finally {
      client.release()
    }
  }

  // Check if required extensions are installed
  async checkExtensions(): Promise<{ extension: string; installed: boolean; version?: string }[]> {
    const client = await this.pool.connect()
    try {
      const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto']
      
      const result = await client.query(`
        SELECT extname, extversion
        FROM pg_extension 
        WHERE extname = ANY($1)
      `, [requiredExtensions])

      return requiredExtensions.map(ext => {
        const found = result.rows.find(e => e.extname === ext)
        return {
          extension: ext,
          installed: !!found,
          version: found?.extversion
        }
      })
    } finally {
      client.release()
    }
  }

  // Verify table structure
  async checkTables(): Promise<{ table: string; exists: boolean; columns?: number }[]> {
    const client = await this.pool.connect()
    try {
      const requiredTables = [
        'users', 'repositories', 'opportunities', 
        'user_preferences', 'notifications', 
        'contribution_outcomes', 'user_repository_interactions'
      ]

      const result = await client.query(`
        SELECT table_name, 
               (SELECT COUNT(*) FROM information_schema.columns 
                WHERE table_name = t.table_name AND table_schema = 'public') as column_count
        FROM information_schema.tables t
        WHERE table_schema = 'public' 
        AND table_name = ANY($1)
      `, [requiredTables])

      return requiredTables.map(table => {
        const found = result.rows.find(t => t.table_name === table)
        return {
          table,
          exists: !!found,
          columns: found ? Number(found.column_count) : undefined
        }
      })
    } finally {
      client.release()
    }
  }

  // Check if search functions exist
  async checkSearchFunctions(): Promise<{ function: string; exists: boolean }[]> {
    const client = await this.pool.connect()
    try {
      const requiredFunctions = [
        'hybrid_search_opportunities',
        'hybrid_search_repositories', 
        'search_similar_users',
        'find_matching_opportunities_for_user'
      ]

      const result = await client.query(`
        SELECT routine_name
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = ANY($1)
      `, [requiredFunctions])

      return requiredFunctions.map(func => ({
        function: func,
        exists: result.rows.some(f => f.routine_name === func)
      }))
    } finally {
      client.release()
    }
  }

  // Check vector indexes
  async checkVectorIndexes(): Promise<{ index: string; table: string; exists: boolean }[]> {
    const client = await this.pool.connect()
    try {
      const expectedIndexes = [
        { index: 'idx_users_profile_embedding_hnsw', table: 'users' },
        { index: 'idx_repositories_embedding_hnsw', table: 'repositories' },
        { index: 'idx_opportunities_title_embedding_hnsw', table: 'opportunities' },
        { index: 'idx_opportunities_description_embedding_hnsw', table: 'opportunities' }
      ]

      const result = await client.query(`
        SELECT indexname, tablename
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE '%hnsw%'
      `)

      return expectedIndexes.map(expected => ({
        index: expected.index,
        table: expected.table,
        exists: result.rows.some(idx => idx.indexname === expected.index)
      }))
    } finally {
      client.release()
    }
  }

  // Get sample data counts
  async getSampleDataCounts(): Promise<Record<string, number>> {
    const client = await this.pool.connect()
    try {
      const counts: Record<string, number> = {}
      
      const tables = ['users', 'repositories', 'opportunities', 'user_preferences']
      
      for (const table of tables) {
        try {
          const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`)
          counts[table] = Number(result.rows[0].count)
        } catch (error) {
          console.warn(`Failed to count rows in ${table}:`, error)
          counts[table] = 0
        }
      }

      return counts
    } finally {
      client.release()
    }
  }

  // Test vector operations
  async testVectorOperations(): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      // Create test embeddings
      const testEmbedding1 = new Array(1536).fill(0.1)
      const testEmbedding2 = new Array(1536).fill(0.2)
      
      const embedding1String = `[${testEmbedding1.join(',')}]`
      const embedding2String = `[${testEmbedding2.join(',')}]`

      // Test cosine distance operation
      const result = await client.query(`
        SELECT $1::halfvec(1536) <-> $2::halfvec(1536) as distance
      `, [embedding1String, embedding2String])

      return typeof result.rows[0].distance === 'number' && result.rows[0].distance > 0
    } catch (error) {
      console.error('Vector operations test failed:', error)
      return false
    } finally {
      client.release()
    }
  }

  // Test search functions with sample data
  async testSearchFunctions(): Promise<Record<string, boolean>> {
    const client = await this.pool.connect()
    try {
      const results: Record<string, boolean> = {}

      // Test opportunities search
      const oppResults = await client.query(`
        SELECT * FROM hybrid_search_opportunities('javascript', NULL, 1.0, 0.0, 0.1, 5)
      `)
      results.hybrid_search_opportunities = Array.isArray(oppResults.rows)

      // Test repositories search  
      const repoResults = await client.query(`
        SELECT * FROM hybrid_search_repositories('javascript', NULL, 1.0, 0.0, 0.1, 5)
      `)
      results.hybrid_search_repositories = Array.isArray(repoResults.rows)

      // Test user similarity search
      const testEmbedding = new Array(1536).fill(0)
      const embeddingString = `[${testEmbedding.join(',')}]`
      
      const userResults = await client.query(`
        SELECT * FROM search_similar_users($1::halfvec(1536), 0.1, 3)
      `, [embeddingString])
      results.search_similar_users = Array.isArray(userResults.rows)

      return results
    } catch (error) {
      console.error('Search functions test failed:', error)
      return {
        hybrid_search_opportunities: false,
        hybrid_search_repositories: false,
        search_similar_users: false
      }
    } finally {
      client.release()
    }
  }

  // Execute raw SQL query
  async query(sql: string, params?: any[]): Promise<any[]> {
    const client = await this.pool.connect()
    try {
      const result = await client.query(sql, params)
      return result.rows
    } finally {
      client.release()
    }
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
    const client = await this.pool.connect()
    try {
      // Delete in reverse dependency order
      await client.query('DELETE FROM user_repository_interactions')
      await client.query('DELETE FROM contribution_outcomes')
      await client.query('DELETE FROM notifications')
      await client.query('DELETE FROM user_preferences')
      await client.query('DELETE FROM opportunities')
      await client.query('DELETE FROM repositories')
      await client.query('DELETE FROM users')
    } finally {
      client.release()
    }
  }

  // Reset sequences (if any auto-increment fields exist)
  async resetSequences(): Promise<void> {
    const client = await this.pool.connect()
    try {
      // This database uses UUIDs, so no sequences to reset
      // But we can update any counters or view counts
      await client.query(`
        UPDATE opportunities SET 
          view_count = 0, 
          application_count = 0, 
          completion_count = 0
      `)
    } finally {
      client.release()
    }
  }

  // Close database connections
  async close(): Promise<void> {
    await this.pool.end()
  }
}

// Utility function to create local test database helper
export function createLocalTestDatabaseHelper(connectionUrl?: string): LocalTestDatabaseHelper {
  return new LocalTestDatabaseHelper(connectionUrl)
}

// Utility function for test setup
export async function setupLocalTestDatabase(): Promise<LocalTestDatabaseHelper> {
  const helper = createLocalTestDatabaseHelper()
  
  // Verify database is ready
  const isConnected = await helper.testConnection()
  if (!isConnected) {
    throw new Error('Test database is not accessible. Please run: pnpm db:setup')
  }

  return helper
}

// Utility function for test cleanup
export async function cleanupLocalTestDatabase(helper: LocalTestDatabaseHelper): Promise<void> {
  await helper.cleanTestData()
  await helper.resetSequences()
}