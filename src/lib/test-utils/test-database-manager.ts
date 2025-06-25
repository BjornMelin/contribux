/**
 * Test Database Manager
 *
 * Intelligent test database management that chooses the optimal strategy:
 * - PGlite for fast unit/integration tests
 * - Neon branching for staging/production-like tests
 * - Transaction rollback for isolation
 */

import { PGlite } from '@electric-sql/pglite'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { afterAll, afterEach, beforeEach, expect } from 'vitest'
import { NeonBranchManager } from './neon-branch-manager'

// Load test environment
config({ path: '.env.test' })

export type DatabaseStrategy = 'pglite' | 'neon-branch' | 'neon-transaction'

export interface TestDatabaseConfig {
  strategy: DatabaseStrategy
  cleanup: 'rollback' | 'truncate' | 'branch-delete'
  verbose: boolean
}

export interface DatabaseConnection {
  sql: NeonQueryFunction<false, false>
  strategy: DatabaseStrategy
  cleanup: () => Promise<void>
  info: {
    connectionString?: string
    branchId?: string
    performance: 'ultra-fast' | 'fast' | 'production-like'
  }
}

export class TestDatabaseManager {
  private static instance: TestDatabaseManager
  private connections = new Map<string, DatabaseConnection>()
  private branchManager?: NeonBranchManager

  private constructor() {}

  static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager()
    }
    return TestDatabaseManager.instance
  }

  /**
   * Get database connection based on test requirements
   */
  async getConnection(
    testId: string,
    config: Partial<TestDatabaseConfig> = {}
  ): Promise<DatabaseConnection> {
    const finalConfig: TestDatabaseConfig = {
      strategy: this.determineOptimalStrategy(config.strategy),
      cleanup: config.cleanup || 'rollback',
      verbose: config.verbose || false,
    }

    if (this.connections.has(testId)) {
      const connection = this.connections.get(testId)
      if (!connection) {
        throw new Error(`Connection for test ${testId} was unexpectedly undefined`)
      }
      return connection
    }

    const connection = await this.createConnection(testId, finalConfig)
    this.connections.set(testId, connection)

    if (finalConfig.verbose) {
      console.log(
        `🔗 Test "${testId}" using ${connection.strategy} (${connection.info.performance})`
      )
    }

    return connection
  }

  /**
   * Determine optimal database strategy based on environment and requirements
   */
  private determineOptimalStrategy(requestedStrategy?: DatabaseStrategy): DatabaseStrategy {
    // If strategy is explicitly requested, use it
    if (requestedStrategy) {
      return requestedStrategy
    }

    // Check environment variables for override
    const envStrategy = process.env.TEST_DB_STRATEGY as DatabaseStrategy
    if (envStrategy) {
      return envStrategy
    }

    // Always default to PGlite for test environment unless explicitly configured for Neon
    if (process.env.NODE_ENV === 'test') {
      // Only use Neon if explicitly configured with API key and not in CI
      if (process.env.NEON_API_KEY && process.env.CI !== 'true') {
        return 'neon-branch'
      }
      // Default to PGlite for all test scenarios
      return 'pglite'
    }

    // CI environment: always use fast PGlite for speed and reliability
    if (process.env.CI === 'true') {
      return 'pglite'
    }

    // Default to PGlite for maximum speed and zero dependencies
    return 'pglite'
  }

  /**
   * Create database connection based on strategy
   */
  private async createConnection(
    testId: string,
    config: TestDatabaseConfig
  ): Promise<DatabaseConnection> {
    switch (config.strategy) {
      case 'pglite':
        return this.createPGliteConnection(testId, config)

      case 'neon-branch':
        return this.createNeonBranchConnection(testId, config)

      case 'neon-transaction':
        return this.createNeonTransactionConnection(testId, config)

      default:
        throw new Error(`Unknown database strategy: ${config.strategy}`)
    }
  }

  /**
   * Create PGlite in-memory connection
   */
  private async createPGliteConnection(
    _testId: string,
    config: TestDatabaseConfig
  ): Promise<DatabaseConnection> {
    // Create a fresh PGlite instance for each test for better isolation
    const db = new PGlite('memory://')

    // Setup schema after PGlite is ready
    await this.setupSchema(db)

    const sql = this.createNeonCompatibleClient(db)

    return {
      sql,
      strategy: 'pglite',
      cleanup: async () => {
        if (config.cleanup === 'truncate') {
          await this.truncateAllTablesPGlite(db)
        } else {
          // Close the PGlite instance completely for fresh start
          await db.close()
        }
      },
      info: {
        performance: 'ultra-fast',
      },
    }
  }

  /**
   * Create Neon branch connection
   */
  private async createNeonBranchConnection(
    testId: string,
    config: TestDatabaseConfig
  ): Promise<DatabaseConnection> {
    if (!this.branchManager) {
      const apiKey = process.env.NEON_API_KEY
      const projectId = process.env.NEON_PROJECT_ID

      if (!apiKey || !projectId) {
        throw new Error(
          'NEON_API_KEY and NEON_PROJECT_ID environment variables are required for Neon branch strategy'
        )
      }

      this.branchManager = new NeonBranchManager({
        apiKey,
        projectId,
      })
    }

    const branchName = `test-${testId}-${Date.now()}`.toLowerCase().slice(0, 63)
    const branch = await this.branchManager.createBranch({ name: branchName })
    const sql = neon(branch.connectionString)

    return {
      sql,
      strategy: 'neon-branch',
      cleanup: async () => {
        if (config.cleanup === 'branch-delete') {
          await this.branchManager?.deleteBranch(branch.id)
        } else {
          await this.truncateAllTables(sql)
        }
      },
      info: {
        connectionString: branch.connectionString,
        branchId: branch.id,
        performance: 'production-like',
      },
    }
  }

  /**
   * Create Neon transaction-based connection
   */
  private async createNeonTransactionConnection(
    _testId: string,
    config: TestDatabaseConfig
  ): Promise<DatabaseConnection> {
    const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('No database connection string available for transaction-based testing')
    }

    const sql = neon(connectionString)

    return {
      sql,
      strategy: 'neon-transaction',
      cleanup: async () => {
        if (config.cleanup === 'rollback') {
          // Transaction rollback is handled by test framework
        } else {
          await this.truncateAllTables(sql)
        }
      },
      info: {
        connectionString,
        performance: 'fast',
      },
    }
  }

  /**
   * Setup database schema
   */
  private async setupSchema(
    db: PGlite | { query: (sql: string, params?: unknown[]) => Promise<unknown> }
  ): Promise<void> {
    const isPGlite = db instanceof PGlite

    const queries = []

    // Only add extensions for real PostgreSQL, not PGlite
    if (!isPGlite) {
      queries.push(
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
        'CREATE EXTENSION IF NOT EXISTS "vector"'
      )
    }

    // Table creation queries with PGlite compatibility
    const uuidDefault = isPGlite ? 'gen_random_uuid()' : 'uuid_generate_v4()'
    const vectorType = isPGlite ? 'TEXT' : 'vector(1536)' // PGlite doesn't support vector type

    // Build table creation queries with proper string interpolation
    const userTableSQL = `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      github_id TEXT UNIQUE NOT NULL,
      github_username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      preferences JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`

    const repositoriesTableSQL = `CREATE TABLE IF NOT EXISTS repositories (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      github_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT UNIQUE NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      language TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      health_score REAL DEFAULT 0.0,
      last_analyzed TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`

    const opportunitiesTableSQL = `CREATE TABLE IF NOT EXISTS opportunities (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
      issue_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      labels JSONB DEFAULT '[]',
      difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
      estimated_hours INTEGER,
      skills_required JSONB DEFAULT '[]',
      ai_analysis JSONB DEFAULT '{}',
      score REAL DEFAULT 0.0,
      embedding ${vectorType},
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(repository_id, issue_number)
    )`

    const userSkillsTableSQL = `CREATE TABLE IF NOT EXISTS user_skills (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      proficiency_level TEXT CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced')),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, skill_name)
    )`

    queries.push(
      userTableSQL,
      repositoriesTableSQL,
      opportunitiesTableSQL,
      userSkillsTableSQL,

      // Indexes for performance
      'CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language)',
      'CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC)',
      'CREATE INDEX IF NOT EXISTS idx_opportunities_difficulty ON opportunities(difficulty)',
      'CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_name)'
    )

    // Only add vector index for real PostgreSQL
    if (!isPGlite) {
      queries.push(
        `CREATE INDEX IF NOT EXISTS idx_opportunities_embedding 
         ON opportunities USING hnsw (embedding vector_cosine_ops)
         WITH (m = 16, ef_construction = 64)`
      )
    }

    for (const query of queries) {
      try {
        if ('query' in db) {
          await db.query(query)
        } else {
          await (db as PGlite).query(query)
        }
      } catch (error) {
        console.error(`Failed to execute schema query: ${query.substring(0, 100)}`, error)
        throw error
      }
    }
  }

  /**
   * Truncate all tables for cleanup
   */
  private async truncateAllTables(sql: NeonQueryFunction<false, false>): Promise<void> {
    const tables = ['user_skills', 'opportunities', 'repositories', 'users']

    for (const table of tables) {
      try {
        await sql`TRUNCATE TABLE ${table} CASCADE`
      } catch (error) {
        // Table might not exist, continue
        console.warn(`Failed to truncate ${table}:`, error)
      }
    }
  }

  /**
   * Create Neon-compatible SQL client from PGlite
   */
  private createNeonCompatibleClient(db: PGlite): NeonQueryFunction<false, false> {
    return async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      try {
        // Use parameterized queries for PGlite - it supports them natively
        let query = strings[0]
        const params: unknown[] = []

        for (let i = 0; i < values.length; i++) {
          query += `$${i + 1}${strings[i + 1] || ''}`
          params.push(values[i])
        }

        // Handle vector operations for PGlite compatibility
        if (query && (query.includes('<=>') || query.includes('<->') || query.includes('#>'))) {
          // For PGlite, convert vector similarity queries to simple text-based comparisons
          // This is a testing fallback - real vector search requires PostgreSQL + pgvector

          // Remove vector comparison parameters that PGlite can't handle
          const vectorParamIndices: number[] = []
          let vectorReplacedQuery = query || ''

          // Find vector comparison patterns and track parameter indices to remove
          const vectorPatterns = [
            /(\w+)\s*<=>\s*\$(\d+)/g,
            /(\w+)\s*<->\s*\$(\d+)/g,
            /(\w+)\s*#>\s*\$(\d+)/g,
          ]

          for (const pattern of vectorPatterns) {
            vectorReplacedQuery = vectorReplacedQuery.replace(
              pattern,
              (_match, _field, paramIndex) => {
                vectorParamIndices.push(Number.parseInt(paramIndex) - 1)
                return 'RANDOM()' // Replace with random value for testing
              }
            )
          }

          // Remove vector parameters from params array
          vectorParamIndices.sort((a, b) => b - a) // Sort in descending order
          for (const index of vectorParamIndices) {
            if (index >= 0 && index < params.length) {
              params.splice(index, 1)
            }
          }

          // Renumber remaining parameters
          let paramCount = 1
          if (vectorReplacedQuery) {
            query = vectorReplacedQuery.replace(/\$\d+/g, () => `$${paramCount++}`)
          }
        }

        const result = await db.query(query || '', params)
        return result.rows as unknown[]
      } catch (error) {
        console.error('SQL query failed:', error)
        throw error
      }
    } as NeonQueryFunction<false, false>
  }

  /**
   * Truncate all tables for PGlite cleanup
   */
  private async truncateAllTablesPGlite(db: PGlite): Promise<void> {
    const tables = ['user_skills', 'opportunities', 'repositories', 'users']

    for (const table of tables) {
      try {
        await db.query(`TRUNCATE TABLE ${table} CASCADE`)
      } catch (error) {
        // Table might not exist, continue
        console.warn(`Failed to truncate ${table} in PGlite:`, error)
      }
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    for (const [testId, connection] of this.connections) {
      try {
        await connection.cleanup()
      } catch (error) {
        console.error(`Failed to cleanup connection for test ${testId}:`, error)
      }
    }
    this.connections.clear()
  }

  /**
   * Get statistics about active connections
   */
  getStats() {
    const connections = Array.from(this.connections.values())
    return {
      totalConnections: connections.length,
      byStrategy: connections.reduce(
        (acc, conn) => {
          acc[conn.strategy] = (acc[conn.strategy] || 0) + 1
          return acc
        },
        {} as Record<DatabaseStrategy, number>
      ),
      byPerformance: connections.reduce(
        (acc, conn) => {
          acc[conn.info.performance] = (acc[conn.info.performance] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      ),
    }
  }
}

/**
 * Convenience function for getting database connection in tests
 */
export async function getTestDatabase(
  testName: string,
  config: Partial<TestDatabaseConfig> = {}
): Promise<DatabaseConnection> {
  const manager = TestDatabaseManager.getInstance()
  return manager.getConnection(testName, config)
}

/**
 * Vitest helper for automatic database lifecycle management
 */
export function setupTestDatabase(config: Partial<TestDatabaseConfig> = {}) {
  let connection: DatabaseConnection | null = null
  const manager = TestDatabaseManager.getInstance()

  beforeEach(async () => {
    const testName = expect.getState().currentTestName || 'unknown'
    connection = await manager.getConnection(testName, config)
  })

  afterEach(async () => {
    if (connection) {
      await connection.cleanup()
      connection = null
    }
  })

  afterAll(async () => {
    await manager.cleanup()
  })

  return {
    getConnection: () => connection,
    getSql: () => connection?.sql,
    getInfo: () => connection?.info,
  }
}
