// Database monitoring utilities for Neon PostgreSQL
import { neon } from '@neondatabase/serverless';

export interface DatabaseMetrics {
  connectionCount: number;
  queryPerformance: {
    slowQueries: any[];
    avgExecutionTime: number;
  };
  indexUsage: {
    indexName: string;
    tableName: string;
    scansCount: number;
    tuplesRead: number;
  }[];
  vectorSearchMetrics: {
    hnsWIndexSize: number;
    searchLatency: number;
  };
}

export class DatabaseMonitor {
  private sql;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async getConnectionMetrics(): Promise<{ active: number; idle: number }> {
    try {
      const result = await this.sql`
        SELECT 
          state,
          COUNT(*) as count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `;
      
      const metrics = { active: 0, idle: 0 };
      result.forEach((row: any) => {
        const count = parseInt(row.count, 10) || 0;
        if (row.state === 'active') metrics.active = count;
        if (row.state === 'idle') metrics.idle = count;
      });
      
      return metrics;
    } catch (error) {
      console.error('Failed to get connection metrics:', error);
      return { active: 0, idle: 0 };
    }
  }

  async getSlowQueries(limit: number = 10): Promise<any[]> {
    try {
      return await this.sql`
        SELECT 
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          rows
        FROM pg_stat_statements
        WHERE total_exec_time > 1000  -- queries taking more than 1 second total
        ORDER BY total_exec_time DESC
        LIMIT ${limit}
      `;
    } catch (error) {
      console.error('Failed to get slow queries (pg_stat_statements may not be enabled):', error);
      return [];
    }
  }

  async getIndexUsageStats(): Promise<any[]> {
    try {
      return await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexrelname as indexname,
          idx_scan as scans_count,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `;
    } catch (error) {
      console.error('Failed to get index usage stats:', error);
      return [];
    }
  }

  async getVectorIndexMetrics(): Promise<any[]> {
    try {
      return await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexrelname as indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          idx_scan as scans_count
        FROM pg_stat_user_indexes 
        WHERE indexrelname LIKE '%hnsw%'
        ORDER BY pg_relation_size(indexrelid) DESC
      `;
    } catch (error) {
      console.error('Failed to get vector index metrics:', error);
      return [];
    }
  }

  async getTableSizes(): Promise<any[]> {
    try {
      return await this.sql`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;
    } catch (error) {
      console.error('Failed to get table sizes:', error);
      return [];
    }
  }

  async checkDatabaseHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    checks: Array<{ name: string; status: boolean; message: string }>;
  }> {
    const checks = [];
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    try {
      // Check database connectivity
      await this.sql`SELECT 1`;
      checks.push({ name: 'Database Connectivity', status: true, message: 'Connected successfully' });
    } catch (error) {
      checks.push({ name: 'Database Connectivity', status: false, message: 'Connection failed' });
      overallStatus = 'critical';
    }

    try {
      // Check required extensions
      const extensions = await this.sql`
        SELECT extname 
        FROM pg_extension 
        WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')
      `;
      
      const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto'];
      const installedExtensions = extensions.map((ext: any) => ext.extname);
      const missing = requiredExtensions.filter(ext => !installedExtensions.includes(ext));
      
      if (missing.length === 0) {
        checks.push({ name: 'Required Extensions', status: true, message: 'All extensions installed' });
      } else {
        checks.push({ name: 'Required Extensions', status: false, message: `Missing: ${missing.join(', ')}` });
        overallStatus = 'warning';
      }
    } catch (error) {
      checks.push({ name: 'Required Extensions', status: false, message: 'Failed to check extensions' });
      overallStatus = 'warning';
    }

    try {
      // Check vector indexes
      const vectorIndexes = await this.getVectorIndexMetrics();
      if (vectorIndexes.length > 0) {
        checks.push({ name: 'Vector Indexes', status: true, message: `${vectorIndexes.length} HNSW indexes found` });
      } else {
        checks.push({ name: 'Vector Indexes', status: false, message: 'No HNSW indexes found' });
        overallStatus = 'warning';
      }
    } catch (error) {
      checks.push({ name: 'Vector Indexes', status: false, message: 'Failed to check vector indexes' });
      overallStatus = 'warning';
    }

    return { status: overallStatus, checks };
  }

  async generatePerformanceReport(): Promise<string> {
    try {
      const [
        connectionMetrics,
        slowQueries,
        indexStats,
        vectorMetrics,
        tableSizes,
        healthCheck
      ] = await Promise.all([
        this.getConnectionMetrics(),
        this.getSlowQueries(5),
        this.getIndexUsageStats(),
        this.getVectorIndexMetrics(),
        this.getTableSizes(),
        this.checkDatabaseHealth()
      ]);

      const healthChecksText = healthCheck.checks.map(check => 
        `- ${check.status ? '✅' : '❌'} ${check.name}: ${check.message}`
      ).join('\n');

      const slowQueriesText = slowQueries.length > 0 ? 
        slowQueries.map(q => 
          `- Query: ${q.query.substring(0, 100)}...\n  Calls: ${q.calls}, Avg Time: ${Math.round(q.mean_exec_time)}ms`
        ).join('\n')
        : 'No slow queries found';

      const vectorMetricsText = vectorMetrics.length > 0 ? 
        vectorMetrics.map(idx => 
          `- ${idx.indexname} on ${idx.tablename}: ${idx.index_size}, ${idx.scans_count} scans`
        ).join('\n')
        : 'No vector indexes found';

      const tableSizesText = tableSizes.slice(0, 5).map(table => 
        `- ${table.tablename}: ${table.total_size} (Table: ${table.table_size}, Indexes: ${table.index_size})`
      ).join('\n');

      const indexStatsText = indexStats.slice(0, 10).map(idx => 
        `- ${idx.indexname} on ${idx.tablename}: ${idx.scans_count} scans, ${idx.tuples_read} tuples read`
      ).join('\n');

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
${indexStatsText}`;

      return report.trim();
    } catch (error) {
      console.error('Failed to generate performance report:', error);
      return `Performance report generation failed: ${error}`;
    }
  }
}
