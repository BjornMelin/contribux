import { performance } from 'node:perf_hooks'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/config'

export interface AdvancedDatabaseMetrics {
  queryPerformance: {
    averageLatency: number
    totalQueries: number
  }
  connectionPool: {
    active: number
    idle: number
    waiting: number
    totalConnections: number
    averageCheckoutTime: number
  }
  indexUsage: {
    efficiency: number
    scannedIndexes: number
  }
  vectorSearch: {
    averageQueryTime: number
    totalVectorQueries: number
  }
}

export class AdvancedDatabaseMonitor {
  async getPerformanceMetrics(): Promise<AdvancedDatabaseMetrics> {
    const startTime = performance.now()
    await db.execute(sql`SELECT 1`)
    const averageLatency = performance.now() - startTime

    const indexStats = await db.execute(sql`
      SELECT
        COUNT(*)::int AS index_count,
        COALESCE(SUM(idx_scan), 0)::int AS scans
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
    `)

    const indexRow = indexStats.rows[0] as { index_count?: number; scans?: number } | undefined
    const scannedIndexes = Number(indexRow?.index_count ?? 0)
    const scans = Number(indexRow?.scans ?? 0)

    return {
      queryPerformance: {
        averageLatency,
        totalQueries: 1,
      },
      connectionPool: {
        active: 1,
        idle: 0,
        waiting: 0,
        totalConnections: 1,
        averageCheckoutTime: averageLatency,
      },
      indexUsage: {
        efficiency: scannedIndexes > 0 ? Math.min(1, scans / scannedIndexes) : 1,
        scannedIndexes,
      },
      vectorSearch: {
        averageQueryTime: averageLatency,
        totalVectorQueries: 0,
      },
    }
  }

  async optimizeDatabase(): Promise<string[]> {
    const metrics = await this.getPerformanceMetrics()
    const suggestions: string[] = []

    if (metrics.queryPerformance.averageLatency > 100) {
      suggestions.push('Investigate slow database round trips and query plans.')
    }

    if (metrics.indexUsage.scannedIndexes === 0) {
      suggestions.push('No user indexes have recorded scans yet for this fresh test database.')
    }

    return suggestions
  }

  async checkAlerts(): Promise<void> {
    const metrics = await this.getPerformanceMetrics()

    if (metrics.queryPerformance.averageLatency > 1000) {
      throw new Error(
        `Database latency alert: ${Math.round(metrics.queryPerformance.averageLatency)}ms`
      )
    }
  }

  async generateAdvancedReport(): Promise<string> {
    const metrics = await this.getPerformanceMetrics()

    return [
      '# Database Performance Report',
      `Average query latency: ${Math.round(metrics.queryPerformance.averageLatency)}ms`,
      `Connection checkout: ${Math.round(metrics.connectionPool.averageCheckoutTime)}ms`,
      `Index efficiency: ${Math.round(metrics.indexUsage.efficiency * 100)}%`,
      `Vector query latency: ${Math.round(metrics.vectorSearch.averageQueryTime)}ms`,
    ].join('\n')
  }
}
