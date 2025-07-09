/**
 * Performance Benchmarking Script for Cryptographic Random Generation
 *
 * Run with: pnpm tsx scripts/benchmark-crypto-performance.ts
 */

import {
  SecureRandomPool,
  generateSecureId,
  generateSecureRandomString,
  getSecureRandomBytes,
  getSecureRandomFloat,
  getSecureRandomInt,
} from '../src/lib/security/crypto-secure'

interface BenchmarkResult {
  name: string
  iterations: number
  totalTime: number
  avgTime: number
  opsPerSecond: number
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(num))
}

function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1000000).toFixed(2)}ns`
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`
  return `${ms.toFixed(2)}ms`
}

async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations = 100000
): Promise<BenchmarkResult> {
  // Warm up
  for (let i = 0; i < 100; i++) {
    await fn()
  }

  // Actual benchmark
  const startTime = performance.now()

  for (let i = 0; i < iterations; i++) {
    await fn()
  }

  const totalTime = performance.now() - startTime
  const avgTime = totalTime / iterations
  const opsPerSecond = 1000 / avgTime

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    opsPerSecond,
  }
}

async function runBenchmarks() {
  const results: BenchmarkResult[] = []
  results.push(
    await benchmark('Math.random()', () => {
      Math.random()
    })
  )

  results.push(
    await benchmark('Math.random() string (16 chars)', () => {
      Math.random().toString(36).substr(2, 16)
    })
  )
  results.push(
    await benchmark('getSecureRandomBytes(1)', () => {
      getSecureRandomBytes(1)
    })
  )

  results.push(
    await benchmark('getSecureRandomBytes(16)', () => {
      getSecureRandomBytes(16)
    })
  )

  results.push(
    await benchmark('getSecureRandomBytes(32)', () => {
      getSecureRandomBytes(32)
    })
  )

  results.push(
    await benchmark('getSecureRandomBytes(64)', () => {
      getSecureRandomBytes(64)
    })
  )
  results.push(
    await benchmark('generateSecureRandomString(16)', () => {
      generateSecureRandomString(16)
    })
  )

  results.push(
    await benchmark('generateSecureRandomString(32)', () => {
      generateSecureRandomString(32)
    })
  )
  results.push(
    await benchmark('generateSecureId()', () => {
      generateSecureId()
    })
  )

  results.push(
    await benchmark('generateSecureId("prefix")', () => {
      generateSecureId('req')
    })
  )
  results.push(
    await benchmark('getSecureRandomFloat()', () => {
      getSecureRandomFloat()
    })
  )

  results.push(
    await benchmark('getSecureRandomInt(0, 100)', () => {
      getSecureRandomInt(0, 100)
    })
  )

  results.push(
    await benchmark('getSecureRandomInt(0, 256)', () => {
      getSecureRandomInt(0, 256)
    })
  )

  results.push(
    await benchmark('getSecureRandomInt(0, 10000)', () => {
      getSecureRandomInt(0, 10000)
    })
  )
  const pool = new SecureRandomPool(1024)

  results.push(
    await benchmark('SecureRandomPool.getBytes(16)', () => {
      pool.getBytes(16)
    })
  )

  // Find baseline for comparison
  const baseline = results.find(r => r.name === 'Math.random()')
  if (!baseline) {
    // biome-ignore lint/suspicious/noConsole: Development script
    console.error('Math.random() baseline not found in results')
    return
  }

  // Print header
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`\n🚀 Crypto Performance Benchmark Results - ${detectRuntime()}`)
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log('='.repeat(80))
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(
    `${'Method'.padEnd(35)} ${'Iterations'.padStart(12)} ${'Avg Time'.padStart(12)} ${'Ops/sec'.padStart(15)} ${'Slowdown'.padStart(12)}`
  )
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log('-'.repeat(80))

  // Print results
  results.forEach(result => {
    const slowdown = result.avgTime / baseline.avgTime
    const comparison =
      result.name === 'Math.random()' ? 'baseline' : `${slowdown.toFixed(1)}x slower`

    // biome-ignore lint/suspicious/noConsole: Development script
    console.log(
      `${result.name.padEnd(35)} ${formatNumber(result.iterations).padStart(12)} ${formatTime(result.avgTime).padStart(12)} ${formatNumber(result.opsPerSecond).padStart(15)} ${comparison.padStart(12)}`
    )
  })

  // Calculate and display summary stats
  const secureResults = results.filter(r => r.name.includes('Secure'))
  const avgSlowdown =
    secureResults.length > 0
      ? secureResults.reduce((sum, r) => sum + r.avgTime / baseline.avgTime, 0) /
        secureResults.length
      : 0

  const secureIdResult = results.find(r => r.name === 'generateSecureId()')
  const secureIdTime = secureIdResult?.avgTime || 0
  const requestsPerSecond = 1000
  const overheadMs = requestsPerSecond * secureIdTime
  const overheadPercent = (overheadMs / 1000) * 100

  // biome-ignore lint/suspicious/noConsole: Development script
  console.log('\n📊 Summary:')
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`Average slowdown for secure methods: ${avgSlowdown.toFixed(1)}x`)
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(
    `Overhead for 1000 req/sec with secure IDs: ${formatTime(overheadMs)} (${overheadPercent.toFixed(2)}% of 1 second)`
  )

  // Memory usage test
  const iterations = 100000
  const memBefore = process.memoryUsage().heapUsed

  const _ids = Array.from({ length: iterations }, () => generateSecureId())

  const memAfter = process.memoryUsage().heapUsed
  const memPerID = (memAfter - memBefore) / iterations

  // biome-ignore lint/suspicious/noConsole: Development script
  console.log(`Memory per secure ID: ${memPerID.toFixed(2)} bytes`)
  // biome-ignore lint/suspicious/noConsole: Development script
  console.log('\n✅ Benchmark completed successfully!')
}

// Edge Runtime detection
function detectRuntime(): string {
  if (typeof window !== 'undefined') return 'Browser'
  if (typeof global !== 'undefined' && global.Deno) return 'Deno'
  if (typeof global !== 'undefined' && global.Bun) return 'Bun'
  if (typeof process !== 'undefined' && process.versions?.node) return `Node.js ${process.version}`
  return 'Unknown'
}

runBenchmarks().catch(console.error)
