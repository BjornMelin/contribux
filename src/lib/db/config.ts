import { env } from '@/lib/validation/env'
import { neon } from '@neondatabase/serverless'
// Drizzle ORM Configuration - Modern Database Layer
// Replaces raw SQL patterns with type-safe queries
import { drizzle } from 'drizzle-orm/neon-http'
// Import the consolidated schema from schema.ts
import * as schema from './schema'

// Create Neon connection lazily to avoid build-time issues
// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is validated at startup
const createSql = () => neon(env.DATABASE_URL!)

// Export a getter function that creates the connection on first use
let sqlInstance: any | null = null
export const sql = new Proxy({} as any, {
  get(target, prop) {
    if (!sqlInstance) {
      sqlInstance = createSql()
    }
    return Reflect.get(sqlInstance as any, prop)
  },
  apply(target, thisArg, argArray) {
    if (!sqlInstance) {
      sqlInstance = createSql()
    }
    return Reflect.apply(sqlInstance as any, thisArg, argArray)
  }
}) as any

// Branch-specific connections for different environments with type safety
export const getDatabaseUrl = (branch: 'main' | 'dev' | 'test' = 'main'): string => {
  switch (branch) {
    case 'dev':
      return env.DATABASE_URL_DEV || env.DATABASE_URL
    case 'test':
      return env.DATABASE_URL_TEST || env.DATABASE_URL
    default:
      return env.DATABASE_URL
  }
}

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

// Connection pool configuration optimized for Neon serverless
export const connectionConfig = {
  // Optimized for Neon's serverless architecture
  poolMin: Math.max(env.DB_POOL_MIN || 2, 2), // Minimum for availability
  poolMax: Math.min(env.DB_POOL_MAX || 15, 20), // Prevent connection exhaustion
  poolIdleTimeout: env.DB_POOL_IDLE_TIMEOUT || 30000, // 30s
  connectionTimeout: env.DB_CONNECTION_TIMEOUT || 10000, // 10s
  queryTimeout: env.DB_QUERY_TIMEOUT || 30000, // 30s for complex queries

  // Health check settings
  healthCheckInterval: env.DB_HEALTH_CHECK_INTERVAL || 60000, // 1 minute
  maxRetries: env.DB_MAX_RETRIES || 3,
  retryDelay: env.DB_RETRY_DELAY || 1000, // 1s base delay
} as const

// Create optimized Drizzle database instance lazily to avoid build-time issues
let dbInstance: any | null = null
export const db = new Proxy({} as any, {
  get(target, prop) {
    if (!dbInstance) {
      dbInstance = drizzle({ client: sql as any, schema })
    }
    return Reflect.get(dbInstance as any, prop)
  }
}) as any

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
} as const

// Performance monitoring utilities
export interface QueryMetrics {
  queryTime: number
  resultCount: number
  cacheHit: boolean
  indexUsed: string[]
}

// Export the consolidated schema
export { schema }
