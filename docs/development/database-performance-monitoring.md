# Database Performance Monitoring and Tuning Guide for Contribux

## Overview

This guide provides comprehensive database performance monitoring, optimization, and tuning strategies
specifically designed for the contribux platform's Neon PostgreSQL setup with vector search capabilities. It
focuses on practical, cost-effective solutions for solo developers managing a serverless-first architecture.

## Table of Contents

- [Database Performance Monitoring and Tuning Guide for Contribux](#database-performance-monitoring-and-tuning-guide-for-contribux)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Neon PostgreSQL Performance Overview](#neon-postgresql-performance-overview)
    - [Understanding Neon's Architecture](#understanding-neons-architecture)
    - [Performance Monitoring Setup](#performance-monitoring-setup)
  - [Vector Search Optimization](#vector-search-optimization)
    - [HNSW Index Performance Monitoring](#hnsw-index-performance-monitoring)
    - [Vector Index Optimization](#vector-index-optimization)
  - [Query Performance Monitoring](#query-performance-monitoring)
    - [Slow Query Detection and Analysis](#slow-query-detection-and-analysis)
    - [Query Optimization Recommendations](#query-optimization-recommendations)
  - [Index Management and Optimization](#index-management-and-optimization)
    - [Automated Index Analysis](#automated-index-analysis)
  - [Connection Pool Monitoring](#connection-pool-monitoring)
    - [Neon Connection Management](#neon-connection-management)
  - [Automated Performance Analysis](#automated-performance-analysis)
    - [Performance Dashboard API](#performance-dashboard-api)
  - [Cost-Effective Monitoring Solutions](#cost-effective-monitoring-solutions)
    - [DIY Performance Monitoring](#diy-performance-monitoring)
    - [Alerting on a Budget](#alerting-on-a-budget)
  - [Performance Tuning Strategies](#performance-tuning-strategies)
    - [Automated Tuning Recommendations](#automated-tuning-recommendations)
  - [Alerting and Incident Response](#alerting-and-incident-response)
    - [Incident Response Automation](#incident-response-automation)
  - [Maintenance and Optimization Workflows](#maintenance-and-optimization-workflows)
    - [Automated Maintenance Tasks](#automated-maintenance-tasks)
    - [Performance Monitoring Scripts](#performance-monitoring-scripts)
  - [Conclusion](#conclusion)

## Neon PostgreSQL Performance Overview

### Understanding Neon's Architecture

Neon PostgreSQL operates with a unique serverless architecture that differs from traditional PostgreSQL deployments:

```typescript
// lib/db/neon-performance-config.ts
import { neon, neonConfig } from '@neondatabase/serverless'

// Configure Neon for optimal performance
neonConfig.fetchConnectionCache = true
neonConfig.poolQueryViaFetch = true

// Performance-optimized connection factory
export function createPerformanceOptimizedConnection() {
  return neon(process.env.DATABASE_URL!, {
    // Use HTTP for better serverless compatibility
    poolQueryViaFetch: true,
    
    // Enable connection caching
    fetchConnectionCache: true,
    
    // Optimize for frequent short-lived connections
    arrayMode: false,
    fullResults: false,
    
    // Connection timeout optimized for serverless
    fetchOptions: {
      timeout: 30000, // 30 seconds
    }
  })
}

// Branch-aware connection management
export function getConnectionForEnvironment() {
  const environment = process.env.NODE_ENV
  const branch = process.env.VERCEL_GIT_COMMIT_REF
  
  let databaseUrl: string
  
  if (environment === 'test') {
    databaseUrl = process.env.DATABASE_URL_TEST!
  } else if (branch && branch !== 'main') {
    databaseUrl = process.env.DATABASE_URL_DEV!
  } else {
    databaseUrl = process.env.DATABASE_URL!
  }
  
  return neon(databaseUrl, {
    poolQueryViaFetch: true,
    fetchConnectionCache: true,
  })
}
```

### Performance Monitoring Setup

Implement comprehensive performance monitoring for Neon connections:

```typescript
// lib/monitoring/neon-performance.ts
interface ConnectionMetrics {
  connectionTime: number
  queryTime: number
  totalTime: number
  cacheHit: boolean
  rowsAffected: number
  errorCount: number
}

class NeonPerformanceMonitor {
  private metrics: ConnectionMetrics[] = []
  private readonly maxMetricsHistory = 1000
  
  async executeWithMonitoring<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = performance.now()
    const connectionStart = performance.now()
    
    let result: T
    let error: Error | null = null
    
    try {
      result = await operation()
      
      const endTime = performance.now()
      const metrics: ConnectionMetrics = {
        connectionTime: connectionStart - startTime,
        queryTime: endTime - connectionStart,
        totalTime: endTime - startTime,
        cacheHit: this.detectCacheHit(result),
        rowsAffected: this.getRowsAffected(result),
        errorCount: 0,
      }
      
      this.recordMetrics(operationName, metrics)
      return result
      
    } catch (err) {
      error = err as Error
      
      const endTime = performance.now()
      const metrics: ConnectionMetrics = {
        connectionTime: connectionStart - startTime,
        queryTime: endTime - connectionStart,
        totalTime: endTime - startTime,
        cacheHit: false,
        rowsAffected: 0,
        errorCount: 1,
      }
      
      this.recordMetrics(operationName, metrics, error)
      throw error
    }
  }
  
  private detectCacheHit(result: any): boolean {
    // Detect if result came from Neon's connection cache
    return typeof result === 'object' && 
           result?.['x-neon-cache'] === 'hit'
  }
  
  private getRowsAffected(result: any): number {
    if (Array.isArray(result)) return result.length
    if (result?.count !== undefined) return result.count
    return 0
  }
  
  private recordMetrics(
    operationName: string, 
    metrics: ConnectionMetrics, 
    error?: Error
  ) {
    // Store metrics for analysis
    this.metrics.push(metrics)
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory)
    }
    
    // Log performance issues
    if (metrics.totalTime > 5000) { // 5 seconds
      console.warn(`Slow database operation detected: ${operationName}`, {
        duration: metrics.totalTime,
        error: error?.message,
        timestamp: new Date().toISOString(),
      })
    }
    
    // Log to structured monitoring
    this.logToMonitoring(operationName, metrics, error)
  }
  
  private logToMonitoring(
    operationName: string,
    metrics: ConnectionMetrics,
    error?: Error
  ) {
    const logEntry = {
      type: 'database_performance',
      operation: operationName,
      metrics,
      error: error ? {
        message: error.message,
        stack: error.stack,
      } : null,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      branch: process.env.VERCEL_GIT_COMMIT_REF,
    }
    
    console.log(JSON.stringify(logEntry))
  }
  
  getPerformanceStats() {
    if (this.metrics.length === 0) return null
    
    const totalOps = this.metrics.length
    const avgConnectionTime = this.metrics.reduce((sum, m) => sum + m.connectionTime, 0) / totalOps
    const avgQueryTime = this.metrics.reduce((sum, m) => sum + m.queryTime, 0) / totalOps
    const avgTotalTime = this.metrics.reduce((sum, m) => sum + m.totalTime, 0) / totalOps
    const cacheHitRate = this.metrics.filter(m => m.cacheHit).length / totalOps
    const errorRate = this.metrics.filter(m => m.errorCount > 0).length / totalOps
    
    return {
      totalOperations: totalOps,
      averageConnectionTime: avgConnectionTime,
      averageQueryTime: avgQueryTime,
      averageTotalTime: avgTotalTime,
      cacheHitRate,
      errorRate,
      slowQueries: this.metrics.filter(m => m.totalTime > 1000).length,
    }
  }
}

export const neonMonitor = new NeonPerformanceMonitor()
```

## Vector Search Optimization

### HNSW Index Performance Monitoring

Monitor and optimize vector search performance specifically for the contribux platform:

```typescript
// lib/monitoring/vector-performance.ts
interface VectorSearchMetrics {
  searchDuration: number
  resultCount: number
  indexUsed: boolean
  similarity: number
  queryComplexity: 'simple' | 'complex' | 'hybrid'
}

export class VectorSearchMonitor {
  async monitorVectorSearch<T>(
    searchFunction: () => Promise<T>,
    searchType: 'similarity' | 'hybrid' | 'filtered',
    queryParams: {
      dimensions: number
      limit: number
      threshold?: number
    }
  ): Promise<T> {
    const startTime = performance.now()
    
    try {
      const result = await searchFunction()
      const duration = performance.now() - startTime
      
      const metrics: VectorSearchMetrics = {
        searchDuration: duration,
        resultCount: Array.isArray(result) ? result.length : 1,
        indexUsed: await this.checkIndexUsage(),
        similarity: this.calculateAverageSimilarity(result),
        queryComplexity: this.determineComplexity(searchType, queryParams),
      }
      
      this.logVectorMetrics(searchType, metrics)
      
      // Alert on performance issues
      if (duration > 2000) { // 2 seconds
        this.alertSlowVectorSearch(searchType, metrics)
      }
      
      return result
      
    } catch (error) {
      this.logVectorError(searchType, error as Error)
      throw error
    }
  }
  
  private async checkIndexUsage(): Promise<boolean> {
    // Check if HNSW index was used in the last query
    const sql = getConnectionForEnvironment()
    
    try {
      const result = await sql`
        SELECT 
          query,
          plans
        FROM pg_stat_statements 
        WHERE query LIKE '%<=>%' 
        ORDER BY last_exec DESC 
        LIMIT 1
      `
      
      return result[0]?.plans?.includes('Index Scan using') || false
    } catch {
      return false // Fallback if pg_stat_statements not available
    }
  }
  
  private calculateAverageSimilarity(result: any): number {
    if (!Array.isArray(result)) return 0
    
    const similarities = result
      .map(item => item.similarity || item.score)
      .filter(s => typeof s === 'number')
    
    if (similarities.length === 0) return 0
    
    return similarities.reduce((sum, s) => sum + s, 0) / similarities.length
  }
  
  private determineComplexity(
    searchType: string, 
    params: { dimensions: number; limit: number; threshold?: number }
  ): 'simple' | 'complex' | 'hybrid' {
    if (searchType === 'hybrid') return 'hybrid'
    if (params.dimensions > 1536 || params.limit > 100) return 'complex'
    return 'simple'
  }
  
  private logVectorMetrics(searchType: string, metrics: VectorSearchMetrics) {
    console.log(JSON.stringify({
      type: 'vector_search_performance',
      searchType,
      metrics,
      timestamp: new Date().toISOString(),
      recommendations: this.generateRecommendations(metrics),
    }))
  }
  
  private generateRecommendations(metrics: VectorSearchMetrics): string[] {
    const recommendations: string[] = []
    
    if (metrics.searchDuration > 1000) {
      recommendations.push('Consider reducing search limit or adding more specific filters')
    }
    
    if (!metrics.indexUsed) {
      recommendations.push('HNSW index may not be optimal - consider reindexing or adjusting ef_search')
    }
    
    if (metrics.similarity < 0.3) {
      recommendations.push('Low similarity scores - consider improving embedding quality')
    }
    
    return recommendations
  }
  
  private alertSlowVectorSearch(searchType: string, metrics: VectorSearchMetrics) {
    console.warn('Slow vector search detected', {
      searchType,
      duration: metrics.searchDuration,
      resultCount: metrics.resultCount,
      indexUsed: metrics.indexUsed,
      timestamp: new Date().toISOString(),
    })
  }
  
  private logVectorError(searchType: string, error: Error) {
    console.error('Vector search error', {
      searchType,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  }
}

export const vectorMonitor = new VectorSearchMonitor()
```

### Vector Index Optimization

Implement strategies for maintaining optimal vector search performance:

```typescript
// lib/db/vector-optimization.ts
export class VectorIndexOptimizer {
  private sql = getConnectionForEnvironment()
  
  async analyzeVectorIndexPerformance() {
    // Analyze HNSW index performance
    const indexStats = await this.sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes 
      WHERE indexname LIKE '%_embedding_%'
    `
    
    // Check index size and fragmentation
    const indexSizes = await this.sql`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
      FROM pg_stat_user_indexes 
      WHERE indexname LIKE '%_embedding_%'
    `
    
    return {
      indexStats,
      indexSizes,
      recommendations: this.generateIndexRecommendations(indexStats, indexSizes),
    }
  }
  
  async optimizeHNSWParameters() {
    // Test different ef_search values
    const testQueries = [
      'SELECT COUNT(*) FROM users WHERE profile_embedding IS NOT NULL',
      'SELECT COUNT(*) FROM repositories WHERE description_embedding IS NOT NULL',
      'SELECT COUNT(*) FROM opportunities WHERE title_embedding IS NOT NULL',
    ]
    
    const efSearchValues = [100, 200, 400]
    const results = []
    
    for (const efSearch of efSearchValues) {
      await this.sql`SET hnsw.ef_search = ${efSearch}`
      
      const startTime = performance.now()
      
      // Run test queries
      for (const query of testQueries) {
        await this.sql.unsafe(query)
      }
      
      const duration = performance.now() - startTime
      results.push({ efSearch, duration })
    }
    
    // Reset to optimal value
    const optimalEfSearch = results.reduce((best, current) =>
      current.duration < best.duration ? current : best
    ).efSearch
    
    await this.sql`SET hnsw.ef_search = ${optimalEfSearch}`
    
    return {
      testResults: results,
      optimalEfSearch,
      improvement: this.calculateImprovement(results),
    }
  }
  
  async maintainVectorIndexes() {
    // Reindex if fragmentation is high
    const fragmentation = await this.checkIndexFragmentation()
    
    if (fragmentation.some(f => f.fragmentation_percent > 30)) {
      console.log('High fragmentation detected, reindexing vector indexes...')
      
      await this.sql`REINDEX INDEX CONCURRENTLY users_profile_embedding_idx`
      await this.sql`REINDEX INDEX CONCURRENTLY repositories_description_embedding_idx`
      await this.sql`REINDEX INDEX CONCURRENTLY opportunities_title_embedding_idx`
      await this.sql`REINDEX INDEX CONCURRENTLY opportunities_description_embedding_idx`
      
      return { reindexed: true, reason: 'high_fragmentation' }
    }
    
    return { reindexed: false, reason: 'fragmentation_acceptable' }
  }
  
  private async checkIndexFragmentation() {
    return await this.sql`
      SELECT 
        indexname,
        (100 * (1 - (idx_scan::float / NULLIF(idx_scan + seq_scan, 0)))) as fragmentation_percent
      FROM pg_stat_user_tables t
      JOIN pg_stat_user_indexes i ON t.relid = i.relid
      WHERE indexname LIKE '%_embedding_%'
    `
  }
  
  private generateIndexRecommendations(indexStats: any[], indexSizes: any[]): string[] {
    const recommendations: string[] = []
    
    // Check for unused indexes
    const unusedIndexes = indexStats.filter(stat => stat.idx_scan === 0)
    if (unusedIndexes.length > 0) {
      recommendations.push(`Consider dropping unused indexes: ${unusedIndexes.map(i => i.indexname).join(', ')}`)
    }
    
    // Check for oversized indexes
    const largeIndexes = indexSizes.filter(size => size.size_bytes > 100 * 1024 * 1024) // 100MB
    if (largeIndexes.length > 0) {
      recommendations.push(`Large indexes detected - consider maintenance: ${largeIndexes.map(i => i.indexname).join(', ')}`)
    }
    
    return recommendations
  }
  
  private calculateImprovement(results: Array<{ efSearch: number; duration: number }>): number {
    const worst = Math.max(...results.map(r => r.duration))
    const best = Math.min(...results.map(r => r.duration))
    return ((worst - best) / worst) * 100
  }
}

export const vectorOptimizer = new VectorIndexOptimizer()
```

## Query Performance Monitoring

### Slow Query Detection and Analysis

Implement comprehensive slow query monitoring:

```typescript
// lib/monitoring/slow-query-monitor.ts
interface SlowQueryData {
  query: string
  duration: number
  rowsExamined: number
  rowsReturned: number
  timestamp: Date
  queryPlan?: any
}

export class SlowQueryMonitor {
  private readonly slowQueryThreshold = 1000 // 1 second
  private recentSlowQueries: SlowQueryData[] = []
  
  async executeWithSlowQueryDetection<T>(
    queryFunction: () => Promise<T>,
    queryDescription: string,
    expectedRows?: number
  ): Promise<T> {
    const startTime = performance.now()
    
    try {
      const result = await queryFunction()
      const duration = performance.now() - startTime
      
      if (duration > this.slowQueryThreshold) {
        await this.analyzeSlowQuery(queryDescription, duration, result, expectedRows)
      }
      
      return result
      
    } catch (error) {
      const duration = performance.now() - startTime
      this.logQueryError(queryDescription, duration, error as Error)
      throw error
    }
  }
  
  private async analyzeSlowQuery(
    queryDescription: string,
    duration: number,
    result: any,
    expectedRows?: number
  ) {
    const rowsReturned = Array.isArray(result) ? result.length : 1
    
    const slowQueryData: SlowQueryData = {
      query: queryDescription,
      duration,
      rowsExamined: expectedRows || rowsReturned,
      rowsReturned,
      timestamp: new Date(),
    }
    
    // Get query execution plan if available
    try {
      slowQueryData.queryPlan = await this.getLastQueryPlan()
    } catch {
      // Query plan not available
    }
    
    this.recentSlowQueries.push(slowQueryData)
    
    // Keep only recent slow queries
    if (this.recentSlowQueries.length > 100) {
      this.recentSlowQueries = this.recentSlowQueries.slice(-100)
    }
    
    this.logSlowQuery(slowQueryData)
    this.generateOptimizationSuggestions(slowQueryData)
  }
  
  private async getLastQueryPlan() {
    const sql = getConnectionForEnvironment()
    
    try {
      const result = await sql`
        SELECT query, plans 
        FROM pg_stat_statements 
        ORDER BY last_exec DESC 
        LIMIT 1
      `
      return result[0]?.plans
    } catch {
      return null
    }
  }
  
  private logSlowQuery(data: SlowQueryData) {
    console.warn('Slow query detected', {
      type: 'slow_query_analysis',
      query: data.query,
      duration: data.duration,
      rowsExamined: data.rowsExamined,
      rowsReturned: data.rowsReturned,
      efficiency: data.rowsReturned / data.rowsExamined,
      timestamp: data.timestamp.toISOString(),
      queryPlan: data.queryPlan,
    })
  }
  
  private generateOptimizationSuggestions(data: SlowQueryData) {
    const suggestions: string[] = []
    
    // Check query efficiency
    const efficiency = data.rowsReturned / data.rowsExamined
    if (efficiency < 0.1) {
      suggestions.push('Low query efficiency - consider adding more selective WHERE clauses')
    }
    
    // Check for full table scans
    if (data.queryPlan?.includes('Seq Scan')) {
      suggestions.push('Sequential scan detected - consider adding appropriate indexes')
    }
    
    // Check for cartesian products
    if (data.rowsExamined > data.rowsReturned * 10) {
      suggestions.push('Possible cartesian product - review JOIN conditions')
    }
    
    if (suggestions.length > 0) {
      console.log('Query optimization suggestions', {
        query: data.query,
        suggestions,
        timestamp: new Date().toISOString(),
      })
    }
  }
  
  private logQueryError(queryDescription: string, duration: number, error: Error) {
    console.error('Query execution error', {
      type: 'query_error',
      query: queryDescription,
      duration,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  }
  
  getSlowQueryReport() {
    if (this.recentSlowQueries.length === 0) {
      return { message: 'No slow queries detected recently' }
    }
    
    const totalQueries = this.recentSlowQueries.length
    const avgDuration = this.recentSlowQueries.reduce((sum, q) => sum + q.duration, 0) / totalQueries
    const maxDuration = Math.max(...this.recentSlowQueries.map(q => q.duration))
    
    const queryFrequency = this.recentSlowQueries.reduce((acc, query) => {
      acc[query.query] = (acc[query.query] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const mostFrequentSlowQuery = Object.entries(queryFrequency)
      .sort(([,a], [,b]) => b - a)[0]
    
    return {
      totalSlowQueries: totalQueries,
      averageDuration: avgDuration,
      maxDuration,
      mostFrequentSlowQuery: mostFrequentSlowQuery ? {
        query: mostFrequentSlowQuery[0],
        count: mostFrequentSlowQuery[1],
      } : null,
      recentQueries: this.recentSlowQueries.slice(-10), // Last 10 slow queries
    }
  }
}

export const slowQueryMonitor = new SlowQueryMonitor()
```

### Query Optimization Recommendations

Implement automated query optimization analysis:

```typescript
// lib/monitoring/query-optimizer.ts
export class QueryOptimizer {
  private sql = getConnectionForEnvironment()
  
  async analyzeQueryPerformance() {
    // Get most expensive queries from pg_stat_statements
    const expensiveQueries = await this.sql`
      SELECT 
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements 
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY total_exec_time DESC 
      LIMIT 10
    `
    
    const recommendations = []
    
    for (const query of expensiveQueries) {
      const analysis = await this.analyzeQuery(query)
      recommendations.push({
        query: this.sanitizeQuery(query.query),
        metrics: {
          calls: query.calls,
          totalTime: query.total_exec_time,
          meanTime: query.mean_exec_time,
          maxTime: query.max_exec_time,
          hitPercent: query.hit_percent,
        },
        recommendations: analysis,
      })
    }
    
    return recommendations
  }
  
  private async analyzeQuery(queryStats: any): Promise<string[]> {
    const recommendations: string[] = []
    
    // High execution time
    if (queryStats.mean_exec_time > 1000) {
      recommendations.push('High average execution time - consider query optimization')
    }
    
    // Low cache hit ratio
    if (queryStats.hit_percent < 95) {
      recommendations.push('Low buffer cache hit ratio - query may benefit from indexing')
    }
    
    // High frequency with high total time
    if (queryStats.calls > 100 && queryStats.total_exec_time > 10000) {
      recommendations.push('Frequently executed expensive query - high impact optimization target')
    }
    
    // Query-specific analysis
    const queryText = queryStats.query.toLowerCase()
    
    if (queryText.includes('like %') && !queryText.includes('gin') && !queryText.includes('gist')) {
      recommendations.push('LIKE pattern with leading wildcard - consider full-text search or trigram indexes')
    }
    
    if (queryText.includes('order by') && !queryText.includes('limit')) {
      recommendations.push('ORDER BY without LIMIT - consider adding appropriate limits')
    }
    
    if (queryText.includes('distinct') && queryText.includes('join')) {
      recommendations.push('DISTINCT with JOIN - verify if DISTINCT is necessary')
    }
    
    return recommendations
  }
  
  async checkMissingIndexes() {
    // Find potential missing indexes based on query patterns
    const missingIndexes = await this.sql`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'public'
        AND n_distinct > 100
        AND correlation < 0.1
      ORDER BY n_distinct DESC
    `
    
    const recommendations = missingIndexes.map(stat => ({
      table: stat.tablename,
      column: stat.attname,
      reason: `High cardinality column (${stat.n_distinct} distinct values) with low correlation`,
      suggestedIndex: `CREATE INDEX idx_${stat.tablename}_${stat.attname} ON ${stat.tablename} (${stat.attname});`,
    }))
    
    return recommendations
  }
  
  async optimizeTableStatistics() {
    // Check when tables were last analyzed
    const staleStats = await this.sql`
      SELECT 
        schemaname,
        tablename,
        last_analyze,
        last_autoanalyze,
        n_dead_tup,
        n_live_tup
      FROM pg_stat_user_tables
      WHERE last_analyze < NOW() - INTERVAL '7 days'
         OR (n_dead_tup::float / NULLIF(n_live_tup, 0)) > 0.1
    `
    
    const recommendations = []
    
    for (const table of staleStats) {
      if (!table.last_analyze || new Date(table.last_analyze) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
        recommendations.push({
          table: table.tablename,
          issue: 'Stale statistics',
          action: `ANALYZE ${table.tablename};`,
          reason: 'Table statistics are older than 7 days',
        })
      }
      
      const deadTupRatio = table.n_dead_tup / (table.n_live_tup || 1)
      if (deadTupRatio > 0.1) {
        recommendations.push({
          table: table.tablename,
          issue: 'High dead tuple ratio',
          action: `VACUUM ANALYZE ${table.tablename};`,
          reason: `Dead tuple ratio: ${(deadTupRatio * 100).toFixed(1)}%`,
        })
      }
    }
    
    return recommendations
  }
  
  private sanitizeQuery(query: string): string {
    // Remove sensitive data from query for logging
    return query
      .replace(/\$\d+/g, '?')
      .replace(/'[^']*'/g, "'?'")
      .replace(/\b\d+\b/g, '?')
      .substring(0, 200)
  }
}

export const queryOptimizer = new QueryOptimizer()
```

## Index Management and Optimization

### Automated Index Analysis

Implement comprehensive index monitoring and optimization:

```typescript
// lib/monitoring/index-monitor.ts
interface IndexMetrics {
  indexName: string
  tableName: string
  indexSize: number
  usageCount: number
  lastUsed: Date | null
  efficiency: number
  maintenanceNeeded: boolean
}

export class IndexMonitor {
  private sql = getConnectionForEnvironment()
  
  async analyzeAllIndexes(): Promise<IndexMetrics[]> {
    const indexStats = await this.sql`
      SELECT 
        i.indexname,
        i.tablename,
        i.idx_scan,
        i.idx_tup_read,
        i.idx_tup_fetch,
        pg_relation_size(i.indexrelid) as index_size,
        t.seq_scan,
        t.seq_tup_read,
        pg_stat_get_last_autoanalyze_time(i.relid) as last_analyze
      FROM pg_stat_user_indexes i
      JOIN pg_stat_user_tables t ON i.relid = t.relid
      WHERE i.indexname NOT LIKE 'pg_%'
      ORDER BY i.idx_scan DESC
    `
    
    return indexStats.map(stat => ({
      indexName: stat.indexname,
      tableName: stat.tablename,
      indexSize: stat.index_size,
      usageCount: stat.idx_scan,
      lastUsed: stat.last_analyze ? new Date(stat.last_analyze) : null,
      efficiency: this.calculateIndexEfficiency(stat),
      maintenanceNeeded: this.checkMaintenanceNeeded(stat),
    }))
  }
  
  private calculateIndexEfficiency(stat: any): number {
    if (stat.idx_scan === 0) return 0
    
    // Compare index scans vs sequential scans
    const totalScans = stat.idx_scan + stat.seq_scan
    if (totalScans === 0) return 0
    
    return (stat.idx_scan / totalScans) * 100
  }
  
  private checkMaintenanceNeeded(stat: any): boolean {
    // Check if index hasn't been used recently
    if (stat.idx_scan === 0) return true
    
    // Check if sequential scans are more frequent than index scans
    if (stat.seq_scan > stat.idx_scan * 2) return true
    
    // Check if index is very large but rarely used
    const sizeMB = stat.index_size / (1024 * 1024)
    if (sizeMB > 100 && stat.idx_scan < 10) return true
    
    return false
  }
  
  async generateIndexRecommendations() {
    const metrics = await this.analyzeAllIndexes()
    const recommendations = []
    
    // Unused indexes
    const unusedIndexes = metrics.filter(m => m.usageCount === 0)
    for (const index of unusedIndexes) {
      recommendations.push({
        type: 'DROP_UNUSED',
        indexName: index.indexName,
        tableName: index.tableName,
        reason: 'Index has never been used',
        action: `DROP INDEX ${index.indexName};`,
        impact: 'Reduces storage and maintenance overhead',
        sizeMB: (index.indexSize / (1024 * 1024)).toFixed(1),
      })
    }
    
    // Inefficient indexes
    const inefficientIndexes = metrics.filter(m => m.efficiency < 50 && m.usageCount > 0)
    for (const index of inefficientIndexes) {
      recommendations.push({
        type: 'OPTIMIZE_INEFFICIENT',
        indexName: index.indexName,
        tableName: index.tableName,
        reason: `Low efficiency: ${index.efficiency.toFixed(1)}%`,
        action: `REINDEX INDEX ${index.indexName};`,
        impact: 'May improve query performance',
        efficiency: index.efficiency,
      })
    }
    
    // Check for missing indexes on vector columns
    await this.checkVectorIndexes(recommendations)
    
    return recommendations
  }
  
  private async checkVectorIndexes(recommendations: any[]) {
    // Check for vector columns without HNSW indexes
    const vectorColumns = await this.sql`
      SELECT 
        t.table_name,
        c.column_name
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
        AND c.data_type = 'USER-DEFINED'
        AND c.udt_name = 'halfvec'
    `
    
    for (const col of vectorColumns) {
      const hasIndex = await this.sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = ${col.table_name}
          AND indexdef LIKE '%' || ${col.column_name} || '%'
          AND indexdef LIKE '%hnsw%'
      `
      
      if (hasIndex.length === 0) {
        recommendations.push({
          type: 'CREATE_VECTOR_INDEX',
          tableName: col.table_name,
          columnName: col.column_name,
          reason: 'Vector column without HNSW index',
          action: `CREATE INDEX idx_${col.table_name}_${col.column_name}_hnsw ON ${col.table_name} USING hnsw (${col.column_name} halfvec_cosine_ops);`,
          impact: 'Will significantly improve vector search performance',
        })
      }
    }
  }
  
  async performIndexMaintenance() {
    const metrics = await this.analyzeAllIndexes()
    const maintenanceActions = []
    
    // Reindex fragmented indexes
    const fragmentedIndexes = metrics.filter(m => m.maintenanceNeeded && m.usageCount > 0)
    
    for (const index of fragmentedIndexes) {
      try {
        await this.sql`REINDEX INDEX CONCURRENTLY ${index.indexName}`
        maintenanceActions.push({
          action: 'REINDEXED',
          indexName: index.indexName,
          reason: 'Maintenance needed',
          success: true,
        })
      } catch (error) {
        maintenanceActions.push({
          action: 'REINDEX_FAILED',
          indexName: index.indexName,
          error: (error as Error).message,
          success: false,
        })
      }
    }
    
    return maintenanceActions
  }
}

export const indexMonitor = new IndexMonitor()
```

## Connection Pool Monitoring

### Neon Connection Management

Monitor and optimize Neon serverless connections:

```typescript
// lib/monitoring/connection-monitor.ts
interface ConnectionPoolMetrics {
  activeConnections: number
  totalConnections: number
  connectionErrors: number
  averageConnectionTime: number
  poolUtilization: number
  cacheHitRate: number
}

export class ConnectionPoolMonitor {
  private connectionMetrics: ConnectionPoolMetrics = {
    activeConnections: 0,
    totalConnections: 0,
    connectionErrors: 0,
    averageConnectionTime: 0,
    poolUtilization: 0,
    cacheHitRate: 0,
  }
  
  private connectionTimes: number[] = []
  private readonly maxMetricsHistory = 100
  
  async monitorConnection<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = performance.now()
    this.connectionMetrics.totalConnections++
    this.connectionMetrics.activeConnections++
    
    try {
      const result = await operation()
      
      const connectionTime = performance.now() - startTime
      this.recordConnectionTime(connectionTime)
      
      // Check if result came from cache
      const cacheHit = this.detectCacheHit(result)
      this.updateCacheHitRate(cacheHit)
      
      this.logConnectionSuccess(operationName, connectionTime, cacheHit)
      
      return result
      
    } catch (error) {
      this.connectionMetrics.connectionErrors++
      this.logConnectionError(operationName, error as Error)
      throw error
      
    } finally {
      this.connectionMetrics.activeConnections--
      this.updatePoolUtilization()
    }
  }
  
  private recordConnectionTime(time: number) {
    this.connectionTimes.push(time)
    
    if (this.connectionTimes.length > this.maxMetricsHistory) {
      this.connectionTimes = this.connectionTimes.slice(-this.maxMetricsHistory)
    }
    
    this.connectionMetrics.averageConnectionTime = 
      this.connectionTimes.reduce((sum, t) => sum + t, 0) / this.connectionTimes.length
  }
  
  private detectCacheHit(result: any): boolean {
    // Detect Neon connection caching
    return typeof result === 'object' && 
           result?.['x-neon-connection-cached'] === 'true'
  }
  
  private updateCacheHitRate(cacheHit: boolean) {
    // Simple moving average for cache hit rate
    const weight = 0.1
    this.connectionMetrics.cacheHitRate = 
      this.connectionMetrics.cacheHitRate * (1 - weight) + 
      (cacheHit ? 1 : 0) * weight
  }
  
  private updatePoolUtilization() {
    // Calculate pool utilization (simplified for serverless)
    const maxConnections = 20 // Typical Neon limit
    this.connectionMetrics.poolUtilization = 
      (this.connectionMetrics.activeConnections / maxConnections) * 100
  }
  
  private logConnectionSuccess(
    operationName: string, 
    connectionTime: number, 
    cacheHit: boolean
  ) {
    if (connectionTime > 2000) { // Log slow connections
      console.warn('Slow database connection', {
        type: 'slow_connection',
        operation: operationName,
        connectionTime,
        cacheHit,
        timestamp: new Date().toISOString(),
      })
    }
  }
  
  private logConnectionError(operationName: string, error: Error) {
    console.error('Database connection error', {
      type: 'connection_error',
      operation: operationName,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  }
  
  async checkConnectionHealth() {
    const sql = getConnectionForEnvironment()
    const startTime = performance.now()
    
    try {
      const result = await sql`
        SELECT 
          current_database(),
          current_user,
          NOW() as current_time,
          version()
      `
      
      const responseTime = performance.now() - startTime
      
      return {
        healthy: true,
        responseTime,
        database: result[0].current_database,
        user: result[0].current_user,
        timestamp: result[0].current_time,
        version: result[0].version,
      }
      
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        responseTime: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      }
    }
  }
  
  getConnectionMetrics(): ConnectionPoolMetrics {
    return { ...this.connectionMetrics }
  }
  
  generateConnectionReport() {
    const metrics = this.getConnectionMetrics()
    const health = metrics.connectionErrors === 0
    
    return {
      health: health ? 'healthy' : 'degraded',
      metrics,
      recommendations: this.generateConnectionRecommendations(metrics),
      timestamp: new Date().toISOString(),
    }
  }
  
  private generateConnectionRecommendations(metrics: ConnectionPoolMetrics): string[] {
    const recommendations: string[] = []
    
    if (metrics.averageConnectionTime > 1000) {
      recommendations.push('High average connection time - consider connection pooling optimization')
    }
    
    if (metrics.connectionErrors > 0) {
      recommendations.push('Connection errors detected - review connection configuration')
    }
    
    if (metrics.poolUtilization > 80) {
      recommendations.push('High pool utilization - consider increasing connection limits')
    }
    
    if (metrics.cacheHitRate < 0.5) {
      recommendations.push('Low connection cache hit rate - review connection reuse patterns')
    }
    
    return recommendations
  }
}

export const connectionMonitor = new ConnectionPoolMonitor()
```

## Automated Performance Analysis

### Performance Dashboard API

Create an API endpoint for performance monitoring dashboard:

```typescript
// app/api/admin/performance/route.ts
import { 
  neonMonitor, 
  vectorMonitor, 
  slowQueryMonitor, 
  indexMonitor, 
  connectionMonitor 
} from '@/lib/monitoring'

export async function GET() {
  try {
    // Gather all performance metrics
    const [
      neonStats,
      vectorReport,
      slowQueryReport,
      indexMetrics,
      connectionMetrics,
      connectionHealth
    ] = await Promise.all([
      neonMonitor.getPerformanceStats(),
      Promise.resolve({}), // vectorMonitor.getReport() if available
      slowQueryMonitor.getSlowQueryReport(),
      indexMonitor.analyzeAllIndexes(),
      connectionMonitor.getConnectionMetrics(),
      connectionMonitor.checkConnectionHealth(),
    ])
    
    const performanceDashboard = {
      timestamp: new Date().toISOString(),
      overall_health: connectionHealth.healthy ? 'healthy' : 'degraded',
      
      database: {
        connection_health: connectionHealth,
        neon_performance: neonStats,
        connection_pool: connectionMetrics,
      },
      
      queries: {
        slow_queries: slowQueryReport,
        query_optimization_needed: slowQueryReport.totalSlowQueries > 5,
      },
      
      indexes: {
        total_indexes: indexMetrics.length,
        unused_indexes: indexMetrics.filter(m => m.usageCount === 0).length,
        maintenance_needed: indexMetrics.filter(m => m.maintenanceNeeded).length,
      },
      
      vector_search: vectorReport,
      
      recommendations: await generatePerformanceRecommendations({
        neonStats,
        slowQueryReport,
        indexMetrics,
        connectionMetrics,
      }),
    }
    
    return Response.json(performanceDashboard)
    
  } catch (error) {
    console.error('Performance dashboard error:', error)
    return Response.json(
      { error: 'Failed to generate performance report' },
      { status: 500 }
    )
  }
}

async function generatePerformanceRecommendations(data: any): Promise<string[]> {
  const recommendations: string[] = []
  
  // Database performance recommendations
  if (data.neonStats?.errorRate > 0.05) {
    recommendations.push('High database error rate detected - review connection stability')
  }
  
  if (data.neonStats?.averageTotalTime > 2000) {
    recommendations.push('High average query execution time - consider query optimization')
  }
  
  // Slow query recommendations
  if (data.slowQueryReport?.totalSlowQueries > 10) {
    recommendations.push('Multiple slow queries detected - prioritize query optimization')
  }
  
  // Index recommendations
  if (data.indexMetrics?.filter((m: any) => m.usageCount === 0).length > 0) {
    recommendations.push('Unused indexes found - consider dropping to reduce maintenance overhead')
  }
  
  // Connection recommendations
  if (data.connectionMetrics?.averageConnectionTime > 1000) {
    recommendations.push('Slow database connections - review connection pooling configuration')
  }
  
  return recommendations
}

// Performance optimization endpoint
export async function POST(request: Request) {
  try {
    const { action } = await request.json()
    
    switch (action) {
      case 'optimize_indexes':
        const indexRecommendations = await indexMonitor.generateIndexRecommendations()
        return Response.json({ recommendations: indexRecommendations })
        
      case 'analyze_queries':
        const queryRecommendations = await slowQueryMonitor.getSlowQueryReport()
        return Response.json({ analysis: queryRecommendations })
        
      case 'health_check':
        const health = await connectionMonitor.checkConnectionHealth()
        return Response.json({ health })
        
      default:
        return Response.json(
          { error: 'Unknown action' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('Performance optimization error:', error)
    return Response.json(
      { error: 'Optimization failed' },
      { status: 500 }
    )
  }
}
```

## Cost-Effective Monitoring Solutions

### DIY Performance Monitoring

Implement cost-effective monitoring using built-in PostgreSQL features:

```typescript
// lib/monitoring/cost-effective-monitoring.ts
export class CostEffectiveMonitor {
  private sql = getConnectionForEnvironment()
  
  async generateDailyPerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      database_health: await this.checkDatabaseHealth(),
      query_performance: await this.analyzeQueryPerformance(),
      storage_usage: await this.checkStorageUsage(),
      index_efficiency: await this.checkIndexEfficiency(),
      recommendations: [] as string[],
    }
    
    // Generate actionable recommendations
    report.recommendations = this.generateRecommendations(report)
    
    // Log to console for collection by log aggregation
    console.log('DAILY_PERFORMANCE_REPORT', JSON.stringify(report))
    
    return report
  }
  
  private async checkDatabaseHealth() {
    const [
      connectionStats,
      lockStats,
      cacheStats
    ] = await Promise.all([
      this.sql`SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active'`,
      this.sql`SELECT count(*) as blocked_queries FROM pg_stat_activity WHERE wait_event_type = 'Lock'`,
      this.sql`
        SELECT 
          sum(heap_blks_hit) as cache_hits,
          sum(heap_blks_read) as disk_reads,
          round(sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as cache_hit_ratio
        FROM pg_statio_user_tables
      `
    ])
    
    return {
      active_connections: connectionStats[0].active_connections,
      blocked_queries: lockStats[0].blocked_queries,
      cache_hit_ratio: cacheStats[0]?.cache_hit_ratio || 0,
      status: this.determineHealthStatus(connectionStats[0], lockStats[0], cacheStats[0]),
    }
  }
  
  private async analyzeQueryPerformance() {
    // Use pg_stat_statements if available, fall back to basic metrics
    try {
      const queryStats = await this.sql`
        SELECT 
          count(*) as total_queries,
          avg(mean_exec_time) as avg_execution_time,
          max(max_exec_time) as max_execution_time,
          count(*) FILTER (WHERE mean_exec_time > 1000) as slow_queries
        FROM pg_stat_statements
      `
      
      return queryStats[0]
    } catch {
      // Fallback if pg_stat_statements not available
      return {
        total_queries: 0,
        avg_execution_time: 0,
        max_execution_time: 0,
        slow_queries: 0,
        note: 'pg_stat_statements extension not available',
      }
    }
  }
  
  private async checkStorageUsage() {
    const storageStats = await this.sql`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        pg_database_size(current_database()) as database_size_bytes
    `
    
    const tableStats = await this.sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_total_relation_size(schemaname||'.'||tablename) as table_size_bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 5
    `
    
    return {
      total_database_size: storageStats[0].database_size,
      database_size_bytes: storageStats[0].database_size_bytes,
      largest_tables: tableStats,
    }
  }
  
  private async checkIndexEfficiency() {
    const indexStats = await this.sql`
      SELECT 
        count(*) as total_indexes,
        count(*) FILTER (WHERE idx_scan = 0) as unused_indexes,
        avg(idx_scan) as avg_index_scans,
        sum(pg_relation_size(indexrelid)) as total_index_size
      FROM pg_stat_user_indexes
    `
    
    return indexStats[0]
  }
  
  private determineHealthStatus(connections: any, locks: any, cache: any): string {
    if (connections.active_connections > 50) return 'warning'
    if (locks.blocked_queries > 5) return 'warning'
    if (cache.cache_hit_ratio < 95) return 'warning'
    return 'healthy'
  }
  
  private generateRecommendations(report: any): string[] {
    const recommendations: string[] = []
    
    if (report.database_health.cache_hit_ratio < 95) {
      recommendations.push('Low cache hit ratio - consider increasing shared_buffers or optimizing queries')
    }
    
    if (report.query_performance.slow_queries > 5) {
      recommendations.push(`${report.query_performance.slow_queries} slow queries detected - review and optimize`)
    }
    
    if (report.index_efficiency.unused_indexes > 0) {
      recommendations.push(`${report.index_efficiency.unused_indexes} unused indexes found - consider dropping`)
    }
    
    if (report.database_health.blocked_queries > 0) {
      recommendations.push('Blocked queries detected - review locking patterns')
    }
    
    return recommendations
  }
  
  async setupPerformanceLogging() {
    // Enable query logging for slow queries
    try {
      await this.sql`ALTER SYSTEM SET log_min_duration_statement = 1000` // 1 second
      await this.sql`ALTER SYSTEM SET log_statement = 'all'`
      await this.sql`SELECT pg_reload_conf()`
      
      return { success: true, message: 'Performance logging enabled' }
    } catch (error) {
      return { 
        success: false, 
        message: 'Could not enable performance logging - insufficient permissions',
        error: (error as Error).message,
      }
    }
  }
}

export const costEffectiveMonitor = new CostEffectiveMonitor()
```

### Alerting on a Budget

Implement simple but effective alerting:

```typescript
// lib/monitoring/budget-alerting.ts
interface AlertThresholds {
  maxSlowQueries: number
  maxConnectionTime: number
  minCacheHitRate: number
  maxErrorRate: number
  maxDatabaseSize: number // in bytes
}

export class BudgetAlerting {
  private readonly thresholds: AlertThresholds = {
    maxSlowQueries: 10,
    maxConnectionTime: 2000,
    minCacheHitRate: 95,
    maxErrorRate: 0.05,
    maxDatabaseSize: 1024 * 1024 * 1024, // 1GB
  }
  
  private readonly webhookUrl = process.env.ALERT_WEBHOOK_URL
  
  async checkAndAlert() {
    const metrics = await this.gatherMetrics()
    const alerts = this.evaluateThresholds(metrics)
    
    if (alerts.length > 0) {
      await this.sendAlerts(alerts)
    }
    
    return { alertsSent: alerts.length, alerts }
  }
  
  private async gatherMetrics() {
    const sql = getConnectionForEnvironment()
    
    const [slowQueries, connectionHealth, cacheStats, dbSize] = await Promise.all([
      this.getSlowQueryCount(),
      connectionMonitor.checkConnectionHealth(),
      this.getCacheStats(),
      this.getDatabaseSize(),
    ])
    
    return {
      slowQueries,
      connectionTime: connectionHealth.responseTime,
      cacheHitRate: cacheStats.cache_hit_ratio,
      isHealthy: connectionHealth.healthy,
      databaseSize: dbSize.size_bytes,
    }
  }
  
  private async getSlowQueryCount() {
    try {
      const sql = getConnectionForEnvironment()
      const result = await sql`
        SELECT count(*) as slow_queries
        FROM pg_stat_statements 
        WHERE mean_exec_time > 1000
      `
      return result[0]?.slow_queries || 0
    } catch {
      return 0
    }
  }
  
  private async getCacheStats() {
    const sql = getConnectionForEnvironment()
    const result = await sql`
      SELECT 
        round(
          sum(heap_blks_hit) * 100.0 / 
          nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 
          2
        ) as cache_hit_ratio
      FROM pg_statio_user_tables
    `
    return result[0] || { cache_hit_ratio: 100 }
  }
  
  private async getDatabaseSize() {
    const sql = getConnectionForEnvironment()
    const result = await sql`
      SELECT pg_database_size(current_database()) as size_bytes
    `
    return result[0]
  }
  
  private evaluateThresholds(metrics: any): Array<{ type: string; message: string; severity: 'warning' | 'critical' }> {
    const alerts = []
    
    if (metrics.slowQueries > this.thresholds.maxSlowQueries) {
      alerts.push({
        type: 'SLOW_QUERIES',
        message: `${metrics.slowQueries} slow queries detected (threshold: ${this.thresholds.maxSlowQueries})`,
        severity: 'warning' as const,
      })
    }
    
    if (metrics.connectionTime > this.thresholds.maxConnectionTime) {
      alerts.push({
        type: 'SLOW_CONNECTION',
        message: `Database connection time: ${metrics.connectionTime}ms (threshold: ${this.thresholds.maxConnectionTime}ms)`,
        severity: 'warning' as const,
      })
    }
    
    if (metrics.cacheHitRate < this.thresholds.minCacheHitRate) {
      alerts.push({
        type: 'LOW_CACHE_HIT_RATE',
        message: `Cache hit rate: ${metrics.cacheHitRate}% (threshold: ${this.thresholds.minCacheHitRate}%)`,
        severity: 'warning' as const,
      })
    }
    
    if (!metrics.isHealthy) {
      alerts.push({
        type: 'DATABASE_UNHEALTHY',
        message: 'Database health check failed',
        severity: 'critical' as const,
      })
    }
    
    if (metrics.databaseSize > this.thresholds.maxDatabaseSize) {
      alerts.push({
        type: 'DATABASE_SIZE_LIMIT',
        message: `Database size: ${(metrics.databaseSize / (1024 * 1024 * 1024)).toFixed(2)}GB (threshold: ${(this.thresholds.maxDatabaseSize / (1024 * 1024 * 1024)).toFixed(2)}GB)`,
        severity: 'warning' as const,
      })
    }
    
    return alerts
  }
  
  private async sendAlerts(alerts: Array<{ type: string; message: string; severity: string }>) {
    const alertPayload = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      service: 'contribux-database',
      alerts,
    }
    
    // Log to console for log-based alerting
    console.error('DATABASE_ALERTS', JSON.stringify(alertPayload))
    
    // Send to webhook if configured
    if (this.webhookUrl) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertPayload),
        })
      } catch (error) {
        console.error('Failed to send webhook alert:', error)
      }
    }
    
    // Send to email if configured (using simple SMTP)
    if (process.env.ALERT_EMAIL) {
      await this.sendEmailAlert(alertPayload)
    }
  }
  
  private async sendEmailAlert(alertPayload: any) {
    // Simple email alerting using nodemailer or similar
    const subject = `Database Alert: ${alertPayload.alerts.length} issue(s) detected`
    const body = `
Database alerts detected at ${alertPayload.timestamp}:

${alertPayload.alerts.map((alert: any) => 
  `• ${alert.type}: ${alert.message} (${alert.severity})`
).join('\n')}

Environment: ${alertPayload.environment}
Service: ${alertPayload.service}
    `
    
    console.log('EMAIL_ALERT', { subject, body })
    
    // TODO: Implement actual email sending if needed
    // This could be done via SendGrid, AWS SES, or similar service
  }
}

export const budgetAlerting = new BudgetAlerting()
```

## Performance Tuning Strategies

### Automated Tuning Recommendations

Implement automated performance tuning suggestions:

```typescript
// lib/monitoring/performance-tuner.ts
export class PerformanceTuner {
  private sql = getConnectionForEnvironment()
  
  async generateTuningRecommendations() {
    const analysis = await this.analyzeCurrentPerformance()
    const recommendations = []
    
    // Query performance tuning
    if (analysis.query_performance.slow_queries > 5) {
      recommendations.push(...await this.getQueryOptimizationRecommendations())
    }
    
    // Index optimization
    if (analysis.index_efficiency.unused_indexes > 0) {
      recommendations.push(...await this.getIndexOptimizationRecommendations())
    }
    
    // Vector search optimization
    if (analysis.vector_search.avg_search_time > 1000) {
      recommendations.push(...await this.getVectorOptimizationRecommendations())
    }
    
    // Connection optimization
    if (analysis.connection_health.avg_connection_time > 500) {
      recommendations.push(...await this.getConnectionOptimizationRecommendations())
    }
    
    return {
      analysis,
      recommendations,
      priority_actions: this.prioritizeRecommendations(recommendations),
    }
  }
  
  private async analyzeCurrentPerformance() {
    const [
      queryPerf,
      indexEff,
      vectorPerf,
      connectionHealth
    ] = await Promise.all([
      this.analyzeQueryPerformance(),
      this.analyzeIndexEfficiency(),
      this.analyzeVectorPerformance(),
      this.analyzeConnectionHealth(),
    ])
    
    return {
      query_performance: queryPerf,
      index_efficiency: indexEff,
      vector_search: vectorPerf,
      connection_health: connectionHealth,
    }
  }
  
  private async getQueryOptimizationRecommendations() {
    const recommendations = []
    
    // Find most expensive queries
    const expensiveQueries = await this.sql`
      SELECT 
        query,
        total_exec_time,
        calls,
        mean_exec_time
      FROM pg_stat_statements 
      ORDER BY total_exec_time DESC 
      LIMIT 5
    `
    
    for (const query of expensiveQueries) {
      if (query.mean_exec_time > 1000) {
        recommendations.push({
          type: 'OPTIMIZE_QUERY',
          priority: 'HIGH',
          description: `Query with ${query.mean_exec_time.toFixed(0)}ms average execution time`,
          action: 'Review and optimize this query',
          query_snippet: query.query.substring(0, 100) + '...',
          impact: 'Can reduce query execution time and improve user experience',
        })
      }
    }
    
    return recommendations
  }
  
  private async getIndexOptimizationRecommendations() {
    const recommendations = []
    
    // Find unused indexes
    const unusedIndexes = await this.sql`
      SELECT indexname, tablename
      FROM pg_stat_user_indexes 
      WHERE idx_scan = 0
    `
    
    for (const index of unusedIndexes) {
      recommendations.push({
        type: 'DROP_UNUSED_INDEX',
        priority: 'MEDIUM',
        description: `Unused index: ${index.indexname}`,
        action: `DROP INDEX ${index.indexname};`,
        impact: 'Reduces storage usage and maintenance overhead',
      })
    }
    
    // Find missing indexes for frequent WHERE clauses
    const potentialIndexes = await this.findPotentialIndexes()
    
    for (const suggestion of potentialIndexes) {
      recommendations.push({
        type: 'CREATE_INDEX',
        priority: 'HIGH',
        description: `Missing index on ${suggestion.table}.${suggestion.column}`,
        action: `CREATE INDEX idx_${suggestion.table}_${suggestion.column} ON ${suggestion.table} (${suggestion.column});`,
        impact: 'Can significantly improve query performance',
      })
    }
    
    return recommendations
  }
  
  private async findPotentialIndexes() {
    // This is a simplified approach - in practice, you'd analyze query patterns
    const highCardinalityColumns = await this.sql`
      SELECT 
        tablename as table,
        attname as column,
        n_distinct
      FROM pg_stats 
      WHERE schemaname = 'public'
        AND n_distinct > 100
        AND tablename IN ('users', 'repositories', 'opportunities')
    `
    
    return highCardinalityColumns
      .filter(col => !col.column.includes('embedding')) // Skip vector columns
      .map(col => ({
        table: col.table,
        column: col.column,
        distinctValues: col.n_distinct,
      }))
  }
  
  private async getVectorOptimizationRecommendations() {
    const recommendations = []
    
    // Check HNSW parameters
    const currentEfSearch = await this.sql`SHOW hnsw.ef_search`
    const efSearchValue = parseInt(currentEfSearch[0]?.hnsw?.ef_search || '200')
    
    if (efSearchValue < 100) {
      recommendations.push({
        type: 'OPTIMIZE_HNSW_PARAMS',
        priority: 'HIGH',
        description: 'HNSW ef_search parameter is too low',
        action: 'SET hnsw.ef_search = 200;',
        impact: 'Improves vector search accuracy',
      })
    }
    
    // Check for missing vector indexes
    const vectorColumns = await this.sql`
      SELECT table_name, column_name
      FROM information_schema.columns 
      WHERE data_type = 'USER-DEFINED' 
        AND udt_name = 'halfvec'
        AND table_schema = 'public'
    `
    
    for (const col of vectorColumns) {
      const hasIndex = await this.sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = ${col.table_name}
          AND indexdef LIKE '%' || ${col.column_name} || '%'
          AND indexdef LIKE '%hnsw%'
      `
      
      if (hasIndex.length === 0) {
        recommendations.push({
          type: 'CREATE_VECTOR_INDEX',
          priority: 'CRITICAL',
          description: `Missing HNSW index on ${col.table_name}.${col.column_name}`,
          action: `CREATE INDEX idx_${col.table_name}_${col.column_name}_hnsw ON ${col.table_name} USING hnsw (${col.column_name} halfvec_cosine_ops);`,
          impact: 'Essential for efficient vector search operations',
        })
      }
    }
    
    return recommendations
  }
  
  private async getConnectionOptimizationRecommendations() {
    const recommendations = []
    
    // Check connection patterns
    const activeConnections = await this.sql`
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `
    
    if (activeConnections[0].active_connections > 20) {
      recommendations.push({
        type: 'OPTIMIZE_CONNECTIONS',
        priority: 'HIGH',
        description: 'High number of active connections detected',
        action: 'Implement connection pooling and review connection lifecycle',
        impact: 'Reduces connection overhead and improves stability',
      })
    }
    
    return recommendations
  }
  
  private prioritizeRecommendations(recommendations: any[]): any[] {
    const priorityOrder = { 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 }
    
    return recommendations
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 5) // Top 5 priority actions
  }
  
  private async analyzeQueryPerformance() {
    try {
      const result = await this.sql`
        SELECT 
          count(*) as total_queries,
          avg(mean_exec_time) as avg_exec_time,
          count(*) FILTER (WHERE mean_exec_time > 1000) as slow_queries
        FROM pg_stat_statements
      `
      return result[0] || { total_queries: 0, avg_exec_time: 0, slow_queries: 0 }
    } catch {
      return { total_queries: 0, avg_exec_time: 0, slow_queries: 0 }
    }
  }
  
  private async analyzeIndexEfficiency() {
    const result = await this.sql`
      SELECT 
        count(*) as total_indexes,
        count(*) FILTER (WHERE idx_scan = 0) as unused_indexes
      FROM pg_stat_user_indexes
    `
    return result[0]
  }
  
  private async analyzeVectorPerformance() {
    // This would integrate with your vector monitoring
    return {
      avg_search_time: 500, // Mock data
      index_usage: 85,
      similarity_scores: 0.8,
    }
  }
  
  private async analyzeConnectionHealth() {
    const health = await connectionMonitor.checkConnectionHealth()
    return {
      avg_connection_time: health.responseTime,
      is_healthy: health.healthy,
    }
  }
}

export const performanceTuner = new PerformanceTuner()
```

## Alerting and Incident Response

### Incident Response Automation

Create automated incident response for database issues:

```typescript
// lib/monitoring/incident-response.ts
interface Incident {
  id: string
  type: 'performance' | 'availability' | 'error' | 'capacity'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  timestamp: Date
  resolved: boolean
  auto_resolution_attempted: boolean
}

export class IncidentResponseSystem {
  private activeIncidents: Map<string, Incident> = new Map()
  
  async detectAndRespond() {
    const issues = await this.detectIssues()
    
    for (const issue of issues) {
      const incidentId = this.generateIncidentId(issue)
      
      if (!this.activeIncidents.has(incidentId)) {
        const incident = this.createIncident(incidentId, issue)
        this.activeIncidents.set(incidentId, incident)
        
        await this.handleIncident(incident)
      }
    }
    
    return Array.from(this.activeIncidents.values())
  }
  
  private async detectIssues() {
    const issues = []
    
    // Check database connectivity
    const connectionHealth = await connectionMonitor.checkConnectionHealth()
    if (!connectionHealth.healthy) {
      issues.push({
        type: 'availability',
        severity: 'critical',
        description: 'Database connection failed',
        metrics: connectionHealth,
      })
    }
    
    // Check for slow queries
    const slowQueries = await slowQueryMonitor.getSlowQueryReport()
    if (slowQueries.totalSlowQueries > 10) {
      issues.push({
        type: 'performance',
        severity: 'high',
        description: `${slowQueries.totalSlowQueries} slow queries detected`,
        metrics: slowQueries,
      })
    }
    
    // Check connection metrics
    const connectionMetrics = connectionMonitor.getConnectionMetrics()
    if (connectionMetrics.averageConnectionTime > 3000) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        description: 'High database connection latency',
        metrics: connectionMetrics,
      })
    }
    
    // Check error rates
    if (connectionMetrics.connectionErrors > 5) {
      issues.push({
        type: 'error',
        severity: 'high',
        description: 'High database error rate',
        metrics: connectionMetrics,
      })
    }
    
    return issues
  }
  
  private async handleIncident(incident: Incident) {
    console.log(`Incident detected: ${incident.description}`, {
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
      timestamp: incident.timestamp.toISOString(),
    })
    
    // Attempt automatic resolution
    const resolved = await this.attemptAutoResolution(incident)
    
    if (resolved) {
      incident.resolved = true
      incident.auto_resolution_attempted = true
      this.activeIncidents.delete(incident.id)
      
      console.log(`Incident auto-resolved: ${incident.description}`, {
        id: incident.id,
        resolution_time: new Date().getTime() - incident.timestamp.getTime(),
      })
    } else {
      // Alert human operators
      await this.alertOperators(incident)
    }
  }
  
  private async attemptAutoResolution(incident: Incident): Promise<boolean> {
    try {
      switch (incident.type) {
        case 'performance':
          return await this.resolvePerformanceIssue(incident)
          
        case 'availability':
          return await this.resolveAvailabilityIssue(incident)
          
        case 'error':
          return await this.resolveErrorIssue(incident)
          
        default:
          return false
      }
    } catch (error) {
      console.error('Auto-resolution failed:', error)
      return false
    }
  }
  
  private async resolvePerformanceIssue(incident: Incident): Promise<boolean> {
    // Attempt to resolve performance issues
    
    if (incident.description.includes('slow queries')) {
      // Kill long-running queries
      const sql = getConnectionForEnvironment()
      
      const longRunningQueries = await sql`
        SELECT pid, query_start, query 
        FROM pg_stat_activity 
        WHERE state = 'active' 
          AND query_start < NOW() - INTERVAL '30 seconds'
          AND query NOT LIKE '%pg_stat_activity%'
      `
      
      for (const query of longRunningQueries) {
        await sql`SELECT pg_cancel_backend(${query.pid})`
        console.log(`Cancelled long-running query: PID ${query.pid}`)
      }
      
      return longRunningQueries.length > 0
    }
    
    if (incident.description.includes('connection latency')) {
      // Clear connection cache
      try {
        // Force new connections by clearing cache
        global.__db_connection_cache = undefined
        return true
      } catch {
        return false
      }
    }
    
    return false
  }
  
  private async resolveAvailabilityIssue(incident: Incident): Promise<boolean> {
    // Attempt to resolve availability issues
    
    // Wait and retry connection
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const connectionHealth = await connectionMonitor.checkConnectionHealth()
    return connectionHealth.healthy
  }
  
  private async resolveErrorIssue(incident: Incident): Promise<boolean> {
    // Attempt to resolve error issues
    
    // Reset connection pool
    try {
      global.__db_connection_cache = undefined
      
      // Test new connection
      const connectionHealth = await connectionMonitor.checkConnectionHealth()
      return connectionHealth.healthy
    } catch {
      return false
    }
  }
  
  private async alertOperators(incident: Incident) {
    const alertPayload = {
      incident_id: incident.id,
      type: incident.type,
      severity: incident.severity,
      description: incident.description,
      timestamp: incident.timestamp.toISOString(),
      auto_resolution_attempted: incident.auto_resolution_attempted,
      environment: process.env.NODE_ENV,
    }
    
    // Log critical alert
    console.error('CRITICAL_INCIDENT', JSON.stringify(alertPayload))
    
    // Send to alerting system
    if (process.env.INCIDENT_WEBHOOK_URL) {
      try {
        await fetch(process.env.INCIDENT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertPayload),
        })
      } catch (error) {
        console.error('Failed to send incident alert:', error)
      }
    }
  }
  
  private generateIncidentId(issue: any): string {
    const hash = Buffer.from(`${issue.type}-${issue.description}`).toString('base64')
    return hash.substring(0, 8)
  }
  
  private createIncident(id: string, issue: any): Incident {
    return {
      id,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      timestamp: new Date(),
      resolved: false,
      auto_resolution_attempted: false,
    }
  }
  
  getActiveIncidents(): Incident[] {
    return Array.from(this.activeIncidents.values())
  }
  
  resolveIncident(incidentId: string): boolean {
    const incident = this.activeIncidents.get(incidentId)
    if (incident) {
      incident.resolved = true
      this.activeIncidents.delete(incidentId)
      return true
    }
    return false
  }
}

export const incidentResponse = new IncidentResponseSystem()
```

## Maintenance and Optimization Workflows

### Automated Maintenance Tasks

Implement scheduled database maintenance:

```typescript
// app/api/admin/maintenance/route.ts
import { 
  costEffectiveMonitor,
  indexMonitor,
  vectorOptimizer,
  performanceTuner,
  incidentResponse
} from '@/lib/monitoring'

export async function POST(request: Request) {
  try {
    const { task } = await request.json()
    
    switch (task) {
      case 'daily_health_check':
        return await runDailyHealthCheck()
        
      case 'weekly_optimization':
        return await runWeeklyOptimization()
        
      case 'emergency_cleanup':
        return await runEmergencyCleanup()
        
      case 'performance_analysis':
        return await runPerformanceAnalysis()
        
      default:
        return Response.json(
          { error: 'Unknown maintenance task' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('Maintenance task failed:', error)
    return Response.json(
      { error: 'Maintenance failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function runDailyHealthCheck() {
  const report = await costEffectiveMonitor.generateDailyPerformanceReport()
  
  // Check for incidents
  const incidents = await incidentResponse.detectAndRespond()
  
  return Response.json({
    type: 'daily_health_check',
    timestamp: new Date().toISOString(),
    health_report: report,
    incidents: incidents.length,
    active_incidents: incidents.filter(i => !i.resolved),
  })
}

async function runWeeklyOptimization() {
  const results = {
    timestamp: new Date().toISOString(),
    index_optimization: await indexMonitor.performIndexMaintenance(),
    vector_optimization: await vectorOptimizer.maintainVectorIndexes(),
    performance_recommendations: await performanceTuner.generateTuningRecommendations(),
  }
  
  return Response.json({
    type: 'weekly_optimization',
    results,
    summary: generateOptimizationSummary(results),
  })
}

async function runEmergencyCleanup() {
  const sql = getConnectionForEnvironment()
  
  // Kill long-running queries
  const killedQueries = await sql`
    SELECT pg_cancel_backend(pid) as killed, pid, query_start
    FROM pg_stat_activity 
    WHERE state = 'active' 
      AND query_start < NOW() - INTERVAL '5 minutes'
      AND query NOT LIKE '%pg_stat_activity%'
  `
  
  // Clear connection cache
  global.__db_connection_cache = undefined
  
  return Response.json({
    type: 'emergency_cleanup',
    timestamp: new Date().toISOString(),
    killed_queries: killedQueries.length,
    cache_cleared: true,
  })
}

async function runPerformanceAnalysis() {
  const analysis = await performanceTuner.generateTuningRecommendations()
  
  return Response.json({
    type: 'performance_analysis',
    timestamp: new Date().toISOString(),
    analysis,
    recommendations_count: analysis.recommendations.length,
    priority_actions: analysis.priority_actions,
  })
}

function generateOptimizationSummary(results: any) {
  const summary = []
  
  if (results.index_optimization.length > 0) {
    summary.push(`Performed ${results.index_optimization.length} index maintenance operations`)
  }
  
  if (results.vector_optimization.reindexed) {
    summary.push('Vector indexes maintained successfully')
  }
  
  if (results.performance_recommendations.recommendations.length > 0) {
    summary.push(`Generated ${results.performance_recommendations.recommendations.length} performance recommendations`)
  }
  
  return summary.join('; ')
}

// Cron job endpoint for automated maintenance
export async function GET() {
  // This endpoint can be called by Vercel cron jobs
  try {
    const dailyReport = await costEffectiveMonitor.generateDailyPerformanceReport()
    const incidents = await incidentResponse.detectAndRespond()
    
    return Response.json({
      status: 'maintenance_completed',
      timestamp: new Date().toISOString(),
      health_score: calculateHealthScore(dailyReport),
      incidents: incidents.length,
    })
    
  } catch (error) {
    console.error('Automated maintenance failed:', error)
    return Response.json(
      { error: 'Maintenance failed' },
      { status: 500 }
    )
  }
}

function calculateHealthScore(report: any): number {
  let score = 100
  
  if (report.database_health?.status !== 'healthy') score -= 30
  if (report.query_performance?.slow_queries > 5) score -= 20
  if (report.index_efficiency?.unused_indexes > 0) score -= 10
  if (report.database_health?.cache_hit_ratio < 95) score -= 15
  
  return Math.max(score, 0)
}
```

### Performance Monitoring Scripts

Create utility scripts for database maintenance:

```typescript
// scripts/database-maintenance.ts
import { 
  costEffectiveMonitor,
  indexMonitor,
  vectorOptimizer,
  performanceTuner 
} from '../lib/monitoring'

async function main() {
  const command = process.argv[2]
  
  switch (command) {
    case 'health-check':
      await runHealthCheck()
      break
      
    case 'optimize':
      await runOptimization()
      break
      
    case 'analyze':
      await runAnalysis()
      break
      
    case 'maintenance':
      await runMaintenance()
      break
      
    default:
      console.log('Usage: npm run db:maintenance <command>')
      console.log('Commands: health-check, optimize, analyze, maintenance')
      process.exit(1)
  }
}

async function runHealthCheck() {
  console.log('Running database health check...')
  
  const report = await costEffectiveMonitor.generateDailyPerformanceReport()
  
  console.log('Health Check Results:')
  console.log('===================')
  console.log(`Database Health: ${report.database_health.status}`)
  console.log(`Cache Hit Ratio: ${report.database_health.cache_hit_ratio}%`)
  console.log(`Active Connections: ${report.database_health.active_connections}`)
  console.log(`Slow Queries: ${report.query_performance.slow_queries}`)
  
  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:')
    report.recommendations.forEach((rec: string, i: number) => {
      console.log(`${i + 1}. ${rec}`)
    })
  }
}

async function runOptimization() {
  console.log('Running database optimization...')
  
  const recommendations = await performanceTuner.generateTuningRecommendations()
  
  console.log('Optimization Recommendations:')
  console.log('=============================')
  
  recommendations.priority_actions.forEach((action: any, i: number) => {
    console.log(`${i + 1}. [${action.priority}] ${action.description}`)
    console.log(`   Action: ${action.action}`)
    console.log(`   Impact: ${action.impact}`)
    console.log('')
  })
}

async function runAnalysis() {
  console.log('Running performance analysis...')
  
  const indexMetrics = await indexMonitor.analyzeAllIndexes()
  const vectorAnalysis = await vectorOptimizer.analyzeVectorIndexPerformance()
  
  console.log('Index Analysis:')
  console.log('===============')
  console.log(`Total indexes: ${indexMetrics.length}`)
  console.log(`Unused indexes: ${indexMetrics.filter(m => m.usageCount === 0).length}`)
  console.log(`Maintenance needed: ${indexMetrics.filter(m => m.maintenanceNeeded).length}`)
  
  console.log('\nVector Search Analysis:')
  console.log('=======================')
  vectorAnalysis.recommendations.forEach((rec: string) => {
    console.log(`• ${rec}`)
  })
}

async function runMaintenance() {
  console.log('Running database maintenance...')
  
  const indexMaintenance = await indexMonitor.performIndexMaintenance()
  const vectorMaintenance = await vectorOptimizer.maintainVectorIndexes()
  
  console.log('Maintenance Results:')
  console.log('===================')
  
  if (indexMaintenance.length > 0) {
    console.log('Index maintenance:')
    indexMaintenance.forEach((action: any) => {
      console.log(`• ${action.action}: ${action.indexName} - ${action.success ? 'SUCCESS' : 'FAILED'}`)
    })
  }
  
  if (vectorMaintenance.reindexed) {
    console.log(`Vector indexes reindexed: ${vectorMaintenance.reason}`)
  } else {
    console.log('Vector indexes: No maintenance needed')
  }
}

if (require.main === module) {
  main().catch(console.error)
}
```

## Conclusion

This Database Performance Monitoring and Tuning Guide provides a comprehensive framework for maintaining optimal
database performance in the contribux platform. The implementation focuses on:

- **Neon PostgreSQL Optimization** - Serverless-specific connection and query optimization
- **Vector Search Performance** - HNSW index monitoring and optimization for AI-powered features
- **Cost-Effective Monitoring** - Practical monitoring solutions for solo developers
- **Automated Incident Response** - Proactive issue detection and resolution
- **Maintenance Workflows** - Structured approach to database maintenance and optimization

Regular implementation of these monitoring and tuning strategies will ensure the platform operates efficiently,
maintains excellent performance, and scales effectively while keeping operational costs manageable for solo developers.

The monitoring framework is designed to be:

- **Lightweight** - Minimal overhead on database performance
- **Automated** - Reduces manual maintenance requirements
- **Actionable** - Provides specific optimization recommendations
- **Cost-effective** - Uses built-in PostgreSQL features and simple alerting

This approach provides enterprise-level database performance monitoring capabilities while remaining
practical and affordable for solo developer operations.
