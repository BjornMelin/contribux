/**
 * Database Performance Testing Suite
 * Comprehensive testing of Drizzle ORM, Neon PostgreSQL, and vector search performance
 */

import { db } from '@/lib/db'
import { repositories, searchQueries, users } from '@/lib/db/schema'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'
import { and, desc, eq, like, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Performance thresholds for database operations (in milliseconds)
const DB_PERFORMANCE_THRESHOLDS = {
  SIMPLE_QUERY: 50, // Simple SELECT queries should be under 50ms
  COMPLEX_QUERY: 200, // Complex JOIN queries should be under 200ms
  INSERT_OPERATION: 100, // Single INSERT should be under 100ms
  BULK_INSERT: 500, // Bulk INSERT should be under 500ms
  UPDATE_OPERATION: 100, // Single UPDATE should be under 100ms
  DELETE_OPERATION: 100, // Single DELETE should be under 100ms
  VECTOR_SEARCH: 300, // Vector similarity search should be under 300ms
  INDEX_LOOKUP: 25, // Index-based lookups should be under 25ms
  AGGREGATE_QUERY: 150, // COUNT/SUM queries should be under 150ms
  CONCURRENT_QUERY: 500, // Concurrent queries should complete within 500ms
}

// Connection pool performance thresholds
const CONNECTION_THRESHOLDS = {
  ACQUIRE_CONNECTION: 50, // Getting a connection should be under 50ms
  QUERY_EXECUTION: 100, // Query execution should be under 100ms
  CONNECTION_RELEASE: 10, // Releasing connection should be under 10ms
  POOL_EXHAUSTION: 1000, // Pool should handle exhaustion gracefully
}

// Load testing parameters
const LOAD_PARAMS = {
  LIGHT_CONCURRENT_QUERIES: 10,
  MEDIUM_CONCURRENT_QUERIES: 25,
  HEAVY_CONCURRENT_QUERIES: 50,
  STRESS_CONCURRENT_QUERIES: 100,
}

interface PostgreSQLExecutionPlan {
  Plan: {
    'Node Type': string
    'Relation Name'?: string
    'Startup Cost': number
    'Total Cost': number
    'Plan Rows': number
    'Plan Width': number
    'Actual Startup Time'?: number
    'Actual Total Time'?: number
    'Actual Rows'?: number
    'Actual Loops'?: number
    Plans?: PostgreSQLExecutionPlan[]
  }
  'Planning Time'?: number
  'Execution Time'?: number
  'Trigger Name'?: string
  Relation?: string
  Time?: number
  Calls?: number
}

interface QueryPerformanceMetrics {
  duration: number
  rowsAffected?: number
  queryPlan?: PostgreSQLExecutionPlan
  cacheHit?: boolean
}

describe('Database Performance Testing', () => {
  let testDbManager: TestDatabaseManager

  beforeAll(async () => {
    testDbManager = new TestDatabaseManager()
    await testDbManager.setup()

    // Ensure we have test data for performance testing
    await seedPerformanceTestData()
  })

  afterAll(async () => {
    await testDbManager.cleanup()
  })

  beforeEach(async () => {
    // Clear query cache between tests for accurate measurements
    await db.execute(sql`SELECT pg_stat_reset()`)
  })

  async function measureQuery<T>(
    queryFn: () => Promise<T>,
    description: string
  ): Promise<{ result: T; metrics: QueryPerformanceMetrics }> {
    const startTime = performance.now()

    try {
      const result = await queryFn()
      const endTime = performance.now()
      const duration = endTime - startTime

      console.log(`⏱️ ${description}: ${duration.toFixed(2)}ms`)

      return {
        result,
        metrics: {
          duration,
          rowsAffected: Array.isArray(result) ? result.length : undefined,
        },
      }
    } catch (error) {
      const endTime = performance.now()
      const duration = endTime - startTime
      console.error(`❌ ${description} failed after ${duration.toFixed(2)}ms:`, error)
      throw error
    }
  }

  async function seedPerformanceTestData() {
    console.log('🌱 Seeding performance test data...')

    // Create test users for performance testing
    const testUsers = Array.from({ length: 100 }, (_, i) => ({
      id: `perf-user-${i}`,
      githubId: 1000000 + i,
      email: `perfuser${i}@example.com`,
      displayName: `Performance User ${i}`,
      username: `perfuser${i}`,
      githubUsername: `perfuser${i}`,
      emailVerified: true,
      connectedProviders: ['github'],
      primaryProvider: 'github',
      isActive: true,
      profileData: { bio: `Performance test user ${i}`, location: 'Test City' },
      preferences: { emailNotifications: true, theme: 'light' },
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      updatedAt: new Date(),
    }))

    // Batch insert users
    await db.insert(users).values(testUsers).onConflictDoNothing()

    // Create test repositories
    const testRepos = Array.from({ length: 500 }, (_, i) => ({
      id: `perf-repo-${i}`,
      githubId: 2000000 + i,
      fullName: `perfuser${i % 100}/perfrepo${i}`,
      name: `perfrepo${i}`,
      description: `Performance test repository ${i}`,
      language: ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust'][i % 5],
      stars: Math.floor(Math.random() * 1000),
      forks: Math.floor(Math.random() * 100),
      openIssues: Math.floor(Math.random() * 50),
      topics: ['performance', 'testing', `topic${i % 10}`],
      url: `https://github.com/perfuser${i % 100}/perfrepo${i}`,
      isActive: true,
      lastFetched: new Date(),
      embedding: Array.from({ length: 1536 }, () => Math.random() - 0.5), // Random embedding for vector search
      createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000), // Random date within last 60 days
      updatedAt: new Date(),
    }))

    // Batch insert repositories
    const chunkSize = 50
    for (let i = 0; i < testRepos.length; i += chunkSize) {
      const chunk = testRepos.slice(i, i + chunkSize)
      await db.insert(repositories).values(chunk).onConflictDoNothing()
    }

    // Create test search queries
    const testSearches = Array.from({ length: 200 }, (_, i) => ({
      id: `perf-search-${i}`,
      userId: `perf-user-${i % 100}`,
      query: `performance test query ${i}`,
      filters: { language: ['JavaScript', 'TypeScript'][i % 2] },
      results: [],
      executionTime: Math.random() * 1000,
      resultCount: Math.floor(Math.random() * 100),
      embedding: Array.from({ length: 1536 }, () => Math.random() - 0.5),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last 7 days
    }))

    // Batch insert search queries
    for (let i = 0; i < testSearches.length; i += chunkSize) {
      const chunk = testSearches.slice(i, i + chunkSize)
      await db.insert(searchQueries).values(chunk).onConflictDoNothing()
    }

    console.log('✅ Performance test data seeded')
  }

  describe('Basic Query Performance', () => {
    it('should execute simple SELECT queries within threshold', async () => {
      const { metrics } = await measureQuery(
        () => db.select().from(users).limit(10),
        'Simple SELECT query (10 users)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(metrics.rowsAffected).toBe(10)
    })

    it('should execute WHERE clause queries efficiently', async () => {
      const { metrics } = await measureQuery(
        () => db.select().from(users).where(eq(users.primaryProvider, 'github')).limit(20),
        'WHERE clause query (provider filter)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(metrics.rowsAffected).toBeLessThanOrEqual(20)
    })

    it('should execute ORDER BY queries efficiently', async () => {
      const { metrics } = await measureQuery(
        () => db.select().from(repositories).orderBy(desc(repositories.stars)).limit(15),
        'ORDER BY query (repositories by stars)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.SIMPLE_QUERY)
      expect(metrics.rowsAffected).toBe(15)
    })

    it('should execute LIKE queries with good performance', async () => {
      const { metrics } = await measureQuery(
        () => db.select().from(repositories).where(like(repositories.name, '%repo%')).limit(25),
        'LIKE query (repository name search)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.SIMPLE_QUERY * 2) // LIKE queries can be slower
      expect(metrics.rowsAffected).toBeLessThanOrEqual(25)
    })
  })

  describe('Complex Query Performance', () => {
    it('should execute JOIN queries within threshold', async () => {
      const { metrics } = await measureQuery(
        () =>
          db
            .select({
              userId: users.id,
              username: users.username,
              searchQuery: searchQueries.query,
              resultCount: searchQueries.resultCount,
            })
            .from(users)
            .innerJoin(searchQueries, eq(users.id, searchQueries.userId))
            .limit(20),
        'JOIN query (users with search queries)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.COMPLEX_QUERY)
      expect(metrics.rowsAffected).toBeLessThanOrEqual(20)
    })

    it('should execute aggregate queries efficiently', async () => {
      const { metrics } = await measureQuery(
        () =>
          db
            .select({
              provider: users.primaryProvider,
              userCount: sql<number>`count(*)::int`,
            })
            .from(users)
            .groupBy(users.primaryProvider),
        'Aggregate query (user count by provider)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.AGGREGATE_QUERY)
    })

    it('should execute subqueries with good performance', async () => {
      const { metrics } = await measureQuery(
        () =>
          db
            .select()
            .from(repositories)
            .where(
              and(
                eq(repositories.language, 'JavaScript'),
                sql`${repositories.stars} > (SELECT AVG(stars) FROM ${repositories})`
              )
            )
            .limit(10),
        'Subquery (JavaScript repos above average stars)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.COMPLEX_QUERY)
    })
  })

  describe('Vector Search Performance', () => {
    it('should execute vector similarity search within threshold', async () => {
      // Generate a random query vector
      const queryVector = Array.from({ length: 1536 }, () => Math.random() - 0.5)

      const { metrics } = await measureQuery(
        () =>
          db.execute(sql`
          SELECT id, full_name, 1 - (embedding <=> ${queryVector}::vector) AS similarity
          FROM repositories 
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${queryVector}::vector
          LIMIT 10
        `),
        'Vector similarity search (repository embeddings)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.VECTOR_SEARCH)
    })

    it('should execute vector search with filters efficiently', async () => {
      const queryVector = Array.from({ length: 1536 }, () => Math.random() - 0.5)

      const { metrics } = await measureQuery(
        () =>
          db.execute(sql`
          SELECT id, full_name, language, stars,
                 1 - (embedding <=> ${queryVector}::vector) AS similarity
          FROM repositories 
          WHERE embedding IS NOT NULL 
            AND language = 'JavaScript'
            AND stars > 10
          ORDER BY embedding <=> ${queryVector}::vector
          LIMIT 15
        `),
        'Filtered vector search (JavaScript repos with stars > 10)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.VECTOR_SEARCH)
    })

    it('should handle hybrid search (vector + text) efficiently', async () => {
      const queryVector = Array.from({ length: 1536 }, () => Math.random() - 0.5)

      const { metrics } = await measureQuery(
        () =>
          db.execute(sql`
          SELECT id, full_name, description,
                 1 - (embedding <=> ${queryVector}::vector) AS vector_similarity,
                 ts_rank(to_tsvector('english', description), plainto_tsquery('english', 'performance')) AS text_score
          FROM repositories 
          WHERE embedding IS NOT NULL 
            AND to_tsvector('english', description) @@ plainto_tsquery('english', 'performance')
          ORDER BY 
            (1 - (embedding <=> ${queryVector}::vector)) * 0.7 + 
            ts_rank(to_tsvector('english', description), plainto_tsquery('english', 'performance')) * 0.3 DESC
          LIMIT 10
        `),
        'Hybrid search (vector + full-text search)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.VECTOR_SEARCH * 1.5) // Hybrid search can be slower
    })
  })

  describe('Write Operation Performance', () => {
    it('should execute INSERT operations within threshold', async () => {
      const newUser = {
        id: 'perf-insert-user',
        githubId: 9999999,
        email: 'insert-test@example.com',
        displayName: 'Insert Test User',
        username: 'inserttest',
        githubUsername: 'inserttest',
        emailVerified: true,
        connectedProviders: ['github'],
        primaryProvider: 'github',
        isActive: true,
        profileData: { bio: 'Test user for insert performance' },
        preferences: { emailNotifications: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const { metrics } = await measureQuery(
        () => db.insert(users).values(newUser),
        'Single INSERT operation'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.INSERT_OPERATION)

      // Cleanup
      await db.delete(users).where(eq(users.id, 'perf-insert-user'))
    })

    it('should execute bulk INSERT operations efficiently', async () => {
      const bulkUsers = Array.from({ length: 50 }, (_, i) => ({
        id: `bulk-user-${i}`,
        githubId: 8000000 + i,
        email: `bulkuser${i}@example.com`,
        displayName: `Bulk User ${i}`,
        username: `bulkuser${i}`,
        githubUsername: `bulkuser${i}`,
        emailVerified: true,
        connectedProviders: ['github'],
        primaryProvider: 'github',
        isActive: true,
        profileData: { bio: `Bulk test user ${i}` },
        preferences: { emailNotifications: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const { metrics } = await measureQuery(
        () => db.insert(users).values(bulkUsers),
        'Bulk INSERT operation (50 users)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.BULK_INSERT)

      // Cleanup
      await db.delete(users).where(sql`id LIKE 'bulk-user-%'`)
    })

    it('should execute UPDATE operations efficiently', async () => {
      const { metrics } = await measureQuery(
        () =>
          db
            .update(users)
            .set({
              displayName: 'Updated Performance User',
              updatedAt: new Date(),
            })
            .where(eq(users.id, 'perf-user-0')),
        'Single UPDATE operation'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.UPDATE_OPERATION)
    })

    it('should execute DELETE operations efficiently', async () => {
      // First insert a test record
      await db.insert(users).values({
        id: 'delete-test-user',
        githubId: 7777777,
        email: 'delete-test@example.com',
        displayName: 'Delete Test User',
        username: 'deletetest',
        githubUsername: 'deletetest',
        emailVerified: true,
        connectedProviders: ['github'],
        primaryProvider: 'github',
        isActive: true,
        profileData: {},
        preferences: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const { metrics } = await measureQuery(
        () => db.delete(users).where(eq(users.id, 'delete-test-user')),
        'Single DELETE operation'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.DELETE_OPERATION)
    })
  })

  describe('Connection Pool Performance', () => {
    it('should acquire database connections quickly', async () => {
      const connectionTimes: number[] = []

      for (let i = 0; i < 10; i++) {
        const startTime = performance.now()

        // Execute a simple query to test connection acquisition
        await db.execute(sql`SELECT 1`)

        const endTime = performance.now()
        connectionTimes.push(endTime - startTime)
      }

      const avgConnectionTime =
        connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length
      console.log(`📊 Average connection time: ${avgConnectionTime.toFixed(2)}ms`)

      expect(avgConnectionTime).toBeLessThan(CONNECTION_THRESHOLDS.ACQUIRE_CONNECTION)
    })

    it('should handle concurrent queries efficiently', async () => {
      const concurrency = LOAD_PARAMS.LIGHT_CONCURRENT_QUERIES
      const startTime = performance.now()

      const promises = Array.from({ length: concurrency }, (_, i) =>
        db
          .select()
          .from(users)
          .where(eq(users.id, `perf-user-${i % 10}`))
          .limit(1)
      )

      const results = await Promise.all(promises)
      const endTime = performance.now()
      const totalDuration = endTime - startTime

      console.log(`⚡ ${concurrency} concurrent queries completed in ${totalDuration.toFixed(2)}ms`)

      expect(results).toHaveLength(concurrency)
      expect(totalDuration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.CONCURRENT_QUERY)
    })

    it('should maintain performance under medium load', async () => {
      const concurrency = LOAD_PARAMS.MEDIUM_CONCURRENT_QUERIES
      const startTime = performance.now()

      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const queryType = i % 3
        switch (queryType) {
          case 0:
            return db
              .select()
              .from(users)
              .where(eq(users.id, `perf-user-${i % 100}`))
          case 1:
            return db
              .select()
              .from(repositories)
              .where(eq(repositories.language, 'JavaScript'))
              .limit(5)
          case 2:
            return db
              .select()
              .from(searchQueries)
              .where(eq(searchQueries.userId, `perf-user-${i % 100}`))
              .limit(3)
          default:
            return []
        }
      })

      const results = await Promise.all(promises)
      const endTime = performance.now()
      const totalDuration = endTime - startTime

      console.log(
        `🔥 ${concurrency} mixed concurrent queries completed in ${totalDuration.toFixed(2)}ms`
      )

      expect(results).toHaveLength(concurrency)
      expect(totalDuration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.CONCURRENT_QUERY * 1.5)
    })
  })

  describe('Query Optimization Analysis', () => {
    it('should use indexes effectively for common queries', async () => {
      // Test that queries use indexes by checking execution plans
      const explainResult = await db.execute(sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
        SELECT * FROM users WHERE primary_provider = 'github' LIMIT 10
      `)

      const plan = explainResult[0] as { explain: PostgreSQLExecutionPlan[] }
      const executionPlan = plan.explain[0]
      console.log('📈 Query execution plan:', JSON.stringify(executionPlan, null, 2))

      // Check that the query doesn't do a full table scan for indexed columns
      const planText = JSON.stringify(executionPlan)
      expect(planText).not.toMatch(/Seq Scan/)
    })

    it('should optimize JOIN queries properly', async () => {
      const explainResult = await db.execute(sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT u.username, COUNT(sq.id) as search_count
        FROM users u
        LEFT JOIN search_queries sq ON u.id = sq.user_id
        WHERE u.is_active = true
        GROUP BY u.id, u.username
        LIMIT 20
      `)

      const plan = explainResult[0] as { explain: PostgreSQLExecutionPlan[] }
      const executionPlan = plan.explain[0]
      console.log('🔗 JOIN query execution plan:', JSON.stringify(executionPlan, null, 2))

      // Ensure the query completes in reasonable time
      const executionTime = executionPlan?.['Execution Time'] || 0
      expect(executionTime).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.COMPLEX_QUERY)
    })
  })

  describe('Performance Regression Detection', () => {
    it('should maintain consistent query performance across runs', async () => {
      const runs = 5
      const queryTimes: number[] = []

      for (let run = 0; run < runs; run++) {
        const { metrics } = await measureQuery(
          () =>
            db
              .select()
              .from(repositories)
              .where(and(eq(repositories.language, 'TypeScript'), sql`${repositories.stars} > 50`))
              .orderBy(desc(repositories.stars))
              .limit(20),
          `Performance consistency run ${run + 1}`
        )

        queryTimes.push(metrics.duration)

        // Small delay between runs
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const avgTime = queryTimes.reduce((sum, time) => sum + time, 0) / runs
      const maxTime = Math.max(...queryTimes)
      const minTime = Math.min(...queryTimes)
      const variance = queryTimes.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) / runs
      const standardDeviation = Math.sqrt(variance)
      const coefficientOfVariation = standardDeviation / avgTime

      console.log('📊 Performance Consistency Metrics:')
      console.log(`Average Time: ${avgTime.toFixed(2)}ms`)
      console.log(`Min Time: ${minTime.toFixed(2)}ms`)
      console.log(`Max Time: ${maxTime.toFixed(2)}ms`)
      console.log(`Standard Deviation: ${standardDeviation.toFixed(2)}ms`)
      console.log(`Coefficient of Variation: ${(coefficientOfVariation * 100).toFixed(1)}%`)

      // Performance should be consistent (CV < 30%)
      expect(coefficientOfVariation).toBeLessThan(0.3)
      expect(avgTime).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.COMPLEX_QUERY)
    })
  })

  describe('Memory Usage and Resource Optimization', () => {
    it('should handle large result sets efficiently', async () => {
      const { metrics } = await measureQuery(
        () => db.select().from(repositories).limit(1000),
        'Large result set query (1000 repositories)'
      )

      expect(metrics.duration).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.COMPLEX_QUERY * 2)
      expect(metrics.rowsAffected).toBe(1000)
    })

    it('should optimize memory usage with streaming queries', async () => {
      // Simulate processing a large dataset in chunks
      const chunkSize = 100
      const totalProcessed = 500
      const processingTimes: number[] = []

      for (let offset = 0; offset < totalProcessed; offset += chunkSize) {
        const { metrics } = await measureQuery(
          () =>
            db
              .select()
              .from(repositories)
              .orderBy(repositories.createdAt)
              .limit(chunkSize)
              .offset(offset),
          `Chunk processing: ${offset}-${offset + chunkSize}`
        )

        processingTimes.push(metrics.duration)
      }

      const avgChunkTime =
        processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      console.log(`📦 Average chunk processing time: ${avgChunkTime.toFixed(2)}ms`)

      // Each chunk should process quickly
      expect(avgChunkTime).toBeLessThan(DB_PERFORMANCE_THRESHOLDS.SIMPLE_QUERY * 2)
    })
  })
})

// Internal test utilities - moved to separate utility file if needed for sharing
