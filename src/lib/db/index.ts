// Contribux Database Client - Drizzle ORM
// Phase 3: Simplified connection management replacing 270+ lines of custom pooling

import { env } from '@/lib/validation/env'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Create connection based on environment
function getDatabaseUrl(): string {
  // Use environment-specific URLs for branch-based development
  if (env.NODE_ENV === 'test' && env.DATABASE_URL_TEST) {
    return env.DATABASE_URL_TEST
  }

  if (env.NODE_ENV === 'development' && env.DATABASE_URL_DEV) {
    return env.DATABASE_URL_DEV
  }

  return env.DATABASE_URL
}

// Create Neon connection with optimized settings
const sql = neon(getDatabaseUrl(), {
  // Simplified connection options (replacing complex pooling)
  fetchOptions: {
    cache: 'no-cache', // Ensure fresh connections
  },
})

// Create Drizzle instance with schema
export const db = drizzle(sql, {
  schema,
  logger: env.NODE_ENV === 'development', // Log queries in development only
})

// Export schema for use in queries
export { schema }

// Export connection utility for direct SQL when needed
export { sql }

// Helper types
export type Database = typeof db
export type Schema = typeof schema

// Database health check utility
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean
  latency?: number
  error?: string
}> {
  const start = performance.now()

  try {
    // Simple health check query
    await sql`SELECT 1 as health_check`

    const latency = performance.now() - start
    return {
      healthy: true,
      latency: Math.round(latency),
    }
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
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

// Performance monitoring for database operations
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
  }
}

// Middleware for timing database operations
function withTiming<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const timer = startTimer(operation)

  return fn().finally(() => {
    const _duration = timer()

    // Slow queries would be logged by external monitoring system (e.g., Sentry)
    // This prevents console pollution while maintaining performance tracking
  })
}

// Security validator functionality is implemented in schema.ts

// Export commonly used database operations with timing
export const timedDb = {
  select: <T>(fn: () => Promise<T>) => withTiming('select', fn),
  insert: <T>(fn: () => Promise<T>) => withTiming('insert', fn),
  update: <T>(fn: () => Promise<T>) => withTiming('update', fn),
  delete: <T>(fn: () => Promise<T>) => withTiming('delete', fn),
  upsert: <T>(fn: () => Promise<T>) => withTiming('upsert', fn),
}
