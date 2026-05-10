import { performance } from 'node:perf_hooks'

import { sql } from 'drizzle-orm'

import { db } from '@/lib/db/config'
import { createErrorLogger } from '@/lib/logging/pino-config'

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
    totalIndexes: number
    scannedIndexes: number
  }
  vectorSearch: {
    averageQueryTime: number
    totalVectorQueries: number
  }
}

interface ConnectionStatsRow {
  active?: number
  idle?: number
  waiting?: number
  total_connections?: number
}

interface IndexStatsRow {
  index_count?: number
  scanned_count?: number
  scans?: number
}

export class AdvancedDatabaseMonitor {
  private metricsUnavailable(metrics: AdvancedDatabaseMetrics): boolean {
    return (
      !Number.isFinite(metrics.queryPerformance.averageLatency) ||
      metrics.queryPerformance.averageLatency < 0 ||
      !Number.isFinite(metrics.connectionPool.averageCheckoutTime) ||
      metrics.connectionPool.averageCheckoutTime < 0 ||
      !Number.isFinite(metrics.vectorSearch.averageQueryTime) ||
      metrics.vectorSearch.averageQueryTime < 0
    )
  }

  async getPerformanceMetrics(): Promise<AdvancedDatabaseMetrics> {
    try {
      const startTime = performance.now()
      await db.execute(sql`SELECT 1`)
      const averageLatency = performance.now() - startTime

      const indexStats = await db.execute(sql`
        SELECT
          COUNT(*)::int AS index_count,
          COUNT(*) FILTER (WHERE idx_scan > 0)::int AS scanned_count,
          COALESCE(SUM(idx_scan), 0)::int AS scans
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
      `)

      const connectionStats = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE state = 'active')::int AS active,
          COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
          COUNT(*) FILTER (WHERE wait_event IS NOT NULL)::int AS waiting,
          COUNT(*)::int AS total_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `)

      const vectorStats = await db.execute(sql`
        SELECT COALESCE(SUM(idx_scan), 0)::int AS scans
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
          AND (indexrelname ILIKE '%embedding%' OR indexrelname ILIKE '%vector%')
      `)

      const indexRow = indexStats.rows[0] as IndexStatsRow | undefined
      const connectionRow = connectionStats.rows[0] as ConnectionStatsRow | undefined
      const vectorRow = vectorStats.rows[0] as { scans?: number } | undefined
      const totalIndexes = Number(indexRow?.index_count ?? 0)
      const scannedIndexes = Number(indexRow?.scanned_count ?? 0)
      const vectorQueryCount = Number(vectorRow?.scans ?? 0)

      return {
        queryPerformance: {
          averageLatency,
          totalQueries: 1,
        },
        connectionPool: {
          active: Number(connectionRow?.active ?? 0),
          idle: Number(connectionRow?.idle ?? 0),
          waiting: Number(connectionRow?.waiting ?? 0),
          totalConnections: Number(connectionRow?.total_connections ?? 0),
          averageCheckoutTime: averageLatency,
        },
        indexUsage: {
          efficiency: totalIndexes > 0 ? Math.min(1, scannedIndexes / totalIndexes) : 0,
          totalIndexes,
          scannedIndexes,
        },
        vectorSearch: {
          averageQueryTime: vectorQueryCount > 0 ? averageLatency : 0,
          totalVectorQueries: vectorQueryCount,
        },
      }
    } catch (error) {
      createErrorLogger({
        component: 'AdvancedDatabaseMonitor',
        operation: 'getPerformanceMetrics',
      }).warn({ error }, 'Failed to collect database performance metrics')

      return {
        queryPerformance: {
          averageLatency: -1,
          totalQueries: 0,
        },
        connectionPool: {
          active: 0,
          idle: 0,
          waiting: 0,
          totalConnections: 0,
          averageCheckoutTime: -1,
        },
        indexUsage: {
          efficiency: 0,
          totalIndexes: 0,
          scannedIndexes: 0,
        },
        vectorSearch: {
          averageQueryTime: -1,
          totalVectorQueries: 0,
        },
      }
    }
  }

  async optimizeDatabase(metrics?: AdvancedDatabaseMetrics): Promise<string[]> {
    const currentMetrics = metrics ?? (await this.getPerformanceMetrics())
    const suggestions: string[] = []

    if (this.metricsUnavailable(currentMetrics)) {
      return [
        'Database metrics are unavailable; inspect database connectivity before optimization.',
      ]
    }

    if (currentMetrics.queryPerformance.averageLatency > 100) {
      suggestions.push('Investigate slow database round trips and query plans.')
    }

    if (currentMetrics.indexUsage.scannedIndexes === 0) {
      suggestions.push('No user indexes have recorded scans yet for this fresh test database.')
    }

    return suggestions
  }

  async checkAlerts(metrics?: AdvancedDatabaseMetrics): Promise<void> {
    const currentMetrics = metrics ?? (await this.getPerformanceMetrics())

    const averageLatency = currentMetrics.queryPerformance.averageLatency
    if (!Number.isFinite(averageLatency) || averageLatency < 0) {
      throw new Error('Database metrics collection alert: average latency unavailable')
    }

    if (averageLatency > 1000) {
      throw new Error(
        `Database latency alert: ${Math.round(currentMetrics.queryPerformance.averageLatency)}ms`
      )
    }
  }

  async generateAdvancedReport(metrics?: AdvancedDatabaseMetrics): Promise<string> {
    const currentMetrics = metrics ?? (await this.getPerformanceMetrics())

    if (this.metricsUnavailable(currentMetrics)) {
      return [
        '# Database Performance Report',
        'Database metrics unavailable; check database connectivity before interpreting performance.',
      ].join('\n')
    }

    return [
      '# Database Performance Report',
      `Average query latency: ${Math.round(currentMetrics.queryPerformance.averageLatency)}ms`,
      `Connection checkout: ${Math.round(currentMetrics.connectionPool.averageCheckoutTime)}ms`,
      `Index efficiency: ${Math.round(currentMetrics.indexUsage.efficiency * 100)}%`,
      `Vector query latency: ${Math.round(currentMetrics.vectorSearch.averageQueryTime)}ms`,
    ].join('\n')
  }
}
