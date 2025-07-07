/**
 * Performance Benchmarking Script for Cryptographic Random Generation
 * 
 * Run with: pnpm tsx scripts/benchmark-crypto-performance.ts
 */

import {
  getSecureRandomBytes,
  generateSecureRandomString,
  generateSecureId,
  getSecureRandomFloat,
  getSecureRandomInt,
  SecureRandomPool
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
  iterations: number = 100000
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
    opsPerSecond
  }
}

async function runBenchmarks() {
  console.log('🔐 Cryptographic Random Performance Benchmarks')
  console.log('=' .repeat(80))
  console.log()

  const results: BenchmarkResult[] = []

  // Benchmark Math.random() as baseline
  console.log('Running baseline benchmarks...')
  results.push(await benchmark('Math.random()', () => {
    Math.random()
  }))

  results.push(await benchmark('Math.random() string (16 chars)', () => {
    Math.random().toString(36).substr(2, 16)
  }))

  // Benchmark secure random bytes
  console.log('Running secure random bytes benchmarks...')
  results.push(await benchmark('getSecureRandomBytes(1)', () => {
    getSecureRandomBytes(1)
  }))

  results.push(await benchmark('getSecureRandomBytes(16)', () => {
    getSecureRandomBytes(16)
  }))

  results.push(await benchmark('getSecureRandomBytes(32)', () => {
    getSecureRandomBytes(32)
  }))

  results.push(await benchmark('getSecureRandomBytes(64)', () => {
    getSecureRandomBytes(64)
  }))

  // Benchmark secure string generation
  console.log('Running secure string generation benchmarks...')
  results.push(await benchmark('generateSecureRandomString(16)', () => {
    generateSecureRandomString(16)
  }))

  results.push(await benchmark('generateSecureRandomString(32)', () => {
    generateSecureRandomString(32)
  }))

  // Benchmark secure ID generation
  console.log('Running secure ID generation benchmarks...')
  results.push(await benchmark('generateSecureId()', () => {
    generateSecureId()
  }))

  results.push(await benchmark('generateSecureId("prefix")', () => {
    generateSecureId('req')
  }))

  // Benchmark secure float and int
  console.log('Running secure number generation benchmarks...')
  results.push(await benchmark('getSecureRandomFloat()', () => {
    getSecureRandomFloat()
  }))

  results.push(await benchmark('getSecureRandomInt(0, 100)', () => {
    getSecureRandomInt(0, 100)
  }))

  results.push(await benchmark('getSecureRandomInt(0, 256)', () => {
    getSecureRandomInt(0, 256)
  }))

  results.push(await benchmark('getSecureRandomInt(0, 10000)', () => {
    getSecureRandomInt(0, 10000)
  }))

  // Benchmark pooled generation
  console.log('Running pooled generation benchmarks...')
  const pool = new SecureRandomPool(1024)
  
  results.push(await benchmark('SecureRandomPool.getBytes(16)', () => {
    pool.getBytes(16)
  }))

  // Print results
  console.log()
  console.log('📊 Benchmark Results')
  console.log('=' .repeat(80))
  console.log()

  // Find baseline for comparison
  const baseline = results.find(r => r.name === 'Math.random()')!

  // Print header
  console.log(
    'Operation'.padEnd(35) +
    'Avg Time'.padEnd(12) +
    'Ops/sec'.padEnd(15) +
    'vs Math.random()'
  )
  console.log('-' .repeat(80))

  // Print results
  results.forEach(result => {
    const slowdown = result.avgTime / baseline.avgTime
    const comparison = result.name === 'Math.random()' 
      ? 'baseline' 
      : `${slowdown.toFixed(1)}x slower`

    console.log(
      result.name.padEnd(35) +
      formatTime(result.avgTime).padEnd(12) +
      formatNumber(result.opsPerSecond).padEnd(15) +
      comparison
    )
  })

  // Analysis section
  console.log()
  console.log('📈 Performance Analysis')
  console.log('=' .repeat(80))
  console.log()

  const avgSlowdown = results
    .filter(r => r.name.includes('Secure'))
    .reduce((sum, r) => sum + (r.avgTime / baseline.avgTime), 0) / 
    results.filter(r => r.name.includes('Secure')).length

  console.log(`• Average slowdown vs Math.random(): ${avgSlowdown.toFixed(1)}x`)
  console.log(`• Secure ID generation: ${formatNumber(results.find(r => r.name === 'generateSecureId()')!.opsPerSecond)} ops/sec`)
  console.log(`• Time per secure ID: ${formatTime(results.find(r => r.name === 'generateSecureId()')!.avgTime)}`)
  console.log()

  // Real-world implications
  console.log('🌍 Real-World Implications')
  console.log('=' .repeat(80))
  console.log()
  
  const secureIdTime = results.find(r => r.name === 'generateSecureId()')!.avgTime
  const requestsPerSecond = 1000
  const overheadMs = requestsPerSecond * secureIdTime
  const overheadPercent = (overheadMs / 1000) * 100

  console.log(`For a service handling ${formatNumber(requestsPerSecond)} requests/second:`)
  console.log(`• Total overhead from secure IDs: ${overheadMs.toFixed(2)}ms (${overheadPercent.toFixed(2)}% of capacity)`)
  console.log(`• Impact on response time: +${formatTime(secureIdTime)} per request`)
  console.log()

  // Memory usage
  console.log('💾 Memory Efficiency')
  console.log('=' .repeat(80))
  console.log()
  
  const iterations = 100000
  const memBefore = process.memoryUsage().heapUsed
  
  const ids = Array.from({ length: iterations }, () => generateSecureId())
  
  const memAfter = process.memoryUsage().heapUsed
  const memPerID = (memAfter - memBefore) / iterations

  console.log(`Memory per secure ID: ~${Math.round(memPerID)} bytes`)
  console.log(`Memory for ${formatNumber(iterations)} IDs: ${((memAfter - memBefore) / 1024 / 1024).toFixed(2)} MB`)
  console.log()

  // Recommendations
  console.log('✅ Recommendations')
  console.log('=' .repeat(80))
  console.log()
  console.log('1. Use secure random for all security-sensitive operations')
  console.log('2. Performance impact is negligible for typical web applications')
  console.log('3. Consider pooling for high-frequency generation (>10k/sec)')
  console.log('4. Keep Math.random() for non-security uses (animations, mocks)')
  console.log()
}

// Edge Runtime detection
function detectRuntime(): string {
  if (typeof window !== 'undefined') return 'Browser'
  if (typeof global !== 'undefined' && global.Deno) return 'Deno'
  if (typeof global !== 'undefined' && global.Bun) return 'Bun'
  if (typeof process !== 'undefined' && process.versions?.node) return `Node.js ${process.version}`
  return 'Unknown'
}

// Main execution
console.log(`Running on: ${detectRuntime()}`)
console.log(`Platform: ${process.platform}`)
console.log(`Architecture: ${process.arch}`)
console.log()

runBenchmarks().catch(console.error)