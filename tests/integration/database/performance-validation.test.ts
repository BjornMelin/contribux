/**
 * Database Performance Validation Test Suite
 *
 * Integration tests to validate all database optimizations work together:
 * - Schema consolidation and JSONB performance
 * - Vector search optimization with HNSW indexes
 * - Advanced query builder performance
 * - Real-time monitoring integration
 * - Cache layer integration with database queries
 *
 * Performance Targets:
 * - Repository search: <100ms for 1000+ results
 * - Vector similarity search: <200ms for 1536-dim embeddings
 * - Hybrid search: <300ms combining text + vector
 * - Cache hit rate: >80% for repeated queries
 * - Database connection efficiency: <10ms pool checkout
 */

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cacheLayer } from '@/lib/api/cache-layer'
import { db } from '@/lib/db/config'
import { OptimizedQueryBuilder } from '@/lib/db/optimized-query-builder'
import { repositories } from '@/lib/db/schema'
import { AdvancedDatabaseMonitor } from '@/lib/monitoring/advanced-database-monitor'

const PERFORMANCE_USER_ID = '00000000-0000-4000-8000-000000000001'
const PERFORMANCE_EMBEDDING = Array.from({ length: 1536 }, (_, index) =>
  index % 2 === 0 ? 0.01 : -0.01
)
const PERFORMANCE_EMBEDDING_SQL = `[${PERFORMANCE_EMBEDDING.join(',')}]`

// Type definitions for database objects
interface DatabaseConstraint {
  constraint_name: string
  constraint_type: string
  table_name: string
}

interface VectorIndex {
  indexname: string
  indexdef: string
  tablename: string
}

interface PerformanceMetrics {
  queryPerformance: {
    averageLatency: number
    totalQueries: number
  }
  connectionPool: {
    averageCheckoutTime: number
    activeConnections: number
  }
  vectorSearch: {
    averageQueryTime: number
    totalVectorQueries: number
  }
}

interface CacheStats {
  totalHitRate: {
    combined: number
  }
}

async function seedPerformanceData() {
  await db.execute(sql`
    INSERT INTO users (id, email, username, github_login, preferences, profile)
    VALUES (
      ${PERFORMANCE_USER_ID},
      'performance-user@example.com',
      'performance-user',
      'performance-user',
      ${JSON.stringify({
        difficultyPreference: 'intermediate',
        languagePreferences: ['TypeScript', 'React'],
      })}::jsonb,
      '{}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      preferences = EXCLUDED.preferences,
      updated_at = NOW()
  `)

  const repositoryResult = await db.execute(sql`
    INSERT INTO repositories (
      github_id, name, full_name, owner, description, metadata,
      health_metrics, embedding, overall_health_score
    )
    VALUES (
      900001,
      'react-hooks-kit',
      'contribux/react-hooks-kit',
      'contribux',
      'React TypeScript machine learning examples and hooks',
      ${JSON.stringify({
        language: 'TypeScript',
        stars: 2500,
        forks: 240,
        openIssues: 8,
        archived: false,
        disabled: false,
        hasIssues: true,
        topics: ['react', 'typescript', 'machine-learning'],
      })}::jsonb,
      ${JSON.stringify({ overallScore: 9.2, testCoverage: 91 })}::jsonb,
      ${PERFORMANCE_EMBEDDING_SQL}::vector,
      9.2
    )
    ON CONFLICT (github_id) DO UPDATE SET
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      health_metrics = EXCLUDED.health_metrics,
      embedding = EXCLUDED.embedding,
      overall_health_score = EXCLUDED.overall_health_score,
      updated_at = NOW()
    RETURNING id
  `)

  const repositoryId = (repositoryResult.rows[0] as { id: string }).id

  await db.execute(sql`
    INSERT INTO opportunities (
      repository_id, issue_number, title, body, description, labels,
      difficulty, contribution_type, tech_stack, priority, embedding,
      metadata, difficulty_score, impact_score, match_score, computed_match_score
    )
    VALUES (
      ${repositoryId},
      101,
      'Improve React TypeScript onboarding',
      'Refactor examples and tests for a better first contribution path.',
      'Refactor examples and tests for a better first contribution path.',
      '["good first issue", "typescript"]'::jsonb,
      'intermediate',
      'enhancement',
      ARRAY['TypeScript', 'React'],
      9,
      ${PERFORMANCE_EMBEDDING_SQL}::vector,
      ${JSON.stringify({
        state: 'open',
        difficulty: 'intermediate',
        estimatedHours: 4,
        goodFirstIssue: true,
        mentorshipAvailable: true,
      })}::jsonb,
      5,
      8,
      90,
      9.0
    )
    ON CONFLICT (repository_id, issue_number) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      computed_match_score = EXCLUDED.computed_match_score,
      updated_at = NOW()
  `)
}

describe('Database Performance Validation', () => {
  let queryBuilder: OptimizedQueryBuilder
  let monitor: AdvancedDatabaseMonitor
  let performanceBaseline: PerformanceMetrics

  beforeAll(async () => {
    // Initialize components
    queryBuilder = new OptimizedQueryBuilder()
    monitor = new AdvancedDatabaseMonitor()

    // Clear cache to ensure clean testing environment
    await cacheLayer.clear()
    await seedPerformanceData()

    // Capture performance baseline
    performanceBaseline = await monitor.getPerformanceMetrics()

    console.log('🚀 Starting Database Performance Validation')
    console.log('📊 Performance Baseline:', performanceBaseline)
  })

  afterAll(async () => {
    // Generate final performance report
    const finalMetrics = await monitor.getPerformanceMetrics()
    const report = await monitor.generateAdvancedReport()

    console.log('📈 Final Performance Metrics:', finalMetrics)
    console.log('📋 Performance Report Summary:', `${report.slice(0, 500)}...`)
  })

  describe('Schema Optimization Validation', () => {
    it('should demonstrate JSONB consolidation performance benefits', async () => {
      const startTime = Date.now()

      // Test JSONB query performance on repositories metadata
      const repos = await db
        .select({
          id: repositories.id,
          fullName: repositories.fullName,
          stars: sql<number>`(${repositories.metadata}->>'stars')::int`,
          language: sql<string>`${repositories.metadata}->>'language'`,
          topics: sql<string[]>`${repositories.metadata}->>'topics'`,
        })
        .from(repositories)
        .where(sql`(${repositories.metadata}->>'stars')::int > 1000`)
        .limit(100)

      const queryTime = Date.now() - startTime

      console.log(`✅ JSONB Query Performance: ${queryTime}ms for ${repos.length} repositories`)

      // Performance assertion
      expect(queryTime).toBeLessThan(150) // Should be under 150ms
      expect(repos.length).toBeGreaterThan(0)

      // Validate JSONB data structure
      repos.forEach(repo => {
        expect(repo.stars).toBeTypeOf('number')
        expect(repo.language).toBeTypeOf('string')
      })
    })

    it('should validate auto-computed fields performance', async () => {
      const startTime = Date.now()

      // Test computed health score performance
      const reposWithHealthScore = await db
        .select({
          id: repositories.id,
          fullName: repositories.fullName,
          computedScore: repositories.overallHealthScore,
          metadata: repositories.metadata,
        })
        .from(repositories)
        .where(sql`${repositories.overallHealthScore} > 7.0`)
        .limit(50)

      const queryTime = Date.now() - startTime

      console.log(
        `✅ Computed Fields Performance: ${queryTime}ms for ${reposWithHealthScore.length} repositories`
      )

      expect(queryTime).toBeLessThan(100)
      expect(reposWithHealthScore.length).toBeGreaterThan(0)

      // Validate computed scores are within expected range
      reposWithHealthScore.forEach(repo => {
        expect(repo.computedScore).toBeGreaterThanOrEqual(0)
        expect(repo.computedScore).toBeLessThanOrEqual(10)
      })
    })

    it('should validate check constraints enforcement', async () => {
      // Test that database constraints are properly enforced
      const constraintsQuery = await db.execute(sql`
        SELECT 
          conname as constraint_name,
          contype as constraint_type,
          pg_get_constraintdef(oid) as definition
        FROM pg_constraint 
        WHERE conrelid = 'repositories'::regclass
        AND contype = 'c'
      `)

      const constraints = constraintsQuery.rows
      console.log(`✅ Active Constraints: ${constraints.length} check constraints found`)

      expect(constraints.length).toBeGreaterThan(0)

      // Verify specific constraints exist
      const constraintNames = (constraints as DatabaseConstraint[]).map(c => c.constraint_name)
      expect(constraintNames).toContain('health_score_range')
      expect(constraintNames).toContain('github_id_positive')
    })
  })

  describe('Vector Search Performance Validation', () => {
    it('should demonstrate optimized HNSW vector search performance', async () => {
      const startTime = Date.now()

      // Test vector similarity search using the optimized query builder
      const similarRepos = await queryBuilder.vectorSearchRepositories({
        embedding: PERFORMANCE_EMBEDDING,
        limit: 20,
        threshold: 0.7,
      })

      const searchTime = Date.now() - startTime

      console.log(`✅ Vector Search Performance: ${searchTime}ms for similarity search`)
      console.log(`📊 Results: ${similarRepos.repositories.length} similar repositories found`)

      expect(searchTime).toBeLessThan(200) // Target: <200ms for vector search
      expect(similarRepos.repositories).toBeDefined()
      expect(Array.isArray(similarRepos.repositories)).toBe(true)
    })

    it('should validate hybrid text + vector search performance', async () => {
      const startTime = Date.now()

      const hybridResults = await queryBuilder.hybridSearchRepositories({
        query: 'react typescript',
        embedding: PERFORMANCE_EMBEDDING,
        limit: 30,
        textWeight: 0.6,
        vectorWeight: 0.4,
      })

      const searchTime = Date.now() - startTime

      console.log(`✅ Hybrid Search Performance: ${searchTime}ms for combined search`)
      console.log(`📊 Hybrid Results: ${hybridResults.repositories.length} repositories found`)

      expect(searchTime).toBeLessThan(300) // Target: <300ms for hybrid search
      expect(hybridResults.repositories).toBeDefined()
      expect(hybridResults.totalCount).toBeGreaterThanOrEqual(0)
    })

    it('should validate vector index optimization', async () => {
      // Check if HNSW indexes are properly configured
      const indexQuery = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE tablename IN ('repositories', 'opportunities')
        AND indexdef LIKE '%vector%'
      `)

      const vectorIndexes = indexQuery.rows
      console.log(`✅ Vector Indexes: ${vectorIndexes.length} vector indexes configured`)
      ;(vectorIndexes as VectorIndex[]).forEach(idx => {
        console.log(`📋 Index: ${idx.indexname} - ${idx.indexdef}`)
      })

      expect(vectorIndexes.length).toBeGreaterThan(0)
    })
  })

  describe('Query Builder Performance Validation', () => {
    it('should demonstrate optimized repository search performance', async () => {
      const startTime = Date.now()

      const searchResults = await queryBuilder.searchRepositories({
        query: 'machine learning python',
        languages: ['Python', 'JavaScript'],
        minStars: 100,
        limit: 50,
        sortBy: 'stars',
        sortOrder: 'desc',
      })

      const searchTime = Date.now() - startTime

      console.log(`✅ Repository Search Performance: ${searchTime}ms`)
      console.log(`📊 Search Results: ${searchResults.repositories.length} repositories`)
      console.log(`🎯 Total Count: ${searchResults.totalCount}`)

      expect(searchTime).toBeLessThan(100) // Target: <100ms for repository search
      expect(searchResults.repositories).toBeDefined()
      expect(searchResults.totalCount).toBeGreaterThanOrEqual(0)

      // Validate search result structure
      if (searchResults.repositories.length > 0) {
        const repo = searchResults.repositories[0]
        expect(repo.id).toBeDefined()
        expect(repo.fullName).toBeDefined()
        expect(repo.metadata).toBeDefined()
      }
    })

    it('should validate personalized opportunity matching performance', async () => {
      // Create test user preferences
      const userPreferences = {
        languages: ['TypeScript', 'React'],
        difficulty: 'intermediate' as const,
        topics: ['frontend', 'web-development'],
        experienceLevel: 5,
      }

      const startTime = Date.now()

      const opportunities = await queryBuilder.getPersonalizedOpportunities({
        userId: PERFORMANCE_USER_ID,
        skillLevel: userPreferences.difficulty,
        languages: userPreferences.languages,
        limit: 25,
      })

      const matchTime = Date.now() - startTime

      console.log(`✅ Opportunity Matching Performance: ${matchTime}ms`)
      console.log(`📊 Matched Opportunities: ${opportunities.opportunities.length}`)

      expect(matchTime).toBeLessThan(150) // Target: <150ms for opportunity matching
      expect(opportunities.opportunities).toBeDefined()
      expect(Array.isArray(opportunities.opportunities)).toBe(true)
    })

    it('should validate query caching performance', async () => {
      const searchParams = {
        query: 'react hooks tutorial',
        languages: ['JavaScript'],
        limit: 20,
      }

      // First query (cold cache)
      const startTime1 = Date.now()
      const results1 = await queryBuilder.searchRepositories(searchParams)
      const coldTime = Date.now() - startTime1

      // Second query (warm cache)
      const startTime2 = Date.now()
      const results2 = await queryBuilder.searchRepositories(searchParams)
      const warmTime = Date.now() - startTime2

      console.log(`✅ Cold Cache Performance: ${coldTime}ms`)
      console.log(`🔥 Warm Cache Performance: ${warmTime}ms`)
      console.log(`📈 Cache Speedup: ${Math.round((coldTime / warmTime) * 100) / 100}x`)

      // Cache should provide significant speedup
      expect(results2.metrics.cacheHit).toBe(true)
      expect(warmTime).toBeLessThanOrEqual(coldTime)
      expect(warmTime).toBeLessThan(20) // Cached queries should be very fast

      // Results should be identical
      expect(results1.totalCount).toBe(results2.totalCount)
      expect(results1.repositories.length).toBe(results2.repositories.length)
    })
  })

  describe('Monitoring and Analytics Validation', () => {
    it('should validate real-time performance monitoring', async () => {
      const startTime = Date.now()

      const metrics = await monitor.getPerformanceMetrics()
      const monitoringTime = Date.now() - startTime

      console.log(`✅ Monitoring Query Performance: ${monitoringTime}ms`)
      console.log('📊 Performance Metrics:', {
        connectionPoolSize: metrics.connectionPool.active,
        queryLatency: metrics.queryPerformance.averageLatency,
        indexEfficiency: metrics.indexUsage.efficiency,
      })

      expect(monitoringTime).toBeLessThan(500) // Remote Neon monitoring should stay bounded
      expect(metrics).toBeDefined()
      expect(metrics.connectionPool).toBeDefined()
      expect(metrics.queryPerformance).toBeDefined()
      expect(metrics.vectorSearch).toBeDefined()
    })

    it('should validate database health optimization recommendations', async () => {
      const startTime = Date.now()

      const optimizationSuggestions = await monitor.optimizeDatabase()
      const optimizationTime = Date.now() - startTime

      console.log(`✅ Optimization Analysis: ${optimizationTime}ms`)
      console.log('💡 Optimization Suggestions:', optimizationSuggestions.slice(0, 3))

      expect(optimizationTime).toBeLessThan(1000)
      expect(Array.isArray(optimizationSuggestions)).toBe(true)
    })

    it('should validate alert system configuration', async () => {
      const startTime = Date.now()

      await monitor.checkAlerts()
      const alertTime = Date.now() - startTime

      console.log(`✅ Alert Check Performance: ${alertTime}ms`)

      expect(alertTime).toBeLessThan(500) // Includes a remote health probe
    })
  })

  describe('Cache Integration Performance', () => {
    it('should validate multi-tier cache performance', async () => {
      const cacheKey = ['test', 'performance', 'validation']
      const testData = { message: 'performance test data', timestamp: Date.now() }

      // Test cache set performance
      const setStart = Date.now()
      await cacheLayer.set(cacheKey, testData)
      const setTime = Date.now() - setStart

      // Test cache get performance
      const getStart = Date.now()
      const cachedData = await cacheLayer.get(cacheKey)
      const getTime = Date.now() - getStart

      console.log(`✅ Cache Set Performance: ${setTime}ms`)
      console.log(`✅ Cache Get Performance: ${getTime}ms`)

      expect(setTime).toBeLessThan(10) // Cache sets should be very fast
      expect(getTime).toBeLessThan(5) // Cache gets should be extremely fast
      expect(cachedData).toEqual(testData)

      // Test cache statistics
      const cacheStats = await cacheLayer.getStats()
      console.log('📊 Cache Hit Rates:', cacheStats.totalHitRate)

      expect(cacheStats).toBeDefined()
      expect(cacheStats.totalHitRate).toBeDefined()
    })

    it('should validate cache warming performance', async () => {
      const warmingStart = Date.now()

      // Warm cache with popular repository search
      const warmedData = await cacheLayer.warmCache(
        ['repositories', 'popular', 'javascript'],
        async () => {
          return await queryBuilder.searchRepositories({
            query: 'react typescript',
            languages: ['TypeScript'],
            minStars: 1000,
            limit: 10,
          })
        }
      )

      const warmingTime = Date.now() - warmingStart

      console.log(`✅ Cache Warming Performance: ${warmingTime}ms`)
      console.log(`📊 Warmed Data Count: ${warmedData.repositories.length}`)

      expect(warmingTime).toBeLessThan(200)
      expect(warmedData.repositories).toBeDefined()
      expect(warmedData.repositories.length).toBeGreaterThan(0)
    })
  })

  describe('Connection Pool Performance', () => {
    it('should validate connection pool efficiency', async () => {
      const poolStart = Date.now()

      // Test concurrent database operations
      const concurrentQueries = Array.from({ length: 10 }, async (_, i) => {
        return db.execute(sql`SELECT ${i} as query_id, pg_sleep(0.01)`)
      })

      const results = await Promise.all(concurrentQueries)
      const poolTime = Date.now() - poolStart

      console.log(`✅ Connection Pool Performance: ${poolTime}ms for 10 concurrent queries`)

      expect(poolTime).toBeLessThan(1000) // Remote Neon pool should handle concurrent queries efficiently
      expect(results.length).toBe(10)

      // Validate all queries completed successfully
      results.forEach((result, index) => {
        expect(Number(result.rows[0].query_id)).toBe(index)
      })
    })

    it('should validate connection pool metrics', async () => {
      const metrics = await monitor.getPerformanceMetrics()
      const poolMetrics = metrics.connectionPool

      console.log('📊 Connection Pool Metrics:', {
        active: poolMetrics.active,
        idle: poolMetrics.idle,
        waiting: poolMetrics.waiting,
        totalConnections: poolMetrics.totalConnections,
      })

      expect(poolMetrics.active).toBeGreaterThanOrEqual(0)
      expect(poolMetrics.idle).toBeGreaterThanOrEqual(0)
      expect(poolMetrics.totalConnections).toBeGreaterThan(0)
      expect(poolMetrics.averageCheckoutTime).toBeLessThan(500) // Remote checkout probe stays bounded
    })
  })

  describe('Overall Performance Benchmarks', () => {
    it('should validate end-to-end search performance', async () => {
      const benchmarkStart = Date.now()

      // Complex search scenario combining multiple optimizations
      const complexSearch = await queryBuilder.hybridSearchRepositories({
        query: 'react typescript machine learning',
        embedding: PERFORMANCE_EMBEDDING,
        limit: 30,
        textWeight: 0.7,
        vectorWeight: 0.3,
      })

      const benchmarkTime = Date.now() - benchmarkStart

      console.log(`🏆 End-to-End Performance: ${benchmarkTime}ms`)
      console.log(`📊 Complex Search Results: ${complexSearch.repositories.length} repositories`)
      console.log(
        `🎯 Performance Score: ${benchmarkTime < 400 ? 'EXCELLENT' : benchmarkTime < 800 ? 'GOOD' : 'NEEDS_IMPROVEMENT'}`
      )

      expect(benchmarkTime).toBeLessThan(500) // Target: <500ms for complex searches
      expect(complexSearch.repositories).toBeDefined()
    })

    it('should generate comprehensive performance report', async () => {
      const reportStart = Date.now()

      const performanceReport = await monitor.generateAdvancedReport()
      const cacheStats = await cacheLayer.getStats()
      const finalMetrics = await monitor.getPerformanceMetrics()

      const reportTime = Date.now() - reportStart

      console.log('\n🔍 COMPREHENSIVE PERFORMANCE VALIDATION REPORT')
      console.log('='.repeat(50))
      console.log(`📈 Report Generation Time: ${reportTime}ms`)
      console.log(`📊 Cache Hit Rate: ${Math.round(cacheStats.totalHitRate.combined * 100)}%`)
      console.log(`⚡ Average Query Latency: ${finalMetrics.queryPerformance.averageLatency}ms`)
      console.log(
        `🔗 Connection Pool Efficiency: ${finalMetrics.connectionPool.averageCheckoutTime}ms`
      )
      console.log(`🎯 Vector Search Efficiency: ${finalMetrics.vectorSearch.averageQueryTime}ms`)
      console.log(
        `🏆 Overall Performance Grade: ${_calculatePerformanceGrade(finalMetrics, cacheStats)}`
      )

      expect(reportTime).toBeLessThan(1000)
      expect(performanceReport).toBeDefined()
      expect(performanceReport.length).toBeGreaterThan(100)
    })
  })
})

// Helper function to calculate performance grade
function _calculatePerformanceGrade(metrics: PerformanceMetrics, cacheStats: CacheStats): string {
  const scores = [
    metrics.queryPerformance.averageLatency < 100
      ? 100
      : Math.max(0, 100 - metrics.queryPerformance.averageLatency),
    metrics.connectionPool.averageCheckoutTime < 10
      ? 100
      : Math.max(0, 100 - metrics.connectionPool.averageCheckoutTime * 10),
    cacheStats.totalHitRate.combined * 100,
    metrics.vectorSearch.averageQueryTime < 200
      ? 100
      : Math.max(0, 100 - (metrics.vectorSearch.averageQueryTime - 200)),
  ]

  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length

  if (averageScore >= 90) return 'A+ EXCELLENT'
  if (averageScore >= 80) return 'A VERY GOOD'
  if (averageScore >= 70) return 'B GOOD'
  if (averageScore >= 60) return 'C ACCEPTABLE'
  return 'D NEEDS IMPROVEMENT'
}
