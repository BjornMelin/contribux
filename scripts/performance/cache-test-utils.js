#!/usr/bin/env node

/**
 * Cache Testing Utilities for contribux
 * Provides comprehensive testing and validation of caching strategies
 */

const Redis = require('ioredis')
const { neon } = require('@neondatabase/serverless')

class CacheTestUtils {
  constructor(databaseUrl, redisUrl) {
    this.sql = neon(databaseUrl)
    this.redis = redisUrl ? new Redis(redisUrl) : null
    this.testResults = {}
  }

  async runAllCacheTests() {
    try {
      if (!this.redis) {
        await this.testDatabaseOnly()
        return
      }

      await this.testCacheConnectivity()
      await this.testCacheHitRatio()
      await this.testCacheInvalidation()
      await this.testCachePerformance()
      await this.testCacheConsistency()
      await this.testMemoryUsage()
      await this.testCacheExpiration()

      this.generateCacheReport()
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: CLI script error output
      console.error('❌ Cache testing failed:', error.message)
      process.exit(1)
    }
  }

  async testCacheConnectivity() {
    try {
      // Test basic Redis operations
      await this.redis.ping()
      await this.redis.set('test:connectivity', 'ok')
      const result = await this.redis.get('test:connectivity')

      if (result === 'ok') {
        this.testResults.connectivity = { status: 'pass', latency: null }
      } else {
        throw new Error('Connectivity test failed')
      }

      // Measure latency
      const latencyTests = []
      for (let i = 0; i < 10; i++) {
        const start = performance.now()
        await this.redis.ping()
        const end = performance.now()
        latencyTests.push(end - start)
      }

      const avgLatency = latencyTests.reduce((a, b) => a + b, 0) / latencyTests.length
      this.testResults.connectivity.latency = avgLatency

      // Cleanup
      await this.redis.del('test:connectivity')
    } catch (error) {
      this.testResults.connectivity = { status: 'fail', error: error.message }
      throw error
    }
  }

  async testCacheHitRatio() {
    const testData = [
      { key: 'users:1', data: { id: 1, name: 'Alice' } },
      { key: 'users:2', data: { id: 2, name: 'Bob' } },
      { key: 'repos:1', data: { id: 1, name: 'test-repo' } },
      { key: 'repos:2', data: { id: 2, name: 'another-repo' } },
    ]

    // Populate cache
    for (const item of testData) {
      await this.redis.setex(`test:cache:${item.key}`, 300, JSON.stringify(item.data))
    }

    let hits = 0
    let misses = 0
    const totalRequests = 100

    // Simulate cache requests (80% hit ratio expected)
    for (let i = 0; i < totalRequests; i++) {
      let key
      if (Math.random() < 0.8) {
        // 80% chance of requesting existing keys (cache hit)
        key = `test:cache:${testData[Math.floor(Math.random() * testData.length)].key}`
      } else {
        // 20% chance of requesting non-existing keys (cache miss)
        key = `test:cache:nonexistent:${Math.random()}`
      }

      const result = await this.redis.get(key)
      if (result) {
        hits++
      } else {
        misses++
      }
    }

    const hitRatio = (hits / totalRequests) * 100
    this.testResults.hitRatio = { hits, misses, ratio: hitRatio }

    // Cleanup
    for (const item of testData) {
      await this.redis.del(`test:cache:${item.key}`)
    }
  }

  async testCacheInvalidation() {
    // Test TTL-based invalidation
    await this.redis.setex('test:ttl:short', 2, 'expires-soon')
    await this.redis.setex('test:ttl:long', 10, 'expires-later')
    await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds

    const shortResult = await this.redis.get('test:ttl:short')
    const longResult = await this.redis.get('test:ttl:long')

    if (!shortResult && longResult) {
      this.testResults.ttlInvalidation = { status: 'pass' }
    } else {
      this.testResults.ttlInvalidation = { status: 'fail' }
    }

    // Test manual invalidation
    await this.redis.set('test:manual:key1', 'value1')
    await this.redis.set('test:manual:key2', 'value2')

    // Invalidate by pattern
    const keys = await this.redis.keys('test:manual:*')
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }

    const remainingKeys = await this.redis.keys('test:manual:*')
    if (remainingKeys.length === 0) {
      this.testResults.manualInvalidation = { status: 'pass' }
    } else {
      this.testResults.manualInvalidation = { status: 'fail' }
    }

    // Cleanup remaining test keys
    await this.redis.del('test:ttl:long')
  }

  async testCachePerformance() {
    // Setup: Store a query result in cache
    const queryResult = await this.sql`SELECT * FROM users LIMIT 20`
    const cacheKey = 'test:perf:users:20'
    await this.redis.setex(cacheKey, 300, JSON.stringify(queryResult))

    // Test cache retrieval performance
    const cacheTests = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      await this.redis.get(cacheKey)
      const end = performance.now()
      cacheTests.push(end - start)
    }

    // Test database query performance
    const dbTests = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      await this.sql`SELECT * FROM users LIMIT 20`
      const end = performance.now()
      dbTests.push(end - start)
    }

    const avgCacheTime = cacheTests.reduce((a, b) => a + b, 0) / cacheTests.length
    const avgDbTime = dbTests.reduce((a, b) => a + b, 0) / dbTests.length
    const speedupRatio = avgDbTime / avgCacheTime

    this.testResults.performance = {
      cacheAvg: avgCacheTime,
      dbAvg: avgDbTime,
      speedup: speedupRatio,
    }

    // Cleanup
    await this.redis.del(cacheKey)
  }

  async testCacheConsistency() {
    // Test concurrent reads and writes
    const testKey = 'test:consistency:counter'
    await this.redis.set(testKey, '0')

    // Simulate concurrent operations
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(this.redis.incr(testKey))
    }

    await Promise.all(promises)
    const finalValue = await this.redis.get(testKey)

    if (Number.parseInt(finalValue) === 10) {
      this.testResults.consistency = { status: 'pass', finalValue: finalValue }
    } else {
      this.testResults.consistency = { status: 'fail', finalValue: finalValue }
    }

    // Test transaction consistency
    const multi = this.redis.multi()
    multi.set('test:tx:key1', 'value1')
    multi.set('test:tx:key2', 'value2')
    multi.set('test:tx:key3', 'value3')

    const results = await multi.exec()
    const allSuccessful = results.every(([err, result]) => err === null && result === 'OK')

    if (allSuccessful) {
      this.testResults.transactions = { status: 'pass' }
    } else {
      this.testResults.transactions = { status: 'fail' }
    }

    // Cleanup
    await this.redis.del(testKey, 'test:tx:key1', 'test:tx:key2', 'test:tx:key3')
  }

  async testMemoryUsage() {
    try {
      // Get initial memory info
      const _initialInfo = await this.redis.memory('usage', 'test:memory:baseline')

      // Create test data of various sizes
      const testData = {
        small: 'x'.repeat(100), // 100 bytes
        medium: 'x'.repeat(10000), // 10KB
        large: 'x'.repeat(100000), // 100KB
      }

      const memoryTests = {}

      for (const [size, data] of Object.entries(testData)) {
        const key = `test:memory:${size}`
        await this.redis.set(key, data)

        const usage = await this.redis.memory('usage', key)
        memoryTests[size] = {
          dataSize: data.length,
          memoryUsage: usage || 0,
          overhead: usage ? usage - data.length : 0,
        }

        await this.redis.del(key)
      }

      this.testResults.memoryUsage = memoryTests
    } catch (_error) {
      // Memory usage testing failed - Redis MEMORY command may not be available
      this.testResults.memoryUsage = {
        status: 'unavailable',
        reason: 'Redis MEMORY command not supported',
      }
    }
  }

  async testCacheExpiration() {
    // Test different expiration strategies
    const expirationTests = [
      { key: 'test:exp:seconds', value: 'expires-in-seconds', ttl: 3 },
      { key: 'test:exp:minutes', value: 'expires-in-minutes', ttl: 60 },
      { key: 'test:exp:hours', value: 'expires-in-hours', ttl: 3600 },
    ]

    // Set keys with different TTLs
    for (const test of expirationTests) {
      await this.redis.setex(test.key, test.ttl, test.value)
    }

    // Check TTL values
    const ttlResults = {}
    for (const test of expirationTests) {
      const ttl = await this.redis.ttl(test.key)
      ttlResults[test.key] = ttl
    }

    // Test expiration behavior with short TTL
    await this.redis.setex('test:exp:immediate', 1, 'expires-very-soon')
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds

    const expiredValue = await this.redis.get('test:exp:immediate')
    if (!expiredValue) {
      this.testResults.expiration = { status: 'pass', ttlResults }
    } else {
      this.testResults.expiration = { status: 'fail', ttlResults }
    }

    // Cleanup remaining keys
    for (const test of expirationTests) {
      await this.redis.del(test.key)
    }
  }

  async testDatabaseOnly() {
    // Test database query patterns that would benefit from caching
    const queries = [
      {
        name: 'Frequently accessed users',
        query: () => this.sql`SELECT * FROM users WHERE skill_level = 'advanced' LIMIT 10`,
        iterations: 20,
      },
      {
        name: 'Popular repositories',
        query: () => this.sql`SELECT * FROM repositories ORDER BY stars_count DESC LIMIT 20`,
        iterations: 15,
      },
      {
        name: 'Recent opportunities',
        query: () =>
          this
            .sql`SELECT * FROM opportunities WHERE created_at > NOW() - INTERVAL '7 days' LIMIT 15`,
        iterations: 20,
      },
    ]

    this.testResults.databaseOnly = {}

    for (const queryTest of queries) {
      const times = []

      for (let i = 0; i < queryTest.iterations; i++) {
        const start = performance.now()
        await queryTest.query()
        const end = performance.now()
        times.push(end - start)
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length
      this.testResults.databaseOnly[queryTest.name] = { avg, times }
    }
  }

  generateCacheReport() {
    // Log connectivity status
    if (this.testResults.connectivity?.status === 'pass') {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log('  ✅ Cache connectivity: PASS')
    } else {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log('  ❌ Cache connectivity: FAIL')
    }

    // Log hit ratio if available
    if (this.testResults.hitRatio) {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log(`  📊 Cache hit ratio: ${this.testResults.hitRatio.ratio}%`)
    }

    // Log performance metrics if available
    if (this.testResults.performance) {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log(`  ⚡ Cache performance: ${this.testResults.performance.averageTime}ms avg`)
    }

    // Log consistency test results
    if (this.testResults.consistency?.status === 'pass') {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log('  ✅ Cache consistency: PASS')
    }

    // Log expiration test results
    if (this.testResults.expiration?.status === 'pass') {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log('  ✅ Cache expiration: PASS')
    }

    const recommendations = this.generateCacheRecommendations()
    // Log recommendations to provide user feedback
    recommendations.forEach(rec => {
      // biome-ignore lint/suspicious/noConsole: CLI script user feedback
      console.log(`  ${rec}`)
    })

    // Save detailed results
    this.saveCacheResults()
  }

  generateCacheRecommendations() {
    const recommendations = []

    if (this.testResults.performance?.speedup < 5) {
      recommendations.push(
        '⚠️  Cache speedup is low. Consider optimizing cache serialization or Redis configuration.'
      )
    }

    if (this.testResults.hitRatio?.ratio < 70) {
      recommendations.push('⚠️  Cache hit ratio is low. Review caching strategy and TTL values.')
    }

    if (this.testResults.connectivity?.latency > 10) {
      recommendations.push(
        '⚠️  Redis latency is high. Consider Redis optimization or network configuration.'
      )
    }

    if (
      this.testResults.memoryUsage &&
      Object.values(this.testResults.memoryUsage).some(test => test.overhead > test.dataSize)
    ) {
      recommendations.push(
        '💾 High memory overhead detected. Consider data structure optimization.'
      )
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '✅ Cache performance looks excellent! All metrics are within optimal ranges.'
      )
    }

    return recommendations
  }

  saveCacheResults() {
    const report = {
      timestamp: new Date().toISOString(),
      testResults: this.testResults,
      environment: {
        redis: this.redis ? 'Available' : 'Not Available',
        node_version: process.version,
      },
    }

    const fs = require('node:fs')
    const path = require('node:path')

    const reportsDir = path.join(__dirname, '../reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    const filename = `cache-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const filepath = path.join(reportsDir, filename)

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2))
  }

  async cleanup() {
    if (this.redis) {
      // Clean up any remaining test keys
      const testKeys = await this.redis.keys('test:*')
      if (testKeys.length > 0) {
        await this.redis.del(...testKeys)
      }
      await this.redis.quit()
    }
  }
}

// CLI Interface
async function main() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
  const redisUrl = process.env.REDIS_URL_TEST || 'redis://localhost:6379'

  if (!databaseUrl) {
    process.exit(1)
  }

  const cacheTests = new CacheTestUtils(databaseUrl, redisUrl)

  try {
    await cacheTests.runAllCacheTests()
  } finally {
    await cacheTests.cleanup()
  }
}

if (require.main === module) {
  main()
}

module.exports = { CacheTestUtils }
