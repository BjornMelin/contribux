/**
 * Memory-Optimized Database Connection Pool
 * Manages Neon connections with aggressive memory optimization
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { neon } from '@neondatabase/serverless'

interface PoolConfig {
  maxConnections: number
  idleTimeout: number
  maxLifetime: number
  healthCheckInterval: number
}

interface ConnectionMetrics {
  created: number
  destroyed: number
  active: number
  idle: number
  errors: number
  memoryUsage: number
}

class MemoryOptimizedPool {
  private connections: Map<string, NeonQueryFunction<false, false>> = new Map()
  private connectionMetadata: Map<string, { created: number; lastUsed: number; useCount: number }> =
    new Map()
  private config: PoolConfig
  private metrics: ConnectionMetrics
  private cleanupInterval: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      maxConnections: process.env.NODE_ENV === 'test' ? 2 : 5, // Reduce for tests
      idleTimeout: 60000, // 1 minute
      maxLifetime: 300000, // 5 minutes
      healthCheckInterval: 30000, // 30 seconds
      ...config,
    }

    this.metrics = {
      created: 0,
      destroyed: 0,
      active: 0,
      idle: 0,
      errors: 0,
      memoryUsage: 0,
    }

    this.startHealthMonitoring()
  }

  /**
   * Get or create a connection for the given database URL
   */
  getConnection(databaseUrl: string): NeonQueryFunction<false, false> {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down')
    }

    const connectionKey = this.generateConnectionKey(databaseUrl)

    // Check if we have an existing connection
    let connection = this.connections.get(connectionKey)

    if (!connection) {
      // Check connection limit
      if (this.connections.size >= this.config.maxConnections) {
        this.evictOldestConnection()
      }

      // Create new connection
      connection = this.createConnection(databaseUrl)
      this.connections.set(connectionKey, connection)

      this.connectionMetadata.set(connectionKey, {
        created: Date.now(),
        lastUsed: Date.now(),
        useCount: 0,
      })

      this.metrics.created++
    }

    // Update metadata
    const metadata = this.connectionMetadata.get(connectionKey)
    if (metadata) {
      metadata.lastUsed = Date.now()
      metadata.useCount++
    }

    return this.wrapConnection(connection, connectionKey)
  }

  /**
   * Create a new Neon connection with memory optimization
   */
  private createConnection(databaseUrl: string): NeonQueryFunction<false, false> {
    try {
      const connection = neon(databaseUrl, {
        // Use valid HTTPTransactionOptions for Neon serverless driver
        fetchOptions: {
          // Add connection timeout via fetch options
          signal: AbortSignal.timeout(10000),
        },
      })

      return connection
    } catch (error) {
      this.metrics.errors++
      throw new Error(`Failed to create database connection: ${error}`)
    }
  }

  /**
   * Wrap connection to track usage and implement cleanup
   */
  private wrapConnection(
    connection: NeonQueryFunction<false, false>,
    connectionKey: string
  ): NeonQueryFunction<false, false> {
    return (async (...args: Parameters<typeof connection>) => {
      this.metrics.active++

      try {
        const result = await connection(...args)
        return result
      } catch (error) {
        this.metrics.errors++
        throw error
      } finally {
        this.metrics.active--

        // Update last used time
        const metadata = this.connectionMetadata.get(connectionKey)
        if (metadata) {
          metadata.lastUsed = Date.now()
        }
      }
    }) as NeonQueryFunction<false, false>
  }

  /**
   * Generate a unique key for connection caching
   */
  private generateConnectionKey(databaseUrl: string): string {
    // Extract essential parts of URL for caching key
    try {
      const url = new URL(databaseUrl)
      return `${url.host}:${url.pathname}:${url.searchParams.get('sslmode') || 'require'}`
    } catch {
      // Fallback to hash if URL parsing fails
      return Buffer.from(databaseUrl).toString('base64').substring(0, 32)
    }
  }

  /**
   * Evict oldest unused connection
   */
  private evictOldestConnection(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const entry of Array.from(this.connectionMetadata.entries())) {
      const [key, metadata] = entry
      if (metadata.lastUsed < oldestTime) {
        oldestTime = metadata.lastUsed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.destroyConnection(oldestKey)
    }
  }

  /**
   * Destroy a specific connection
   */
  private destroyConnection(connectionKey: string): void {
    this.connections.delete(connectionKey)
    this.connectionMetadata.delete(connectionKey)
    this.metrics.destroyed++

    // Force garbage collection if available
    if (global.gc && process.env.NODE_ENV === 'test') {
      global.gc()
    }
  }

  /**
   * Start health monitoring and cleanup
   */
  private startHealthMonitoring(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.cleanupInterval = setInterval(() => {
      this.performHealthCheck()
    }, this.config.healthCheckInterval)
  }

  /**
   * Perform health check and cleanup
   */
  private performHealthCheck(): void {
    const now = Date.now()
    const toDestroy: string[] = []

    // Check for idle and expired connections
    for (const entry of Array.from(this.connectionMetadata.entries())) {
      const [key, metadata] = entry
      const idle = now - metadata.lastUsed
      const lifetime = now - metadata.created

      if (idle > this.config.idleTimeout || lifetime > this.config.maxLifetime) {
        toDestroy.push(key)
      }
    }

    // Destroy expired connections
    toDestroy.forEach(key => this.destroyConnection(key))

    // Update metrics
    this.metrics.idle = this.connections.size - this.metrics.active
    this.updateMemoryUsage()
  }

  /**
   * Update memory usage metrics
   */
  private updateMemoryUsage(): void {
    if (process.memoryUsage) {
      this.metrics.memoryUsage = process.memoryUsage().heapUsed
    }
  }

  /**
   * Get pool metrics
   */
  getMetrics(): ConnectionMetrics {
    this.updateMemoryUsage()
    return { ...this.metrics }
  }

  /**
   * Get pool status
   */
  getStatus() {
    return {
      connections: this.connections.size,
      maxConnections: this.config.maxConnections,
      metrics: this.getMetrics(),
      config: this.config,
      isShuttingDown: this.isShuttingDown,
    }
  }

  /**
   * Gracefully shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    // Clear monitoring interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Destroy all connections
    const connectionKeys = Array.from(this.connections.keys())
    connectionKeys.forEach(key => this.destroyConnection(key))

    // Force final garbage collection
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Force cleanup for testing
   */
  forceCleanup(): void {
    this.performHealthCheck()

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
  }
}

// Singleton instance for global use
let globalPool: MemoryOptimizedPool | null = null

/**
 * Get the global memory-optimized pool instance
 */
export function getOptimizedPool(): MemoryOptimizedPool {
  if (!globalPool) {
    globalPool = new MemoryOptimizedPool()
  }
  return globalPool
}

/**
 * Get an optimized database connection
 */
export function getOptimizedConnection(databaseUrl: string): NeonQueryFunction<false, false> {
  const pool = getOptimizedPool()
  return pool.getConnection(databaseUrl)
}

/**
 * Shutdown the global pool
 */
export async function shutdownGlobalPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown()
    globalPool = null
  }
}

/**
 * Get pool metrics for monitoring
 */
export function getPoolMetrics(): ConnectionMetrics {
  if (!globalPool) {
    return {
      created: 0,
      destroyed: 0,
      active: 0,
      idle: 0,
      errors: 0,
      memoryUsage: 0,
    }
  }
  return globalPool.getMetrics()
}

export { MemoryOptimizedPool }
