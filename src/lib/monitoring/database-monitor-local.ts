// Database monitoring utilities for local PostgreSQL (for testing)
import { Client } from 'pg'
import {
  type ConnectionMetrics,
  connectionMetricsSchema,
  connectionRowSchema,
  type DatabaseHealth,
  databaseHealthSchema,
  extensionSchema,
  type HealthCheck,
  healthCheckSchema,
  type IndexStat,
  indexStatSchema,
  type SlowQuery,
  slowQuerySchema,
  type TableSize,
  tableSizeSchema,
  type VectorIndexMetric,
  vectorIndexMetricSchema,
} from '../validation/database'

export class DatabaseMonitorLocal {
  private connectionString: string

  constructor(connectionString: string) {
    this.connectionString = connectionString
  }

  private async query<T>(queryText: string, params: unknown[] = []): Promise<T[]> {
    const client = new Client({ connectionString: this.connectionString })
    try {
      await client.connect()
      const result = await client.query(queryText, params)
      return result.rows as T[]
    } finally {
      await client.end()
    }
  }

  async getConnectionMetrics(): Promise<ConnectionMetrics> {
    try {
      const result = await this.query<{ state: string; count: string }>(
        `SELECT 
          state,
          COUNT(*) as count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state`
      )

      const metrics = { active: 0, idle: 0 }
      if (result && Array.isArray(result)) {
        result.forEach(row => {
          const validatedRow = connectionRowSchema.parse(row)
          const count = Number.parseInt(validatedRow.count, 10) || 0
          if (validatedRow.state === 'active') metrics.active = count
          if (validatedRow.state === 'idle') metrics.idle = count
        })
      }

      return connectionMetricsSchema.parse(metrics)
    } catch (error) {
      console.error('Failed to get connection metrics:', error)
      return { active: 0, idle: 0 }
    }
  }

  async getSlowQueries(limit = 10): Promise<SlowQuery[]> {
    try {
      // First check if pg_stat_statements extension is available
      const extensionCheck = await this.query<{ extname: string }>(
        `SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'`
      )

      if (!extensionCheck || extensionCheck.length === 0) {
        // Extension not installed, return empty array silently
        return []
      }

      const result = await this.query<SlowQuery>(
        `SELECT 
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          rows
        FROM pg_stat_statements
        WHERE total_exec_time > 1000  -- queries above 1 second threshold
        ORDER BY total_exec_time DESC
        LIMIT $1`,
        [limit]
      )

      return result && Array.isArray(result) ? result.map(row => slowQuerySchema.parse(row)) : []
    } catch (error: unknown) {
      // Check if error is due to pg_stat_statements not being loaded via shared_preload_libraries
      const errorMessage = error && typeof error === 'object' && 'message' in error 
        ? String((error as { message: unknown }).message) 
        : ''
      if (
        errorMessage.includes('pg_stat_statements must be loaded via shared_preload_libraries')
      ) {
        // This is expected in test environments, return empty array silently
        return []
      }
      // For other errors, log them but still return empty array
      console.error('Failed to get slow queries:', error)
      return []
    }
  }

  async getIndexUsageStats(): Promise<IndexStat[]> {
    try {
      const result = await this.query<IndexStat>(
        `SELECT 
          schemaname,
          relname as tablename,
          indexrelname as indexname,
          CAST(idx_scan as INTEGER) as scans_count,
          CAST(idx_tup_read as INTEGER) as tuples_read,
          CAST(idx_tup_fetch as INTEGER) as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC`
      )

      return result && Array.isArray(result) ? result.map(row => indexStatSchema.parse(row)) : []
    } catch (error) {
      console.error('Failed to get index usage stats:', error)
      return []
    }
  }

  async getVectorIndexMetrics(): Promise<VectorIndexMetric[]> {
    try {
      const result = await this.query<VectorIndexMetric>(
        `SELECT 
          schemaname,
          relname as tablename,
          indexrelname as indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          CAST(idx_scan as INTEGER) as scans_count
        FROM pg_stat_user_indexes 
        WHERE indexrelname LIKE '%hnsw%'
        ORDER BY pg_relation_size(indexrelid) DESC`
      )

      return result && Array.isArray(result)
        ? result.map(row => vectorIndexMetricSchema.parse(row))
        : []
    } catch (error) {
      console.error('Failed to get vector index metrics:', error)
      return []
    }
  }

  async getTableSizes(): Promise<TableSize[]> {
    try {
      const result = await this.query<TableSize>(
        `SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC`
      )

      return result && Array.isArray(result) ? result.map(row => tableSizeSchema.parse(row)) : []
    } catch (error) {
      console.error('Failed to get table sizes:', error)
      return []
    }
  }

  async checkDatabaseHealth(): Promise<DatabaseHealth> {
    const checks: HealthCheck[] = []
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

    try {
      // Check database connectivity
      await this.query('SELECT 1')
      checks.push(
        healthCheckSchema.parse({
          name: 'Database Connectivity',
          status: true,
          message: 'Connected successfully',
        })
      )
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Database Connectivity',
          status: false,
          message: 'Connection failed',
        })
      )
      overallStatus = 'critical'
    }

    try {
      // Check required extensions
      const extensionsResult = await this.query<{ extname: string }>(
        `SELECT extname 
        FROM pg_extension 
        WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')`
      )

      const extensions =
        extensionsResult && Array.isArray(extensionsResult)
          ? extensionsResult.map(row => extensionSchema.parse(row))
          : []
      const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto']
      const installedExtensions = extensions.map(ext => ext.extname)
      const missing = requiredExtensions.filter(ext => !installedExtensions.includes(ext))

      if (missing.length === 0) {
        checks.push(
          healthCheckSchema.parse({
            name: 'Required Extensions',
            status: true,
            message: 'All extensions installed',
          })
        )
      } else {
        checks.push(
          healthCheckSchema.parse({
            name: 'Required Extensions',
            status: false,
            message: `Missing: ${missing.join(', ')}`,
          })
        )
        overallStatus = 'warning'
      }
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Required Extensions',
          status: false,
          message: 'Failed to check extensions',
        })
      )
      overallStatus = 'warning'
    }

    try {
      // Check vector indexes
      const vectorIndexes = await this.getVectorIndexMetrics()
      if (vectorIndexes.length > 0) {
        checks.push(
          healthCheckSchema.parse({
            name: 'Vector Indexes',
            status: true,
            message: `${vectorIndexes.length} HNSW indexes found`,
          })
        )
      } else {
        checks.push(
          healthCheckSchema.parse({
            name: 'Vector Indexes',
            status: false,
            message: 'No HNSW indexes found',
          })
        )
        overallStatus = 'warning'
      }
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Vector Indexes',
          status: false,
          message: 'Failed to check vector indexes',
        })
      )
      overallStatus = 'warning'
    }

    return databaseHealthSchema.parse({ status: overallStatus, checks })
  }

  async generatePerformanceReport(): Promise<string> {
    try {
      const [connectionMetrics, slowQueries, indexStats, vectorMetrics, tableSizes, healthCheck] =
        await Promise.all([
          this.getConnectionMetrics(),
          this.getSlowQueries(10),
          this.getIndexUsageStats(),
          this.getVectorIndexMetrics(),
          this.getTableSizes(),
          this.checkDatabaseHealth(),
        ])

      const healthChecksText = healthCheck.checks
        .map(check => `- ${check.status ? '✅' : '❌'} ${check.name}: ${check.message}`)
        .join('\n')

      const slowQueriesText =
        slowQueries.length > 0
          ? slowQueries
              .map(
                q =>
                  `- Query: ${q.query.substring(0, 100)}...\n  Calls: ${q.calls}, Avg Time: ${Math.round(q.mean_exec_time)}ms`
              )
              .join('\n')
          : 'No slow queries found'

      const vectorMetricsText =
        vectorMetrics.length > 0
          ? vectorMetrics
              .map(
                idx =>
                  `- ${idx.indexname} on ${idx.tablename}: ${idx.index_size}, ${idx.scans_count} scans`
              )
              .join('\n')
          : 'No vector indexes found'

      const tableSizesText = tableSizes
        .slice(0, 5)
        .map(
          table =>
            `- ${table.tablename}: ${table.total_size} (Table: ${table.table_size}, Indexes: ${table.index_size})`
        )
        .join('\n')

      const indexStatsText = indexStats
        .slice(0, 10)
        .map(
          idx =>
            `- ${idx.indexname} on ${idx.tablename}: ${idx.scans_count} scans, ${idx.tuples_read} tuples read`
        )
        .join('\n')

      const report = `# Database Performance Report
Generated: ${new Date().toISOString()}

## Health Status: ${healthCheck.status.toUpperCase()}

${healthChecksText}

## Connection Metrics
- Active Connections: ${connectionMetrics.active}
- Idle Connections: ${connectionMetrics.idle}

## Slow Queries (>1s total execution time)
${slowQueriesText}

## Vector Index Performance
${vectorMetricsText}

## Table Sizes (Top 5)
${tableSizesText}

## Index Usage (Top 10)
${indexStatsText}`

      return report.trim()
    } catch (error) {
      console.error('Failed to generate performance report:', error)
      return `Performance report generation failed: ${error}`
    }
  }
}
