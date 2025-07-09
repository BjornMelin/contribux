/**
 * Optimized Query Builder with Intelligent Caching
 * High-performance query layer with automatic optimization and caching
 */

import { performance } from 'node:perf_hooks'

import { and, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm'
import { Redis } from 'ioredis'

import { db, schema, vectorConfig } from './config'

// Cache configuration
interface CacheConfig {
  enabled: boolean
  defaultTtl: number // seconds
  maxCacheSize: number
  keyPrefix: string
}

const cacheConfig: CacheConfig = {
  enabled: !!process.env.REDIS_URL,
  defaultTtl: 300, // 5 minutes
  maxCacheSize: 10000,
  keyPrefix: 'contribux:db:',
}

// Query performance metrics
interface QueryMetrics {
  queryId: string
  executionTime: number
  resultCount: number
  cacheHit: boolean
  indexesUsed: string[]
  timestamp: Date
}

// Vector search result interface
interface VectorSearchResult {
  repository: typeof schema.repositories.$inferSelect
  similarity: number
}

// Hybrid search result interface
interface HybridSearchResult {
  repository: typeof schema.repositories.$inferSelect
  textScore: number
  vectorScore: number
  hybridScore: number
}

// Intelligent cache key generator
function generateCacheKey(queryType: string, params: Record<string, unknown>): string {
  const normalizedParams = Object.keys(params)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]
        return acc
      },
      {} as Record<string, unknown>
    )

  const paramString = JSON.stringify(normalizedParams)
  const hash = Buffer.from(paramString).toString('base64').slice(0, 16)

  return `${cacheConfig.keyPrefix}${queryType}:${hash}`
}

// Advanced query builder class
export class OptimizedQueryBuilder {
  private redis: Redis | null = null
  private metricsHistory: QueryMetrics[] = []
  private queryCache = new Map<string, { data: unknown; timestamp: number; ttl: number }>()

  constructor() {
    if (cacheConfig.enabled && process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 30000,
        commandTimeout: 5000,
      })
    }
  }

  /**
   * Execute query with intelligent caching and performance monitoring
   */
  private async executeWithCache<T>(
    queryId: string,
    queryFn: () => Promise<T>,
    cacheKey?: string,
    ttl?: number
  ): Promise<{ data: T; metrics: QueryMetrics }> {
    const startTime = performance.now()
    let cacheHit = false
    let data: T | null = null

    // Try cache first
    if (cacheKey) {
      const cached = await this.getFromCache<T>(cacheKey)
      if (cached) {
        data = cached
        cacheHit = true
      }
    }

    // Execute query if not cached
    if (!cacheHit) {
      data = await queryFn()

      // Cache the result
      if (cacheKey && data) {
        await this.setCache(cacheKey, data, ttl || cacheConfig.defaultTtl)
      }
    }

    const executionTime = performance.now() - startTime
    const metrics: QueryMetrics = {
      queryId,
      executionTime,
      resultCount: Array.isArray(data) ? data.length : data ? 1 : 0,
      cacheHit,
      indexesUsed: [], // Would need query plan analysis
      timestamp: new Date(),
    }

    this.recordMetrics(metrics)
    return { data: data as T, metrics }
  }

  /**
   * Cache operations
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      if (this.redis) {
        const cached = await this.redis.get(key)
        return cached ? JSON.parse(cached) : null
      }
      // Fallback to in-memory cache
      const cached = this.queryCache.get(key)
      if (cached && Date.now() - cached.timestamp < cached.ttl * 1000) {
        return cached.data as T
      }
    } catch (_error) {
      // Graceful degradation
    }
    return null
  }

  private async setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.setex(key, ttl, JSON.stringify(data))
      } else {
        // Fallback to in-memory cache
        this.queryCache.set(key, {
          data,
          timestamp: Date.now(),
          ttl,
        })

        // Cleanup old entries
        if (this.queryCache.size > cacheConfig.maxCacheSize) {
          const oldestKey = this.queryCache.keys().next().value
          if (oldestKey !== undefined) {
            this.queryCache.delete(oldestKey)
          }
        }
      }
    } catch (_error) {
      // Graceful degradation
    }
  }

  /**
   * Record query metrics
   */
  private recordMetrics(metrics: QueryMetrics): void {
    this.metricsHistory.push(metrics)

    // Keep only last 1000 metrics
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory = this.metricsHistory.slice(-1000)
    }

    // Log slow queries
    if (metrics.executionTime > 1000) {
      // Would implement slow query logging here
    }
  }

  /**
   * OPTIMIZED REPOSITORY QUERIES
   */

  /**
   * High-performance repository search with intelligent ranking
   */
  async searchRepositories(params: {
    query?: string
    languages?: string[]
    minStars?: number
    maxStars?: number
    skillLevel?: string
    limit?: number
    offset?: number
    includeTrending?: boolean
  }) {
    const cacheKey = generateCacheKey('repo_search', params)

    return this.executeWithCache(
      'searchRepositories',
      async () => {
        const { query, languages = [], minStars = 0, maxStars, limit = 20, offset = 0 } = params

        // Build dynamic where conditions
        const conditions = []

        // Text search optimization
        if (query) {
          const searchPattern = `%${query.replace(/[%_\\]/g, '\\$&')}%`
          conditions.push(
            or(
              ilike(schema.repositories.name, searchPattern),
              ilike(schema.repositories.fullName, searchPattern),
              ilike(schema.repositories.description, searchPattern)
            )
          )
        }

        // Language filter with JSONB optimization
        if (languages.length > 0) {
          conditions.push(
            or(
              ...languages.map(lang => sql`${schema.repositories.metadata}->>'language' = ${lang}`)
            )
          )
        }

        // Star range optimization
        if (minStars > 0) {
          conditions.push(sql`(${schema.repositories.metadata}->>'stars')::integer >= ${minStars}`)
        }
        if (maxStars) {
          conditions.push(sql`(${schema.repositories.metadata}->>'stars')::integer <= ${maxStars}`)
        }

        // Base filters for quality
        conditions.push(
          sql`(${schema.repositories.metadata}->>'archived')::boolean = false`,
          sql`(${schema.repositories.metadata}->>'disabled')::boolean = false`
        )

        // Execute optimized query
        const results = await db
          .select({
            id: schema.repositories.id,
            githubId: schema.repositories.githubId,
            name: schema.repositories.name,
            fullName: schema.repositories.fullName,
            description: schema.repositories.description,
            language: sql<string>`${schema.repositories.metadata}->>'language'`,
            stargazersCount: sql<number>`(${schema.repositories.metadata}->>'stars')::integer`,
            forksCount: sql<number>`(${schema.repositories.metadata}->>'forks')::integer`,
            openIssuesCount: sql<number>`(${schema.repositories.metadata}->>'openIssues')::integer`,
            healthScore: schema.repositories.overallHealthScore,
            updatedAt: schema.repositories.updatedAt,
            // Calculate relevance score
            relevanceScore: sql<number>`
              CASE 
                WHEN ${query} IS NOT NULL THEN
                  -- Text relevance (30%)
                  (
                    CASE WHEN ${schema.repositories.name} ILIKE ${`%${query}%`} THEN 0.4 ELSE 0 END +
                    CASE WHEN ${schema.repositories.description} ILIKE ${`%${query}%`} THEN 0.2 ELSE 0 END
                  ) * 0.3 +
                  -- Quality score (40%)
                  COALESCE(${schema.repositories.overallHealthScore}, 50) / 100.0 * 0.4 +
                  -- Popularity (20%)
                  LEAST(LOG(GREATEST(COALESCE((${schema.repositories.metadata}->>'stars')::integer, 0), 1)) / 20.0, 1.0) * 0.2 +
                  -- Recency (10%)
                  CASE 
                    WHEN ${schema.repositories.updatedAt} > NOW() - INTERVAL '30 days' THEN 0.1
                    WHEN ${schema.repositories.updatedAt} > NOW() - INTERVAL '90 days' THEN 0.05
                    ELSE 0.0
                  END
                ELSE 
                  -- Default scoring without text query
                  COALESCE(${schema.repositories.overallHealthScore}, 50) / 100.0 * 0.6 +
                  LEAST(LOG(GREATEST(COALESCE((${schema.repositories.metadata}->>'stars')::integer, 0), 1)) / 20.0, 1.0) * 0.4
              END
            `.as('relevance_score'),
          })
          .from(schema.repositories)
          .where(and(...conditions))
          .orderBy(
            desc(sql`relevance_score`),
            desc(sql`(${schema.repositories.metadata}->>'stars')::integer`),
            desc(schema.repositories.overallHealthScore)
          )
          .limit(limit)
          .offset(offset)

        return results
      },
      cacheKey,
      300 // 5 minute cache
    )
  }

  /**
   * Vector similarity search with optimized HNSW queries
   */
  async vectorSearchRepositories(params: {
    embedding: number[]
    threshold?: number
    limit?: number
    includeMetadata?: boolean
  }) {
    const cacheKey = generateCacheKey('vector_search_repos', {
      ...params,
      embedding: params.embedding.slice(0, 10), // Only use first 10 dimensions for cache key
    })

    return this.executeWithCache(
      'vectorSearchRepositories',
      async () => {
        const {
          embedding,
          threshold = vectorConfig.similarityThreshold,
          limit = vectorConfig.maxResults,
          includeMetadata = false,
        } = params

        // Validate embedding
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          throw new Error('Invalid embedding: must be array of 1536 numbers')
        }

        // Convert embedding to PostgreSQL vector format
        const embeddingVector = `[${embedding.join(',')}]`

        // Execute optimized vector query using HNSW index
        const results = await db
          .select({
            repository: schema.repositories,
            similarity:
              sql<number>`1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector)`.as(
                'similarity'
              ),
          })
          .from(schema.repositories)
          .where(
            and(
              isNotNull(schema.repositories.embedding),
              sql`(${schema.repositories.metadata}->>'archived')::boolean = false`,
              sql`1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector) >= ${threshold}`
            )
          )
          .orderBy(desc(sql`1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector)`))
          .limit(limit)

        return results.map((row: VectorSearchResult) => ({
          ...row.repository,
          similarity: row.similarity,
          metadata: includeMetadata ? row.repository : undefined,
        }))
      },
      cacheKey,
      600 // 10 minute cache for vector searches
    )
  }

  /**
   * Hybrid search combining text and vector similarity
   */
  async hybridSearchRepositories(params: {
    query: string
    embedding: number[]
    textWeight?: number
    vectorWeight?: number
    limit?: number
  }) {
    const cacheKey = generateCacheKey('hybrid_search', {
      ...params,
      embedding: params.embedding.slice(0, 10), // Only first 10 for cache key
    })

    return this.executeWithCache(
      'hybridSearchRepositories',
      async () => {
        const {
          query,
          embedding,
          textWeight = vectorConfig.textWeight,
          vectorWeight = vectorConfig.vectorWeight,
          limit = 20,
        } = params

        // Validate inputs
        if (!query?.trim()) {
          throw new Error('Query cannot be empty')
        }

        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          throw new Error('Invalid embedding dimensions')
        }

        const embeddingVector = `[${embedding.join(',')}]`
        const searchPattern = `%${query.replace(/[%_\\]/g, '\\$&')}%`

        // Execute hybrid search with optimized scoring
        const results = await db
          .select({
            repository: schema.repositories,
            textScore: this.buildTextScoreSQL(searchPattern),
            vectorScore: this.buildVectorScoreSQL(embeddingVector),
            hybridScore: this.buildHybridScoreSQL(
              searchPattern,
              embeddingVector,
              textWeight,
              vectorWeight
            ),
          })
          .from(schema.repositories)
          .where(
            and(
              or(
                ilike(schema.repositories.name, searchPattern),
                ilike(schema.repositories.fullName, searchPattern),
                ilike(schema.repositories.description, searchPattern),
                and(
                  isNotNull(schema.repositories.embedding),
                  sql`1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector) >= ${vectorConfig.similarityThreshold}`
                )
              ),
              sql`(${schema.repositories.metadata}->>'archived')::boolean = false`
            )
          )
          .orderBy(desc(sql`hybrid_score`))
          .limit(limit)

        return results.map((row: HybridSearchResult) => ({
          ...row.repository,
          scores: {
            text: row.textScore,
            vector: row.vectorScore,
            hybrid: row.hybridScore,
          },
        }))
      },
      cacheKey,
      300 // 5 minute cache
    )
  }

  /**
   * OPTIMIZED OPPORTUNITY QUERIES
   */

  /**
   * Intelligent opportunity matching for users
   */
  async getPersonalizedOpportunities(params: {
    userId: string
    skillLevel?: string
    languages?: string[]
    maxEstimatedHours?: number
    includeCompleted?: boolean
    limit?: number
  }) {
    const cacheKey = generateCacheKey('personalized_opps', params)

    return this.executeWithCache(
      'getPersonalizedOpportunities',
      async () => {
        const {
          userId,
          skillLevel,
          languages = [],
          maxEstimatedHours,
          includeCompleted = false,
          limit = 10,
        } = params

        // Get user profile for personalization
        const userProfile = await db
          .select({
            id: schema.users.id,
            preferences: schema.users.preferences,
            profile: schema.users.profile,
          })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
          .then(rows => rows[0] || null)

        if (!userProfile) {
          throw new Error('User not found')
        }

        // Build dynamic conditions
        const conditions = []

        // Status filter
        if (!includeCompleted) {
          conditions.push(sql`${schema.opportunities.metadata}->>'state' = 'open'`)
        }

        // Skill level matching
        const targetSkillLevel = skillLevel || userProfile.preferences?.difficultyPreference
        if (targetSkillLevel) {
          conditions.push(
            sql`${schema.opportunities.metadata}->>'difficulty' = ${targetSkillLevel}`
          )
        }

        // Time constraint
        if (maxEstimatedHours) {
          conditions.push(
            sql`(${schema.opportunities.metadata}->>'estimatedHours')::integer <= ${maxEstimatedHours}`
          )
        }

        // Execute with intelligent scoring
        const results = await db
          .select({
            opportunity: schema.opportunities,
            repository: schema.repositories,
            matchScore: this.buildMatchScoreSQL(targetSkillLevel, languages, userProfile),
          })
          .from(schema.opportunities)
          .innerJoin(
            schema.repositories,
            eq(schema.opportunities.repositoryId, schema.repositories.id)
          )
          .where(and(...conditions))
          .orderBy(
            desc(sql`match_score`),
            desc(sql`${schema.opportunities.metadata}->>'priority'`),
            desc(schema.opportunities.createdAt)
          )
          .limit(limit)

        return results
      },
      cacheKey,
      180 // 3 minute cache for personalized results
    )
  }

  /**
   * Performance metrics and monitoring
   */
  getQueryMetrics(): {
    totalQueries: number
    avgExecutionTime: number
    cacheHitRate: number
    slowQueries: number
  } {
    const total = this.metricsHistory.length
    const cacheHits = this.metricsHistory.filter(m => m.cacheHit).length
    const avgTime = this.metricsHistory.reduce((sum, m) => sum + m.executionTime, 0) / total
    const slowQueries = this.metricsHistory.filter(m => m.executionTime > 1000).length

    return {
      totalQueries: total,
      avgExecutionTime: avgTime,
      cacheHitRate: total > 0 ? cacheHits / total : 0,
      slowQueries,
    }
  }

  // Helper functions for SQL building
  private buildMatchScoreSQL(
    targetSkillLevel: string | undefined,
    languages: string[],
    userProfile: { preferences?: { languagePreferences?: string[] } | null }
  ) {
    const languagePreferences =
      languages.length > 0 ? languages : userProfile.preferences?.languagePreferences || []

    return sql<number>`
      -- Skill level compatibility (40%)
      CASE 
        WHEN (${schema.opportunities.metadata}->>'difficulty') = ${targetSkillLevel} THEN 0.4
        WHEN (${schema.opportunities.metadata}->>'difficulty') = 'beginner' AND ${targetSkillLevel} IN ('intermediate', 'advanced') THEN 0.3
        WHEN (${schema.opportunities.metadata}->>'difficulty') = 'intermediate' AND ${targetSkillLevel} = 'advanced' THEN 0.35
        ELSE 0.1
      END +
      
      -- Language preference match (30%)
      CASE 
        WHEN (${schema.repositories.metadata}->>'language') = ANY(${languagePreferences}) THEN 0.3
        ELSE 0.0
      END +
      
      -- Repository quality (20%)
      COALESCE(${schema.repositories.overallHealthScore}, 50) / 100.0 * 0.2 +
      
      -- Beginner-friendly bonus (10%)
      CASE 
        WHEN (${schema.opportunities.metadata}->>'goodFirstIssue')::boolean = true AND ${targetSkillLevel} = 'beginner' THEN 0.1
        WHEN (${schema.opportunities.metadata}->>'mentorshipAvailable')::boolean = true THEN 0.05
        ELSE 0.0
      END
    `.as('match_score')
  }

  private buildTextScoreSQL(searchPattern: string) {
    return sql<number>`
      CASE 
        WHEN ${schema.repositories.name} ILIKE ${searchPattern} THEN 1.0
        WHEN ${schema.repositories.fullName} ILIKE ${searchPattern} THEN 0.8
        WHEN ${schema.repositories.description} ILIKE ${searchPattern} THEN 0.6
        ELSE 0.0
      END
    `.as('text_score')
  }

  private buildVectorScoreSQL(embeddingVector: string) {
    return sql<number>`
      CASE 
        WHEN ${schema.repositories.embedding} IS NOT NULL 
        THEN 1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector)
        ELSE 0.0
      END
    `.as('vector_score')
  }

  private buildHybridScoreSQL(
    searchPattern: string,
    embeddingVector: string,
    textWeight: number,
    vectorWeight: number
  ) {
    return sql<number>`
      (
        CASE 
          WHEN ${schema.repositories.name} ILIKE ${searchPattern} THEN 1.0
          WHEN ${schema.repositories.fullName} ILIKE ${searchPattern} THEN 0.8
          WHEN ${schema.repositories.description} ILIKE ${searchPattern} THEN 0.6
          ELSE 0.0
        END * ${textWeight}
      ) + (
        CASE 
          WHEN ${schema.repositories.embedding} IS NOT NULL 
          THEN (1 - (${schema.repositories.embedding} <=> ${embeddingVector}::vector)) * ${vectorWeight}
          ELSE 0.0
        END
      )
    `.as('hybrid_score')
  }

  // Helper functions for cache management
  private async clearRedisCache(pattern?: string): Promise<void> {
    if (!this.redis) return

    if (pattern) {
      const keys = await this.redis.keys(`${cacheConfig.keyPrefix}${pattern}*`)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } else {
      await this.redis.flushdb()
    }
  }

  private clearMemoryCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.queryCache.keys()) {
        if (key.includes(pattern)) {
          this.queryCache.delete(key)
        }
      }
    } else {
      this.queryCache.clear()
    }
  }

  /**
   * Clear cache
   */
  async clearCache(pattern?: string): Promise<void> {
    await this.clearRedisCache(pattern)
    this.clearMemoryCache(pattern)
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect()
    }
  }
}

// Singleton instance
let queryBuilderInstance: OptimizedQueryBuilder | null = null

export function getOptimizedQueryBuilder(): OptimizedQueryBuilder {
  if (!queryBuilderInstance) {
    queryBuilderInstance = new OptimizedQueryBuilder()
  }
  return queryBuilderInstance
}

export type { QueryMetrics }
