// Contribux Database Client - Enhanced with Neon's Built-in Connection Pooling
// Modernized to use Neon's PgBouncer pooling instead of custom connection management

import type { NeonQueryFunction } from '@neondatabase/serverless'
import type { DrizzleConfig } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { env } from '@/lib/validation/env'
import { getDatabaseUrl } from './config'
import * as schema from './schema'

// Re-export enhanced configuration
export { getDatabaseUrl, createConnectionByType, connectionHealth, schema } from './config'

// Create connection based on environment with Neon pooling
function getDatabaseUrlForEnvironment(): string {
  // Use environment-specific URLs for branch-based development
  if (env.NODE_ENV === 'test' && env.DATABASE_URL_TEST) {
    return getDatabaseUrl('test', true) // Use pooled connection for tests
  }

  if (env.NODE_ENV === 'development' && env.DATABASE_URL_DEV) {
    return getDatabaseUrl('dev', true) // Use pooled connection for dev
  }

  return getDatabaseUrl('main', true) // Use pooled connection for production
}

// Detect if we should use local PostgreSQL
function isLocalPostgres(): boolean {
  const databaseUrl = getDatabaseUrlForEnvironment()
  return (
    process.env.CI === 'true' ||
    process.env.USE_LOCAL_PG === 'true' ||
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1')
  )
}

// Type for our database instance
type DatabaseInstance = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>

// Type for SQL instance (union of possible SQL clients)
type SqlInstance = NeonQueryFunction<false, false> | unknown

// Create database connection based on environment
async function createDatabase(): Promise<{
  db: DatabaseInstance
  sql: SqlInstance
}> {
  const databaseUrl = getDatabaseUrlForEnvironment()
  const drizzleConfig: DrizzleConfig<typeof schema> = {
    schema,
    logger: env.NODE_ENV === 'development',
  }

  if (isLocalPostgres()) {
    // Use postgres.js for local PostgreSQL (better compatibility with Drizzle)
    const postgres = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')

    const sql = postgres.default(databaseUrl, {
      max: 10, // Connection pool size for local development
      idle_timeout: 30,
    })

    const db = drizzle(sql, drizzleConfig)

    return { db, sql }
  }

  // Use Neon with built-in PgBouncer pooling for production/cloud
  const { neon } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-http')

  // Create pooled Neon connection using the enhanced config
  const sql = neon(databaseUrl, {
    fetchOptions: {
      cache: 'no-cache',
      // Optimized timeout for serverless environments
      signal: AbortSignal.timeout(30000),
    },
  })

  const db = drizzle(sql, drizzleConfig)

  return { db, sql }
}

// Create singleton instance
let dbInstance: DatabaseInstance | null = null
let sqlInstance: SqlInstance | null = null

// Initialize database connection with Neon pooling
async function initializeDatabase() {
  if (!dbInstance) {
    const result = await createDatabase()
    dbInstance = result.db
    sqlInstance = result.sql
  }
  return { db: dbInstance, sql: sqlInstance }
}

// Export database instance (lazy initialization)
export const db = new Proxy({} as DatabaseInstance, {
  get(_, prop) {
    if (!dbInstance) {
      throw new Error('Database not initialized. Await db operations to trigger initialization.')
    }
    return (dbInstance as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Export SQL instance for raw queries with pooling
export const sql = new Proxy({} as NeonQueryFunction<false, false>, {
  get(_, prop) {
    if (!sqlInstance) {
      throw new Error('SQL client not initialized. Await db operations to trigger initialization.')
    }
    return (sqlInstance as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Ensure database is initialized before first use
const initPromise = initializeDatabase()

// Helper types
export type Database = typeof db
export type Schema = typeof schema

// Enhanced database health check with pooling validation
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean
  latency?: number
  error?: string
  pooling?: {
    provider: string
    enabled: boolean
    connectionType: string
  }
}> {
  const start = performance.now()

  try {
    // Ensure database is initialized
    await initPromise
    const { sql } = await initializeDatabase()

    // Simple health check query
    await (sql as NeonQueryFunction<false, false>)`SELECT 1 as health_check`

    const latency = performance.now() - start
    return {
      healthy: true,
      latency: Math.round(latency),
      pooling: {
        provider: 'neon-pgbouncer',
        enabled: !isLocalPostgres(),
        connectionType: isLocalPostgres() ? 'direct' : 'pooled',
      },
    }
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      pooling: {
        provider: isLocalPostgres() ? 'local-postgres' : 'neon-pgbouncer',
        enabled: !isLocalPostgres(),
        connectionType: isLocalPostgres() ? 'direct' : 'pooled',
      },
    }
  }
}

// Vector search utilities
export const vectorUtils = {
  // Parse vector embedding from text storage
  parseEmbedding(embeddingText?: string): number[] | null {
    if (!embeddingText) return null

    try {
      return JSON.parse(embeddingText)
    } catch {
      return null
    }
  },

  // Serialize vector embedding for text storage
  serializeEmbedding(embedding: number[]): string {
    return JSON.stringify(embedding)
  },

  // Calculate cosine similarity between vectors
  cosineSimilarity(a: number[], b: number[]): number {
    // Add null safety checks
    if (!a || !b || a.length !== b.length || a.length === 0) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      // Add null safety for array elements
      const aVal = a[i] ?? 0
      const bVal = b[i] ?? 0

      dotProduct += aVal * bVal
      normA += aVal * aVal
      normB += bVal * bVal
    }

    if (normA === 0 || normB === 0) return 0

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  },
}

// Performance monitoring for database operations with pooling metrics
const metrics = new Map<string, number[]>()

function startTimer(operation: string): () => number {
  const start = performance.now()

  return () => {
    const duration = performance.now() - start
    recordMetric(operation, duration)
    return duration
  }
}

function recordMetric(operation: string, duration: number) {
  if (!metrics.has(operation)) {
    metrics.set(operation, [])
  }

  const measurements = metrics.get(operation)
  if (measurements) {
    measurements.push(duration)

    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift()
    }
  }
}

export function getDbStats(operation: string) {
  const measurements = metrics.get(operation) || []
  if (measurements.length === 0) return null

  const sorted = [...measurements].sort((a, b) => a - b)
  const len = sorted.length

  // Add safety checks for array access
  return {
    count: len,
    min: sorted[0] ?? 0,
    max: sorted[len - 1] ?? 0,
    avg: len > 0 ? sorted.reduce((a, b) => a + b, 0) / len : 0,
    p95: sorted[Math.floor(len * 0.95)] ?? 0,
    pooling: {
      provider: isLocalPostgres() ? 'local-postgres' : 'neon-pgbouncer',
      enabled: !isLocalPostgres(),
    },
  }
}

// Middleware for timing database operations with pooling awareness
function withTiming<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const timer = startTimer(operation)

  return fn().finally(() => {
    const duration = timer()

    // Log slow queries only in development with pooling context
    if (env.NODE_ENV === 'development' && duration > 1000) {
    }
  })
}

// Export commonly used database operations with timing and pooling optimization
export const timedDb = {
  select: <T>(fn: () => Promise<T>) => withTiming('select', fn),
  insert: <T>(fn: () => Promise<T>) => withTiming('insert', fn),
  update: <T>(fn: () => Promise<T>) => withTiming('update', fn),
  delete: <T>(fn: () => Promise<T>) => withTiming('delete', fn),
  upsert: <T>(fn: () => Promise<T>) => withTiming('upsert', fn),
}
