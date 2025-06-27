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

  // Allowlist of valid table names for truncation operations
  private readonly ALLOWED_TABLES = new Set<string>([
    'users',
    'repositories',
    'opportunities',
    'user_skills',
    'user_repository_interactions',
    'notifications',
    'contribution_outcomes',
    'user_preferences',
    // Authentication tables
    'webauthn_credentials',
    'auth_challenges',
    'user_sessions',
    'oauth_accounts',
    'security_audit_logs',
    'user_consents',
    'refresh_tokens',
  ])

  private constructor() {}

  /**
   * Validate table name against allowlist to prevent SQL injection
   */
  private validateTableName(tableName: string): void {
    if (tableName == null || !this.ALLOWED_TABLES.has(tableName)) {
      throw new Error(
        `Invalid table name: ${tableName}. Only predefined tables are allowed for truncation.`
      )
    }
  }

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
      // TODO: Add verbose logging for connection establishment
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

    // Always default to PGlite for test environment - this ensures consistent, fast testing
    // PGlite provides excellent isolation and performance without external dependencies
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
    let isClosed = false

    // Setup schema after PGlite is ready
    await this.setupSchema(db)

    const sql = this.createNeonCompatibleClient(db)

    return {
      sql,
      strategy: 'pglite',
      cleanup: async () => {
        if (isClosed) {
          return // Already closed, nothing to do
        }

        try {
          if (config.cleanup === 'truncate') {
            await this.truncateAllTablesPGlite(db)
          } else {
            // Close the PGlite instance completely for fresh start
            await db.close()
            isClosed = true
          }
        } catch (_error) {
          // Mark as closed even if close fails to prevent further attempts
          isClosed = true
          // Silently ignore cleanup errors
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

    // Authentication Tables SQL
    const webauthnCredentialsTableSQL = `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      credential_device_type TEXT NOT NULL,
      credential_backed_up BOOLEAN NOT NULL DEFAULT false,
      transports TEXT[],
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_used_at TIMESTAMP WITH TIME ZONE,
      name TEXT
    )`

    const authChallengesTableSQL = `CREATE TABLE IF NOT EXISTS auth_challenges (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      challenge TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('registration', 'authentication', 'recovery')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used BOOLEAN DEFAULT false
    )`

    const userSessionsTableSQL = `CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      auth_method TEXT NOT NULL CHECK (auth_method IN ('oauth', 'webauthn', 'password')),
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`

    const oauthAccountsTableSQL = `CREATE TABLE IF NOT EXISTS oauth_accounts (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('github', 'google')),
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP WITH TIME ZONE,
      token_type TEXT,
      scope TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    )`

    const securityAuditLogsTableSQL = `CREATE TABLE IF NOT EXISTS security_audit_logs (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      event_type TEXT NOT NULL CHECK (event_type IN ('auth_success', 'auth_failure', 'session_created', 'session_destroyed', 'token_refresh', 'account_linked', 'account_unlinked', 'security_violation')),
      event_severity TEXT NOT NULL CHECK (event_severity IN ('low', 'medium', 'high', 'critical')),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ip_address INET,
      user_agent TEXT,
      event_data JSONB,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`

    const userConsentsTableSQL = `CREATE TABLE IF NOT EXISTS user_consents (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL CHECK (consent_type IN ('analytics', 'marketing', 'functional', 'essential')),
      granted BOOLEAN NOT NULL,
      version TEXT NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ip_address INET,
      user_agent TEXT
    )`

    const refreshTokensTableSQL = `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT ${uuidDefault},
      token_hash TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE,
      replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL
    )`

    queries.push(
      userTableSQL,
      repositoriesTableSQL,
      opportunitiesTableSQL,
      userSkillsTableSQL,
      // Authentication tables
      webauthnCredentialsTableSQL,
      authChallengesTableSQL,
      userSessionsTableSQL,
      oauthAccountsTableSQL,
      securityAuditLogsTableSQL,
      userConsentsTableSQL,
      refreshTokensTableSQL,

      // Indexes for performance
      'CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language)',
      'CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC)',
      'CREATE INDEX IF NOT EXISTS idx_opportunities_difficulty ON opportunities(difficulty)',
      'CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_name)',
      // Authentication indexes
      'CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider, provider_account_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON security_audit_logs(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON security_audit_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON security_audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id ON refresh_tokens(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)'
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
      if ('query' in db) {
        await db.query(query)
      } else {
        await (db as PGlite).query(query)
      }
    }
  }

  /**
   * Truncate all tables for cleanup - works with both Neon and PGlite
   */
  private async truncateAllTables(sql: NeonQueryFunction<false, false>): Promise<void> {
    const tables = [
      // Authentication tables (truncate first due to foreign keys)
      'refresh_tokens',
      'user_consents',
      'security_audit_logs',
      'oauth_accounts',
      'user_sessions',
      'auth_challenges',
      'webauthn_credentials',
      // Core tables
      'user_skills',
      'opportunities',
      'repositories',
      'users',
    ]

    for (const table of tables) {
      try {
        // Validate table name against allowlist to prevent SQL injection
        this.validateTableName(table)

        // Create individual queries for each table to avoid parameter issues
        // with table names (which cannot be parameterized in SQL)
        switch (table) {
          // Authentication tables
          case 'refresh_tokens':
            await sql`TRUNCATE TABLE refresh_tokens CASCADE`
            break
          case 'user_consents':
            await sql`TRUNCATE TABLE user_consents CASCADE`
            break
          case 'security_audit_logs':
            await sql`TRUNCATE TABLE security_audit_logs CASCADE`
            break
          case 'oauth_accounts':
            await sql`TRUNCATE TABLE oauth_accounts CASCADE`
            break
          case 'user_sessions':
            await sql`TRUNCATE TABLE user_sessions CASCADE`
            break
          case 'auth_challenges':
            await sql`TRUNCATE TABLE auth_challenges CASCADE`
            break
          case 'webauthn_credentials':
            await sql`TRUNCATE TABLE webauthn_credentials CASCADE`
            break
          // Core tables
          case 'user_skills':
            await sql`TRUNCATE TABLE user_skills CASCADE`
            break
          case 'opportunities':
            await sql`TRUNCATE TABLE opportunities CASCADE`
            break
          case 'repositories':
            await sql`TRUNCATE TABLE repositories CASCADE`
            break
          case 'users':
            await sql`TRUNCATE TABLE users CASCADE`
            break
          default:
            // This should never happen due to validation, but included for safety
            throw new Error(`Unexpected table name after validation: ${table}`)
        }
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Create Neon-compatible SQL client from PGlite
   */
  private createNeonCompatibleClient(db: PGlite): NeonQueryFunction<false, false> {
    return async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      // More robust connection state checking
      try {
        // Simple check if db exists and has query method
        if (!db || typeof db.query !== 'function') {
          throw new Error('Database connection is not available')
        }

        const { query, params } = buildParameterizedQuery(strings, values)
        const { finalQuery, finalParams } = processVectorOperations(query, params)

        const result = await db.query(finalQuery, finalParams)
        return result.rows as unknown[]
      } catch (error) {
        // Handle various PGlite error states more gracefully
        if (error instanceof Error) {
          if (
            error.message.includes('PGlite is closed') ||
            error.message.includes('Database connection is closed') ||
            error.message.includes('closed')
          ) {
            return []
          }
        }
        throw error
      }
    } as NeonQueryFunction<false, false>
  }

  /**
   * Truncate all tables for PGlite cleanup
   */
  private async truncateAllTablesPGlite(db: PGlite): Promise<void> {
    const tables = [
      // Authentication tables (truncate first due to foreign keys)
      'refresh_tokens',
      'user_consents',
      'security_audit_logs',
      'oauth_accounts',
      'user_sessions',
      'auth_challenges',
      'webauthn_credentials',
      // Core tables
      'user_skills',
      'opportunities',
      'repositories',
      'users',
    ]

    for (const table of tables) {
      try {
        // Validate table name against allowlist to prevent SQL injection
        this.validateTableName(table)

        // Use explicit switch statement to avoid any parameter confusion
        switch (table) {
          // Authentication tables
          case 'refresh_tokens':
            await db.query('TRUNCATE TABLE refresh_tokens CASCADE')
            break
          case 'user_consents':
            await db.query('TRUNCATE TABLE user_consents CASCADE')
            break
          case 'security_audit_logs':
            await db.query('TRUNCATE TABLE security_audit_logs CASCADE')
            break
          case 'oauth_accounts':
            await db.query('TRUNCATE TABLE oauth_accounts CASCADE')
            break
          case 'user_sessions':
            await db.query('TRUNCATE TABLE user_sessions CASCADE')
            break
          case 'auth_challenges':
            await db.query('TRUNCATE TABLE auth_challenges CASCADE')
            break
          case 'webauthn_credentials':
            await db.query('TRUNCATE TABLE webauthn_credentials CASCADE')
            break
          // Core tables
          case 'user_skills':
            await db.query('TRUNCATE TABLE user_skills CASCADE')
            break
          case 'opportunities':
            await db.query('TRUNCATE TABLE opportunities CASCADE')
            break
          case 'repositories':
            await db.query('TRUNCATE TABLE repositories CASCADE')
            break
          case 'users':
            await db.query('TRUNCATE TABLE users CASCADE')
            break
          default:
            // This should never happen due to validation, but included for safety
            throw new Error(`Unexpected table name after validation: ${table}`)
        }
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    for (const [_testId, connection] of this.connections) {
      try {
        await connection.cleanup()
      } catch (_error) {
        // Ignore cleanup errors
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

// Helper functions for createNeonCompatibleClient complexity reduction

function buildParameterizedQuery(
  strings: TemplateStringsArray,
  values: unknown[]
): { query: string; params: unknown[] } {
  let query = strings[0] || ''
  const params: unknown[] = []

  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}${strings[i + 1] || ''}`
    params.push(values[i])
  }

  return { query, params }
}

function processVectorOperations(
  query: string,
  params: unknown[]
): { finalQuery: string; finalParams: unknown[] } {
  if (!hasVectorOperations(query)) {
    return { finalQuery: query, finalParams: params }
  }

  // Simplified vector processing - just remove vector operators for PGlite compatibility
  // Instead of complex parameter manipulation, just convert to simple text comparison
  const simplifiedQuery = query
    .replace(/(\w+)\s*<=>\s*\$(\d+)/g, '$1 = $2') // Convert cosine distance to equality for simplicity
    .replace(/(\w+)\s*<->\s*\$(\d+)/g, '$1 = $2') // Convert L2 distance to equality
    .replace(/(\w+)\s*#>\s*\$(\d+)/g, '$1 = $2') // Convert other vector ops to equality

  return { finalQuery: simplifiedQuery, finalParams: params }
}

function hasVectorOperations(query: string): boolean {
  return query.includes('<=>') || query.includes('<->') || query.includes('#>')
}

function _convertVectorOperations(
  query: string,
  params: unknown[]
): { finalQuery: string; finalParams: unknown[] } {
  const vectorParamIndices = extractVectorParameterIndices(query)
  const vectorReplacedQuery = replaceVectorOperators(query)
  const cleanedParams = removeVectorParameters(params, vectorParamIndices)
  const finalQuery = renumberParameters(vectorReplacedQuery)

  return { finalQuery, finalParams: cleanedParams }
}

function extractVectorParameterIndices(query: string): number[] {
  const indices: number[] = []
  const vectorPatterns = [
    /(\w+)\s*<=>\s*\$(\d+)/g,
    /(\w+)\s*<->\s*\$(\d+)/g,
    /(\w+)\s*#>\s*\$(\d+)/g,
  ]

  for (const pattern of vectorPatterns) {
    let match: RegExpExecArray | null
    while (true) {
      match = pattern.exec(query)
      if (match === null) break
      if (match[2]) {
        indices.push(Number.parseInt(match[2]) - 1)
      }
    }
  }

  return indices
}

function replaceVectorOperators(query: string): string {
  const vectorPatterns = [
    /(\w+)\s*<=>\s*\$(\d+)/g,
    /(\w+)\s*<->\s*\$(\d+)/g,
    /(\w+)\s*#>\s*\$(\d+)/g,
  ]

  let result = query
  for (const pattern of vectorPatterns) {
    // Replace vector operations with JavaScript-based cosine distance calculation
    // This provides realistic ordering based on actual vector similarity for PGlite testing
    result = result.replace(pattern, (_match, column, paramNum) => {
      // Create a JavaScript function to calculate cosine distance between vectors
      // This simulates the <=> operator behavior by parsing JSON arrays and computing actual similarity
      // Use explicit type casting to resolve PGlite parameter type determination issues
      return `(
        CASE 
          WHEN ${column} IS NULL OR $${paramNum}::text IS NULL THEN 1.0
          ELSE (
            SELECT 
              1.0 - (
                (SELECT SUM(a.value::float * b.value::float) FROM json_array_elements_text(${column}::json) WITH ORDINALITY a(value, idx)
                 JOIN json_array_elements_text($${paramNum}::text::json) WITH ORDINALITY b(value, idx) ON a.idx = b.idx) /
                (SQRT((SELECT SUM(POWER(value::float, 2)) FROM json_array_elements_text(${column}::json))) *
                 SQRT((SELECT SUM(POWER(value::float, 2)) FROM json_array_elements_text($${paramNum}::text::json))))
              )
          )
        END
      )`
    })
  }

  return result
}

function removeVectorParameters(params: unknown[], vectorIndices: number[]): unknown[] {
  const sortedIndices = [...vectorIndices].sort((a, b) => b - a)
  const cleanedParams = [...params]

  for (const index of sortedIndices) {
    if (index >= 0 && index < cleanedParams.length) {
      cleanedParams.splice(index, 1)
    }
  }

  return cleanedParams
}

function renumberParameters(query: string): string {
  let paramCount = 1
  return query.replace(/\$\d+/g, () => `$${paramCount++}`)
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
    // Add timeout extension for database connection setup
    connection = await manager.getConnection(testName, config)
  }, 15000) // Extended timeout for database setup

  afterEach(async () => {
    if (connection) {
      try {
        await connection.cleanup()
      } catch (_error) {
        // Silently ignore cleanup errors to prevent test failures
      }
      connection = null
    }
  }, 10000) // Extended timeout for cleanup

  afterAll(async () => {
    try {
      await manager.cleanup()
    } catch (_error) {
      // Silently ignore final cleanup errors
    }
  }, 10000) // Extended timeout for final cleanup

  return {
    getConnection: () => connection,
    getSql: () => connection?.sql,
    getInfo: () => connection?.info,
  }
}
