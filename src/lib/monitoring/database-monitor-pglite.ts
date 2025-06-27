// Database monitoring utilities for PGlite in-memory testing
import type { NeonQueryFunction } from '@neondatabase/serverless'
import {
  type ConnectionMetrics,
  connectionMetricsSchema,
  type DatabaseHealth,
  databaseHealthSchema,
  type HealthCheck,
  healthCheckSchema,
  type IndexStat,
  indexStatSchema,
  type SlowQuery,
  type TableSize,
  tableSizeSchema,
  type VectorIndexMetric,
  vectorIndexMetricSchema,
} from '../validation/database'

// Define types for database query results
interface TableNameRow {
  tablename: string
}

export class DatabaseMonitorPGlite {
  private sql: NeonQueryFunction<false, false>

  constructor(sql: NeonQueryFunction<false, false>) {
    this.sql = sql
  }

  async getConnectionMetrics(): Promise<ConnectionMetrics> {
    try {
      // For PGlite, simulate connection metrics since there's no pg_stat_activity
      // In memory database has predictable connection patterns
      return connectionMetricsSchema.parse({ active: 1, idle: 0 })
    } catch (_error) {
      return { active: 0, idle: 0 }
    }
  }

  async getSlowQueries(_limit = 10): Promise<SlowQuery[]> {
    // PGlite doesn't support pg_stat_statements extension
    // Return empty array for testing compatibility
    return []
  }

  async getIndexUsageStats(): Promise<IndexStat[]> {
    try {
      // For PGlite, we can check basic index information from pg_indexes
      const result = await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          0 as scans_count,
          0 as tuples_read,
          0 as tuples_fetched
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY indexname
      `

      return result && Array.isArray(result) ? result.map(row => indexStatSchema.parse(row)) : []
    } catch (_error) {
      return []
    }
  }

  async getVectorIndexMetrics(): Promise<VectorIndexMetric[]> {
    try {
      // PGlite doesn't support vector indexes, but we can check for HNSW pattern indexes
      const result = await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          '0 bytes' as index_size,
          0 as scans_count
        FROM pg_indexes 
        WHERE indexname LIKE '%hnsw%' OR indexname LIKE '%vector%'
        ORDER BY indexname
      `

      return result && Array.isArray(result)
        ? result.map(row => vectorIndexMetricSchema.parse(row))
        : []
    } catch (_error) {
      return []
    }
  }

  async getTableSizes(): Promise<TableSize[]> {
    try {
      // For PGlite, we can get basic table information
      const result = await this.sql`
        SELECT 
          schemaname,
          tablename,
          '0 bytes' as total_size,
          '0 bytes' as table_size,
          '0 bytes' as index_size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `

      return result && Array.isArray(result) ? result.map(row => tableSizeSchema.parse(row)) : []
    } catch (_error) {
      return []
    }
  }

  async checkDatabaseHealth(): Promise<DatabaseHealth> {
    const checks: HealthCheck[] = []
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

    try {
      // Check database connectivity using the sql function
      await this.sql`SELECT 1`
      checks.push(
        healthCheckSchema.parse({
          name: 'Database Connectivity',
          status: true,
          message: 'PGlite connected successfully',
        })
      )
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Database Connectivity',
          status: false,
          message: 'PGlite connection failed',
        })
      )
      overallStatus = 'critical'
    }

    try {
      // Check for basic tables that should exist
      const tablesResult = await this.sql`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `

      const tables =
        tablesResult && Array.isArray(tablesResult) ? (tablesResult as TableNameRow[]) : []
      const expectedTables = ['users', 'repositories', 'opportunities']
      const existingTables = tables.map(t => t.tablename)
      const missingTables = expectedTables.filter(table => !existingTables.includes(table))

      if (missingTables.length === 0) {
        checks.push(
          healthCheckSchema.parse({
            name: 'Required Extensions',
            status: true,
            message: 'Core tables available (PGlite mode)',
          })
        )
      } else {
        checks.push(
          healthCheckSchema.parse({
            name: 'Required Extensions',
            status: false,
            message: `Missing tables: ${missingTables.join(', ')}`,
          })
        )
        overallStatus = 'warning'
      }
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Required Extensions',
          status: false,
          message: 'Failed to check tables',
        })
      )
      overallStatus = 'warning'
    }

    try {
      // Check for indexes
      const indexesResult = await this.sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public'
      `

      const indexes = indexesResult && Array.isArray(indexesResult) ? indexesResult : []
      if (indexes.length > 0) {
        checks.push(
          healthCheckSchema.parse({
            name: 'Vector Indexes',
            status: true,
            message: `${indexes.length} indexes found (PGlite mode)`,
          })
        )
      } else {
        checks.push(
          healthCheckSchema.parse({
            name: 'Vector Indexes',
            status: false,
            message: 'No indexes found',
          })
        )
        overallStatus = 'warning'
      }
    } catch (_error) {
      checks.push(
        healthCheckSchema.parse({
          name: 'Vector Indexes',
          status: false,
          message: 'Failed to check indexes',
        })
      )
      overallStatus = 'warning'
    }

    return databaseHealthSchema.parse({ status: overallStatus, checks })
  }

  async generatePerformanceReport(): Promise<string> {
    try {
      const [connectionMetrics, _slowQueries, indexStats, vectorMetrics, tableSizes, healthCheck] =
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

      const slowQueriesText = 'No slow queries available (PGlite mode)'

      const vectorMetricsText =
        vectorMetrics.length > 0
          ? vectorMetrics
              .map(idx => `- ${idx.indexname} on ${idx.tablename}: ${idx.index_size}`)
              .join('\n')
          : 'No vector indexes found (PGlite mode)'

      const tableSizesText =
        tableSizes.length > 0
          ? tableSizes
              .slice(0, 5)
              .map(table => `- ${table.tablename}: In-memory (PGlite)`)
              .join('\n')
          : 'No tables found'

      const indexStatsText =
        indexStats.length > 0
          ? indexStats
              .slice(0, 10)
              .map(idx => `- ${idx.indexname} on ${idx.tablename}: In-memory (PGlite)`)
              .join('\n')
          : 'No indexes found'

      const report = `# Database Performance Report (PGlite)
Generated: ${new Date().toISOString()}

## Health Status: ${healthCheck.status.toUpperCase()}

${healthChecksText}

## Connection Metrics
- Active Connections: ${connectionMetrics.active} (In-memory)
- Idle Connections: ${connectionMetrics.idle}

## Slow Queries
${slowQueriesText}

## Vector Index Performance
${vectorMetricsText}

## Table Sizes
${tableSizesText}

## Index Usage
${indexStatsText}`

      return report.trim()
    } catch (error) {
      return `PGlite performance report generation failed: ${error}`
    }
  }
}
