import { type NeonQueryFunction, neon } from '@neondatabase/serverless'
// Drizzle ORM Configuration - Modern Database Layer
// Replaces raw SQL patterns with type-safe queries
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { env } from '@/lib/validation/env'
// Import the consolidated schema from schema.ts
import * as schema from './schema'

/**
 * Enhanced Database Configuration with Neon's Built-in Connection Pooling
 *
 * Following Neon's best practices for serverless environments:
 * - Uses Neon's PgBouncer pooling (up to 10,000 concurrent connections)
 * - Optimized for serverless/edge functions
 * - Eliminates custom connection pooling to prevent double-pooling
 */

// Neon connection configuration optimized for serverless
interface NeonConnectionOptions {
  fetchOptions: {
    cache: 'no-cache' | 'default'
    signal?: AbortSignal
  }
  // Neon-specific optimizations
  pooled?: boolean
  isolationLevel?: 'ReadCommitted' | 'RepeatableRead' | 'Serializable'
}

// Branch-specific connections for different environments with type safety
export const getDatabaseUrl = (branch: 'main' | 'dev' | 'test' = 'main', pooled = true): string => {
  let baseUrl: string

  switch (branch) {
    case 'dev':
      baseUrl = env.DATABASE_URL_DEV || env.DATABASE_URL
      break
    case 'test':
      baseUrl = env.DATABASE_URL_TEST || env.DATABASE_URL
      break
    default:
      baseUrl = env.DATABASE_URL
  }

  // Add Neon's pooler endpoint for connection pooling if requested and not already present
  if (pooled && !baseUrl.includes('-pooler.') && !isLocalPostgres(baseUrl)) {
    // Transform regular Neon endpoint to pooled endpoint
    baseUrl = baseUrl.replace(/(@ep-[^.]+)/, '$1-pooler')
  }

  return baseUrl
}

// Detect if using local PostgreSQL (skip pooling for local dev)
function isLocalPostgres(url: string = env.DATABASE_URL): boolean {
  return (
    process.env.CI === 'true' ||
    process.env.USE_LOCAL_PG === 'true' ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    (url.includes('postgres://') && !url.includes('neon.tech'))
  )
}

// Create optimized Neon connection with built-in pooling
const createNeonConnection = (databaseUrl: string): NeonQueryFunction<false, false> => {
  const connectionOptions: NeonConnectionOptions = {
    fetchOptions: {
      cache: 'no-cache',
      // Add timeout for serverless environments
      signal: AbortSignal.timeout(30000), // 30 second timeout
    },
  }

  return neon(databaseUrl, connectionOptions)
}

// Create Neon connection lazily to avoid build-time issues
// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is validated at startup
const createSql = () => {
  const databaseUrl = getDatabaseUrl('main', true) // Use pooled connection by default
  return createNeonConnection(databaseUrl)
}

// Export a getter function that creates the connection on first use
let sqlInstance: NeonQueryFunction<false, false> | null = null
export const sql = new Proxy({} as NeonQueryFunction<false, false>, {
  get(_target, prop) {
    if (!sqlInstance) {
      sqlInstance = createSql()
    }
    return Reflect.get(sqlInstance, prop)
  },
  apply(_target, thisArg, argArray) {
    if (!sqlInstance) {
      sqlInstance = createSql()
    }
    return Reflect.apply(sqlInstance, thisArg, argArray)
  },
}) as NeonQueryFunction<false, false>

// Advanced vector search configuration with optimized HNSW parameters
export const vectorConfig = {
  // HNSW index parameters optimized for 1536-dimensional embeddings
  efSearch: env.HNSW_EF_SEARCH || 100, // Increased for better recall
  efConstruction: env.HNSW_EF_CONSTRUCTION || 200, // Optimal for build time/quality
  mConnections: env.HNSW_M_CONNECTIONS || 16, // Good balance for 1536 dims

  // Search thresholds optimized for semantic similarity
  similarityThreshold: env.VECTOR_SIMILARITY_THRESHOLD || 0.75, // Tighter threshold
  textWeight: env.HYBRID_SEARCH_TEXT_WEIGHT || 0.3, // Optimized for hybrid search
  vectorWeight: env.HYBRID_SEARCH_VECTOR_WEIGHT || 0.7,

  // Performance tuning
  maxResults: env.VECTOR_MAX_RESULTS || 50,
  batchSize: env.VECTOR_BATCH_SIZE || 100,

  // Cache settings for vector operations
  cacheSize: env.VECTOR_CACHE_SIZE || 1000,
  cacheTtl: env.VECTOR_CACHE_TTL || 3600, // 1 hour
} as const

// Neon-optimized connection configuration for serverless environments
export const connectionConfig = {
  // Neon PgBouncer settings (these are managed by Neon, not configurable)
  // Documented here for reference:
  neonPoolMode: 'transaction', // Neon uses transaction pooling
  neonMaxClientConnections: 10000, // Neon's PgBouncer limit
  neonDefaultPoolSize: '0.9 * max_connections', // Neon's formula

  // Application-level settings for monitoring and timeouts
  connectionTimeout: env.DB_CONNECTION_TIMEOUT || 30000, // 30s for serverless
  queryTimeout: env.DB_QUERY_TIMEOUT || 30000, // 30s for complex queries
  statementTimeout: env.DB_STATEMENT_TIMEOUT || 25000, // 25s to prevent timeouts

  // Health check settings
  healthCheckInterval: env.DB_HEALTH_CHECK_INTERVAL || 60000, // 1 minute
  maxRetries: env.DB_MAX_RETRIES || 3,
  retryDelay: env.DB_RETRY_DELAY || 1000, // 1s base delay

  // Serverless optimizations
  idleTimeout: env.DB_IDLE_TIMEOUT || 5000, // Short for serverless
  maxLifetime: env.DB_MAX_LIFETIME || 300000, // 5 minutes max
} as const

// Create optimized Drizzle database instance lazily to avoid build-time issues
let dbInstance: NeonHttpDatabase<typeof schema> | null = null
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    if (!dbInstance) {
      // Use pooled connection for Drizzle ORM
      const pooledSql = createNeonConnection(getDatabaseUrl('main', true))
      dbInstance = drizzle({
        client: pooledSql,
        schema,
        logger: env.NODE_ENV === 'development',
      })
    }
    return Reflect.get(dbInstance, prop)
  },
}) as NeonHttpDatabase<typeof schema>

// Export database type for dependency injection
export type Database = typeof db

// Database branches configuration with validated values
export const dbBranches = {
  main: env.DB_MAIN_BRANCH || 'main',
  dev: env.DB_DEV_BRANCH || 'dev',
  test: env.DB_TEST_BRANCH || 'test',
} as const

// Database configuration with validated values
export const dbConfig = {
  projectId: env.DB_PROJECT_ID || '',
  ...connectionConfig,
  isNeonPooled: true, // Flag to indicate using Neon's built-in pooling
  poolingProvider: 'neon-pgbouncer', // Document the pooling provider
} as const

// Enhanced connection utilities for different use cases
export const createConnectionByType = {
  // Pooled connection (recommended for most use cases)
  pooled: (branch: 'main' | 'dev' | 'test' = 'main') =>
    createNeonConnection(getDatabaseUrl(branch, true)),

  // Direct connection (for migrations, admin tasks)
  direct: (branch: 'main' | 'dev' | 'test' = 'main') =>
    createNeonConnection(getDatabaseUrl(branch, false)),

  // Edge-optimized connection (ultra-fast for edge functions)
  edge: (branch: 'main' | 'dev' | 'test' = 'main') => {
    const url = getDatabaseUrl(branch, true)
    return neon(url, {
      fetchOptions: {
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000), // 10s timeout for edge
      },
    })
  },
}

// Performance monitoring utilities
export interface QueryMetrics {
  queryTime: number
  resultCount: number
  cacheHit: boolean
  indexUsed: string[]
  poolingProvider: 'neon-pgbouncer'
  connectionType: 'pooled' | 'direct' | 'edge'
}

// Connection health monitoring
export const connectionHealth = {
  async checkPooledConnection(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = performance.now()
    try {
      const pooledSql = createConnectionByType.pooled()
      await pooledSql`SELECT 1 as health_check`
      return {
        healthy: true,
        latency: Math.round(performance.now() - start),
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },

  async checkDirectConnection(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = performance.now()
    try {
      const directSql = createConnectionByType.direct()
      await directSql`SELECT 1 as health_check`
      return {
        healthy: true,
        latency: Math.round(performance.now() - start),
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

// Export the consolidated schema
export { schema }
