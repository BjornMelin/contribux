#!/usr/bin/env node

/**
 * Performance Benchmark Suite for contribux
 * Tests database operations, vector search performance, and caching efficiency
 */

const { neon } = require('@neondatabase/serverless')
const Redis = require('ioredis')

class PerformanceBenchmarks {
  constructor(databaseUrl, redisUrl) {
    this.sql = neon(databaseUrl)
    this.redis = redisUrl ? new Redis(redisUrl) : null
    this.results = {}
  }

  async runAllBenchmarks() {
    try {
      // Database benchmarks
      await this.benchmarkBasicQueries()
      await this.benchmarkVectorSearch()
      await this.benchmarkComplexJoins()
      await this.benchmarkIndexPerformance()

      // Cache benchmarks (if Redis is available)
      if (this.redis) {
        await this.benchmarkCacheOperations()
      }

      // Generate comprehensive report
      this.generateReport()
    } catch (_error) {
      process.exit(1)
    }
  }

  async benchmarkBasicQueries() {
    const queries = [
      {
        name: 'Select all users',
        query: () => this.sql`SELECT * FROM users LIMIT 100`,
        iterations: 50,
      },
      {
        name: 'Select users by skill level',
        query: () => this.sql`SELECT * FROM users WHERE skill_level = 'advanced' LIMIT 50`,
        iterations: 50,
      },
      {
        name: 'Count repositories by language',
        query: () => this.sql`SELECT language, COUNT(*) FROM repositories GROUP BY language`,
        iterations: 30,
      },
      {
        name: 'Select opportunities with filters',
        query: () => this.sql`
          SELECT * FROM opportunities 
          WHERE difficulty = 'intermediate' AND good_first_issue = true 
          LIMIT 20
        `,
        iterations: 40,
      },
    ]

    this.results.basicQueries = {}

    for (const queryTest of queries) {
      const times = []

      for (let i = 0; i < queryTest.iterations; i++) {
        const start = performance.now()
        await queryTest.query()
        const end = performance.now()
        times.push(end - start)
      }

      const stats = this.calculateStats(times)
      this.results.basicQueries[queryTest.name] = stats
    }
  }

  async benchmarkVectorSearch() {
    // Generate a test query vector
    const queryVector = Array.from({ length: 1536 }, () => (Math.random() - 0.5) * 2)

    const vectorQueries = [
      {
        name: 'User profile similarity (HNSW)',
        query: () => this.sql`
          SELECT github_username, profile_embedding <=> ${queryVector} as distance
          FROM users 
          WHERE profile_embedding IS NOT NULL
          ORDER BY profile_embedding <=> ${queryVector}
          LIMIT 10
        `,
        iterations: 20,
      },
      {
        name: 'Repository similarity (HNSW)',
        query: () => this.sql`
          SELECT full_name, description_embedding <=> ${queryVector} as distance
          FROM repositories 
          WHERE description_embedding IS NOT NULL
          ORDER BY description_embedding <=> ${queryVector}
          LIMIT 10
        `,
        iterations: 20,
      },
      {
        name: 'Opportunity title similarity (HNSW)',
        query: () => this.sql`
          SELECT title, title_embedding <=> ${queryVector} as distance
          FROM opportunities 
          WHERE title_embedding IS NOT NULL
          ORDER BY title_embedding <=> ${queryVector}
          LIMIT 10
        `,
        iterations: 20,
      },
      {
        name: 'Combined opportunity search (title + description)',
        query: () => this.sql`
          SELECT 
            title,
            (title_embedding <=> ${queryVector} + description_embedding <=> ${queryVector}) / 2 as combined_distance
          FROM opportunities 
          WHERE title_embedding IS NOT NULL AND description_embedding IS NOT NULL
          ORDER BY combined_distance
          LIMIT 10
        `,
        iterations: 15,
      },
    ]

    this.results.vectorSearch = {}

    for (const queryTest of vectorQueries) {
      const times = []

      for (let i = 0; i < queryTest.iterations; i++) {
        const start = performance.now()
        await queryTest.query()
        const end = performance.now()
        times.push(end - start)
      }

      const stats = this.calculateStats(times)
      this.results.vectorSearch[queryTest.name] = stats
    }
  }

  async benchmarkComplexJoins() {
    const joinQueries = [
      {
        name: 'Opportunities with repository info',
        query: () => this.sql`
          SELECT o.title, o.difficulty, r.full_name, r.language, r.stars_count
          FROM opportunities o
          JOIN repositories r ON o.repository_id = r.id
          WHERE r.health_score > 70
          LIMIT 50
        `,
        iterations: 25,
      },
      {
        name: 'User preferences with matching opportunities',
        query: () => this.sql`
          SELECT u.github_username, up.preferred_languages, o.title, o.type
          FROM users u
          JOIN user_preferences up ON u.id = up.user_id
          JOIN opportunities o ON o.type = ANY(up.preferred_contribution_types)
          JOIN repositories r ON o.repository_id = r.id
          WHERE r.language = ANY(up.preferred_languages)
          LIMIT 30
        `,
        iterations: 20,
      },
      {
        name: 'Contribution outcomes with user and opportunity details',
        query: () => this.sql`
          SELECT 
            u.github_username,
            o.title,
            r.full_name,
            co.status,
            co.difficulty_rating,
            co.learning_rating
          FROM contribution_outcomes co
          JOIN users u ON co.user_id = u.id
          JOIN opportunities o ON co.opportunity_id = o.id
          JOIN repositories r ON o.repository_id = r.id
          WHERE co.status IN ('accepted', 'merged')
          LIMIT 40
        `,
        iterations: 20,
      },
      {
        name: 'User repository interactions with aggregations',
        query: () => this.sql`
          SELECT 
            u.github_username,
            r.full_name,
            uri.visit_count,
            uri.opportunities_viewed,
            uri.opportunities_applied,
            (uri.opportunities_applied::float / NULLIF(uri.opportunities_viewed, 0)) as conversion_rate
          FROM user_repository_interactions uri
          JOIN users u ON uri.user_id = u.id
          JOIN repositories r ON uri.repository_id = r.id
          WHERE uri.visit_count > 0
          ORDER BY conversion_rate DESC NULLS LAST
          LIMIT 25
        `,
        iterations: 20,
      },
    ]

    this.results.complexJoins = {}

    for (const queryTest of joinQueries) {
      const times = []

      for (let i = 0; i < queryTest.iterations; i++) {
        const start = performance.now()
        await queryTest.query()
        const end = performance.now()
        times.push(end - start)
      }

      const stats = this.calculateStats(times)
      this.results.complexJoins[queryTest.name] = stats
    }
  }

  async benchmarkIndexPerformance() {
    // First, check index usage
    await this.analyzeIndexUsage()

    const indexQueries = [
      {
        name: 'GIN index on preferred_languages',
        query: () => this.sql`
          SELECT * FROM users 
          WHERE preferred_languages @> ARRAY['JavaScript']
        `,
        iterations: 30,
      },
      {
        name: 'GIN index on repository topics',
        query: () => this.sql`
          SELECT * FROM repositories 
          WHERE topics @> ARRAY['machine-learning']
        `,
        iterations: 30,
      },
      {
        name: 'Trigram index on repository names',
        query: () => this.sql`
          SELECT * FROM repositories 
          WHERE name ILIKE '%search%'
        `,
        iterations: 25,
      },
      {
        name: 'Composite index on opportunities',
        query: () => this.sql`
          SELECT * FROM opportunities 
          WHERE difficulty = 'intermediate' AND good_first_issue = true
          ORDER BY priority DESC
          LIMIT 20
        `,
        iterations: 30,
      },
    ]

    this.results.indexPerformance = {}

    for (const queryTest of indexQueries) {
      const times = []

      for (let i = 0; i < queryTest.iterations; i++) {
        const start = performance.now()
        await queryTest.query()
        const end = performance.now()
        times.push(end - start)
      }

      const stats = this.calculateStats(times)
      this.results.indexPerformance[queryTest.name] = stats
    }
  }

  async analyzeIndexUsage() {
    try {
      const indexStats = await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          CASE 
            WHEN idx_tup_read = 0 THEN 0 
            ELSE (idx_tup_fetch::float / idx_tup_read) * 100 
          END as selectivity_percent
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_tup_read DESC
      `
      indexStats.slice(0, 10).forEach(stat => {
        console.log(
          `Index: ${stat.indexname}, Scans: ${stat.idx_scan}, Tuples: ${stat.idx_tup_read}`
        )
      })
    } catch (error) {
      console.error('Error fetching index statistics:', error.message)
    }
  }

  async benchmarkCacheOperations() {
    const cacheOperations = [
      {
        name: 'Redis SET operations',
        operation: async () => {
          await this.redis.set(
            `test:key:${Math.random()}`,
            JSON.stringify({ test: 'data', timestamp: Date.now() })
          )
        },
        iterations: 100,
      },
      {
        name: 'Redis GET operations',
        setup: async () => {
          for (let i = 0; i < 50; i++) {
            await this.redis.set(`test:get:${i}`, JSON.stringify({ id: i, data: 'test' }))
          }
        },
        operation: async () => {
          const key = `test:get:${Math.floor(Math.random() * 50)}`
          await this.redis.get(key)
        },
        iterations: 100,
      },
      {
        name: 'Redis Hash operations (HSET/HGET)',
        operation: async () => {
          const hashKey = `test:hash:${Math.floor(Math.random() * 10)}`
          await this.redis.hset(
            hashKey,
            `field:${Math.random()}`,
            JSON.stringify({ timestamp: Date.now() })
          )
          await this.redis.hget(hashKey, `field:${Math.random()}`)
        },
        iterations: 100,
      },
      {
        name: 'Cache vs Database query comparison',
        setup: async () => {
          // Cache a query result
          const result = await this.sql`SELECT * FROM users LIMIT 10`
          await this.redis.setex('cached:users:limit10', 300, JSON.stringify(result))
        },
        operation: async () => {
          // Alternate between cache hit and database query
          if (Math.random() > 0.5) {
            await this.redis.get('cached:users:limit10')
          } else {
            await this.sql`SELECT * FROM users LIMIT 10`
          }
        },
        iterations: 50,
      },
    ]

    this.results.cacheOperations = {}

    for (const test of cacheOperations) {
      if (test.setup) {
        await test.setup()
      }

      const times = []

      for (let i = 0; i < test.iterations; i++) {
        const start = performance.now()
        await test.operation()
        const end = performance.now()
        times.push(end - start)
      }

      const stats = this.calculateStats(times)
      this.results.cacheOperations[test.name] = stats
    }

    // Cleanup test keys
    const keys = await this.redis.keys('test:*')
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }

  calculateStats(times) {
    const sorted = times.sort((a, b) => a - b)
    const sum = times.reduce((a, b) => a + b, 0)

    return {
      min: Math.min(...times),
      max: Math.max(...times),
      avg: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    }
  }

  generateReport() {
    // Basic queries summary
    if (this.results.basicQueries) {
      const _avgBasic =
        Object.values(this.results.basicQueries).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.basicQueries).length
    }

    // Vector search summary
    if (this.results.vectorSearch) {
      const _avgVector =
        Object.values(this.results.vectorSearch).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.vectorSearch).length
    }

    // Complex joins summary
    if (this.results.complexJoins) {
      const _avgJoins =
        Object.values(this.results.complexJoins).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.complexJoins).length
    }

    // Cache operations summary
    if (this.results.cacheOperations) {
      const _avgCache =
        Object.values(this.results.cacheOperations).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.cacheOperations).length
    }

    // Generate recommendations based on results
    this.generateRecommendations()

    // Save results to file
    this.saveResults()
  }

  generateRecommendations() {
    const recommendations = []

    // Vector search recommendations
    if (this.results.vectorSearch) {
      const slowestVector = Math.max(...Object.values(this.results.vectorSearch).map(s => s.avg))
      if (slowestVector > 50) {
        recommendations.push(
          '🔍 Vector search performance could be improved. Consider adjusting HNSW parameters (ef_search, m).'
        )
      }
    }

    // Basic query recommendations
    if (this.results.basicQueries) {
      const slowestBasic = Math.max(...Object.values(this.results.basicQueries).map(s => s.avg))
      if (slowestBasic > 20) {
        recommendations.push(
          '📊 Some basic queries are slow. Review indexes and query optimization.'
        )
      }
    }

    // Join recommendations
    if (this.results.complexJoins) {
      const slowestJoin = Math.max(...Object.values(this.results.complexJoins).map(s => s.avg))
      if (slowestJoin > 100) {
        recommendations.push(
          '🔗 Complex joins are slow. Consider query optimization or denormalization.'
        )
      }
    }

    // Cache recommendations
    if (this.results.cacheOperations && this.results.basicQueries) {
      const avgCache =
        Object.values(this.results.cacheOperations).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.cacheOperations).length
      const avgDB =
        Object.values(this.results.basicQueries).reduce((sum, stats) => sum + stats.avg, 0) /
        Object.keys(this.results.basicQueries).length

      if (avgCache < avgDB * 0.1) {
        recommendations.push(
          '⚡ Cache is significantly faster than database. Consider more aggressive caching.'
        )
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '✅ All performance metrics look good! No immediate optimizations needed.'
      )
    }

    recommendations.forEach(_rec => {
      // Process recommendation
    })
  }

  saveResults() {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        totalTests: Object.keys(this.results).length,
        environment: {
          node_version: process.version,
          database: 'PostgreSQL with pgvector',
          cache: this.redis ? 'Redis' : 'None',
        },
      },
    }

    const fs = require('node:fs')
    const path = require('node:path')

    const reportsDir = path.join(__dirname, '../reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    const filename = `performance-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const filepath = path.join(reportsDir, filename)

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2))
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.quit()
    }
  }
}

// CLI Interface
async function main() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
  const redisUrl = process.env.REDIS_URL_TEST || process.env.REDIS_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const benchmarks = new PerformanceBenchmarks(databaseUrl, redisUrl)

  try {
    await benchmarks.runAllBenchmarks()
  } finally {
    await benchmarks.cleanup()
  }
}

if (require.main === module) {
  main()
}

module.exports = { PerformanceBenchmarks }
