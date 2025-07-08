import type { NeonQueryFunction } from '@neondatabase/serverless'

// PostgreSQL execution plan node interface
export interface PostgreSQLPlanNode {
  'Node Type'?: string
  'Actual Rows'?: number
  'Index Name'?: string
  Plans?: PostgreSQLPlanNode[]
  [key: string]: unknown
}

// PostgreSQL execution plan interface
export interface PostgreSQLExecutionPlan {
  'QUERY PLAN'?: PostgreSQLPlanNode | PostgreSQLPlanNode[]
  [key: string]: unknown
}

// PostgreSQL index structure interface
export interface PostgreSQLIndex {
  schemaname: string
  tablename: string
  indexname: string
  indexdef: string
}

// Query performance metrics interface
export interface QueryMetrics {
  query: string
  executionTime: number
  rowsReturned: number
  indexesUsed: string[]
  fullTableScans: boolean
  recommendations: string[]
}

// Query optimization patterns
export interface OptimizationPattern {
  name: string
  description: string
  apply: (query: string) => string
  conditions: (query: string) => boolean
}

// Database performance analyzer
export class DatabaseQueryOptimizer {
  private db: NeonQueryFunction<false, false>
  private queryCache = new Map<string, QueryMetrics>()
  private optimizationPatterns: OptimizationPattern[]

  constructor(database: NeonQueryFunction<false, false>) {
    this.db = database
    this.optimizationPatterns = this.initializeOptimizationPatterns()
  }

  // Initialize common optimization patterns
  private initializeOptimizationPatterns(): OptimizationPattern[] {
    return [
      {
        name: 'LIMIT_LARGE_QUERIES',
        description: 'Add LIMIT to queries that might return large result sets',
        conditions: (query: string) => {
          return !query.toLowerCase().includes('limit') && !query.toLowerCase().includes('count(')
        },
        apply: (query: string) => {
          if (query.toLowerCase().includes('select') && !query.toLowerCase().includes('limit')) {
            return `${query} LIMIT 1000`
          }
          return query
        },
      },
      {
        name: 'INDEX_SUGGESTIONS',
        description: 'Suggest indexes for WHERE clause columns',
        conditions: (query: string) => {
          return query.toLowerCase().includes('where')
        },
        apply: (query: string) => {
          // This would analyze WHERE clauses and suggest indexes
          return query
        },
      },
      {
        name: 'JOIN_OPTIMIZATION',
        description: 'Optimize JOIN operations with proper indexing',
        conditions: (query: string) => {
          return query.toLowerCase().includes('join')
        },
        apply: (query: string) => {
          // This would optimize JOIN clauses
          return query
        },
      },
      {
        name: 'VECTOR_SEARCH_OPTIMIZATION',
        description: 'Optimize vector similarity searches',
        conditions: (query: string) => {
          return query.includes('<->') || query.includes('vector_similarity')
        },
        apply: (query: string) => {
          // Add optimizations for vector searches
          return query
        },
      },
    ]
  }

  // Analyze query performance with EXPLAIN
  async analyzeQuery(query: string): Promise<QueryMetrics> {
    const cacheKey = this.hashQuery(query)

    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const startTime = performance.now()

    try {
      // Get query execution plan
      const explainResult = await this.db(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`)

      const executionTime = performance.now() - startTime

      // Parse the execution plan
      const plan = explainResult[0] as PostgreSQLExecutionPlan
      const metrics = this.parseExecutionPlan(query, plan, executionTime)

      // Cache the results
      this.queryCache.set(cacheKey, metrics)

      return metrics
    } catch (_error) {
      return {
        query,
        executionTime: performance.now() - startTime,
        rowsReturned: 0,
        indexesUsed: [],
        fullTableScans: true,
        recommendations: ['Query analysis failed - check syntax'],
      }
    }
  }

  // Parse PostgreSQL execution plan
  private parseExecutionPlan(
    query: string,
    plan: PostgreSQLExecutionPlan,
    executionTime: number
  ): QueryMetrics {
    const planData = plan['QUERY PLAN'] || plan
    const executionPlan = Array.isArray(planData) ? planData[0] : planData

    // Ensure we have a valid execution plan
    if (!executionPlan || typeof executionPlan !== 'object') {
      return {
        query,
        executionTime,
        rowsReturned: 0,
        indexesUsed: [],
        fullTableScans: false,
        recommendations: ['Unable to parse execution plan'],
      }
    }

    const metrics: QueryMetrics = {
      query,
      executionTime,
      rowsReturned: (executionPlan as PostgreSQLPlanNode)['Actual Rows'] || 0,
      indexesUsed: this.extractIndexesUsed(executionPlan as PostgreSQLPlanNode),
      fullTableScans: this.hasFullTableScans(executionPlan as PostgreSQLPlanNode),
      recommendations: [],
    }

    // Generate recommendations based on the plan
    metrics.recommendations = this.generateRecommendations(
      metrics,
      executionPlan as PostgreSQLPlanNode
    )

    return metrics
  }

  // Extract indexes used in the query
  private extractIndexesUsed(plan: PostgreSQLPlanNode): string[] {
    const indexes: string[] = []

    const extractFromNode = (node: PostgreSQLPlanNode) => {
      const indexName = node['Index Name']
      if (indexName && typeof indexName === 'string') {
        indexes.push(indexName)
      }

      if (node.Plans && Array.isArray(node.Plans)) {
        node.Plans.forEach((childPlan: PostgreSQLPlanNode) => {
          extractFromNode(childPlan)
        })
      }
    }

    extractFromNode(plan)
    return [...new Set(indexes)] // Remove duplicates
  }

  // Check if query involves full table scans
  private hasFullTableScans(plan: PostgreSQLPlanNode): boolean {
    const checkNode = (node: PostgreSQLPlanNode): boolean => {
      const nodeType = node['Node Type']
      if (nodeType === 'Seq Scan') {
        return true
      }

      if (node.Plans && Array.isArray(node.Plans)) {
        return node.Plans.some((childPlan: PostgreSQLPlanNode) => checkNode(childPlan))
      }

      return false
    }

    return checkNode(plan)
  }

  // Generate performance recommendations
  private generateRecommendations(metrics: QueryMetrics, _plan: PostgreSQLPlanNode): string[] {
    const recommendations: string[] = []

    // High execution time
    if (metrics.executionTime > 1000) {
      recommendations.push('Query execution time is high (>1s) - consider optimization')
    }

    // Full table scans
    if (metrics.fullTableScans) {
      recommendations.push('Query uses full table scans - consider adding indexes')
    }

    // Large result sets
    if (metrics.rowsReturned > 10000) {
      recommendations.push('Large result set returned - consider pagination or filtering')
    }

    // No indexes used
    if (metrics.indexesUsed.length === 0 && metrics.query.toLowerCase().includes('where')) {
      recommendations.push('No indexes used with WHERE clause - add appropriate indexes')
    }

    // Vector search specific recommendations
    if (metrics.query.includes('<->') || metrics.query.includes('vector_similarity')) {
      recommendations.push('Ensure HNSW index exists for vector similarity searches')

      if (metrics.executionTime > 500) {
        recommendations.push('Vector search is slow - check HNSW index parameters')
      }
    }

    // JOIN performance
    if (metrics.query.toLowerCase().includes('join') && metrics.executionTime > 500) {
      recommendations.push('JOIN operation is slow - ensure proper indexing on join columns')
    }

    return recommendations
  }

  // Optimize common repository queries
  async optimizeRepositoryQueries(): Promise<QueryMetrics[]> {
    const commonQueries = [
      // Repository search by language
      `SELECT * FROM repositories WHERE primary_language = 'TypeScript' AND is_active = true`,

      // Repository search with vector similarity
      `SELECT r.*, (r.description_embedding <-> $1) as similarity 
       FROM repositories r 
       WHERE (r.description_embedding <-> $1) < 0.5 
       ORDER BY similarity 
       LIMIT 20`,

      // Trending repositories
      `SELECT * FROM repositories 
       WHERE stars_count > 100 
       AND updated_at > NOW() - INTERVAL '30 days' 
       ORDER BY stars_count DESC 
       LIMIT 50`,

      // User's bookmarked repositories
      `SELECT r.* FROM repositories r 
       JOIN user_bookmarks ub ON r.id = ub.repository_id 
       WHERE ub.user_id = $1 
       ORDER BY ub.created_at DESC`,

      // Repository health metrics
      `SELECT id, full_name, health_score, last_commit_at 
       FROM repositories 
       WHERE health_score IS NOT NULL 
       ORDER BY health_score DESC 
       LIMIT 100`,
    ]

    const results: QueryMetrics[] = []

    for (const query of commonQueries) {
      try {
        const metrics = await this.analyzeQuery(query)
        results.push(metrics)
      } catch (_error) {
        // Skip failed query analysis - metrics will be generated for successful queries only
      }
    }

    return results
  }

  // Generate index recommendations
  async generateIndexRecommendations(): Promise<string[]> {
    const recommendations: string[] = []

    // Analyze existing indexes
    const indexQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `

    const indexes = (await this.db(indexQuery)) as PostgreSQLIndex[]

    // Common index recommendations for the schema
    const suggestedIndexes = [
      {
        table: 'repositories',
        columns: ['primary_language', 'is_active'],
        type: 'btree',
        reason: 'Optimize language-based filtering',
      },
      {
        table: 'repositories',
        columns: ['stars_count'],
        type: 'btree',
        reason: 'Optimize trending queries',
      },
      {
        table: 'repositories',
        columns: ['updated_at'],
        type: 'btree',
        reason: 'Optimize date-based filtering',
      },
      {
        table: 'repositories',
        columns: ['health_score'],
        type: 'btree',
        reason: 'Optimize health score ordering',
      },
      {
        table: 'repositories',
        columns: ['description_embedding'],
        type: 'hnsw',
        reason: 'Optimize vector similarity searches',
      },
      {
        table: 'user_bookmarks',
        columns: ['user_id', 'created_at'],
        type: 'btree',
        reason: 'Optimize user bookmark queries',
      },
      {
        table: 'user_bookmarks',
        columns: ['repository_id'],
        type: 'btree',
        reason: 'Optimize bookmark lookups',
      },
    ]

    // Check which indexes are missing
    const existingIndexes = new Set(
      indexes.map((idx: PostgreSQLIndex) => `${idx.tablename}_${idx.indexname}`)
    )

    for (const suggestion of suggestedIndexes) {
      const indexName = `idx_${suggestion.table}_${suggestion.columns.join('_')}`
      const fullIndexName = `${suggestion.table}_${indexName}`

      if (!existingIndexes.has(fullIndexName)) {
        const createIndexSQL =
          suggestion.type === 'hnsw'
            ? `CREATE INDEX ${indexName} ON ${suggestion.table} USING hnsw (${suggestion.columns.join(', ')} vector_cosine_ops)`
            : `CREATE INDEX ${indexName} ON ${suggestion.table} (${suggestion.columns.join(', ')})`

        recommendations.push(`${createIndexSQL}; -- ${suggestion.reason}`)
      }
    }

    return recommendations
  }

  // Generate performance report
  async generatePerformanceReport(): Promise<{
    queryMetrics: QueryMetrics[]
    indexRecommendations: string[]
    summary: {
      totalQueriesAnalyzed: number
      slowQueries: number
      queriesWithFullScans: number
      averageExecutionTime: number
    }
  }> {
    const queryMetrics = await this.optimizeRepositoryQueries()
    const indexRecommendations = await this.generateIndexRecommendations()

    const slowQueries = queryMetrics.filter(m => m.executionTime > 1000).length
    const queriesWithFullScans = queryMetrics.filter(m => m.fullTableScans).length
    const averageExecutionTime =
      queryMetrics.reduce((sum, m) => sum + m.executionTime, 0) / queryMetrics.length

    return {
      queryMetrics,
      indexRecommendations,
      summary: {
        totalQueriesAnalyzed: queryMetrics.length,
        slowQueries,
        queriesWithFullScans,
        averageExecutionTime,
      },
    }
  }

  // Utility function to hash queries for caching
  private hashQuery(query: string): string {
    // Simple hash function for caching
    let hash = 0
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  // Clear query cache
  clearCache(): void {
    this.queryCache.clear()
  }
}
