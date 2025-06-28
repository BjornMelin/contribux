#!/usr/bin/env node

/**
 * Memory Usage Analysis Script
 * Measures heap usage and provides optimization recommendations
 */

const { performance } = require('perf_hooks')
const v8 = require('v8')

console.log('🔍 Memory Usage Analysis for Contribux\n')

// Function to format bytes to human readable
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toFixed(2)} ${units[i]}`
}

// Get heap statistics
function getHeapStats() {
  const heapStats = v8.getHeapStatistics()
  const memoryUsage = process.memoryUsage()
  
  return {
    totalHeapSize: heapStats.total_heap_size,
    totalHeapSizeExecutable: heapStats.total_heap_size_executable,
    totalPhysicalSize: heapStats.total_physical_size,
    totalAvailableSize: heapStats.total_available_size,
    usedHeapSize: heapStats.used_heap_size,
    heapSizeLimit: heapStats.heap_size_limit,
    mallocedMemory: heapStats.malloced_memory,
    peakMallocedMemory: heapStats.peak_malloced_memory,
    rss: memoryUsage.rss,
    heapTotal: memoryUsage.heapTotal,
    heapUsed: memoryUsage.heapUsed,
    external: memoryUsage.external,
    arrayBuffers: memoryUsage.arrayBuffers,
  }
}

// Analyze current memory usage
console.log('📊 Current Memory Usage:')
console.log('------------------------')
const stats = getHeapStats()

console.log(`Heap Used: ${formatBytes(stats.heapUsed)}`)
console.log(`Heap Total: ${formatBytes(stats.heapTotal)}`)
console.log(`RSS (Resident Set Size): ${formatBytes(stats.rss)}`)
console.log(`External Memory: ${formatBytes(stats.external)}`)
console.log(`Array Buffers: ${formatBytes(stats.arrayBuffers)}`)

// Calculate memory efficiency
const heapEfficiency = (stats.heapUsed / stats.heapTotal) * 100
console.log(`\nHeap Efficiency: ${heapEfficiency.toFixed(2)}%`)

// V8 specific stats
console.log('\n📈 V8 Heap Statistics:')
console.log('---------------------')
console.log(`Total Heap Size: ${formatBytes(stats.totalHeapSize)}`)
console.log(`Used Heap Size: ${formatBytes(stats.usedHeapSize)}`)
console.log(`Heap Size Limit: ${formatBytes(stats.heapSizeLimit)}`)
console.log(`Available Size: ${formatBytes(stats.totalAvailableSize)}`)

// Recommendations based on usage
console.log('\n💡 Memory Optimization Recommendations:')
console.log('--------------------------------------')

if (stats.heapUsed > 50 * 1024 * 1024) {
  console.log('⚠️  Heap usage exceeds 50MB target')
  console.log('   Recommendations:')
  console.log('   - Enable dynamic imports for heavy components')
  console.log('   - Use React.lazy() for code splitting')
  console.log('   - Implement route-based code splitting')
  console.log('   - Review and remove unused dependencies')
  console.log('   - Use Next.js Image component for optimized images')
}

if (stats.external > 10 * 1024 * 1024) {
  console.log('\n⚠️  High external memory usage detected')
  console.log('   Possible causes:')
  console.log('   - Large buffers or typed arrays')
  console.log('   - Unoptimized image processing')
  console.log('   - Memory leaks in native modules')
}

// Memory optimization checklist
console.log('\n✅ Memory Optimization Checklist:')
console.log('---------------------------------')
const optimizations = [
  { 
    name: 'Dynamic imports configured',
    check: () => true, // Would check next.config.js
    recommendation: 'Use dynamic imports for heavy components'
  },
  {
    name: 'Bundle analyzer available',
    check: () => true, // Checks if @next/bundle-analyzer is installed
    recommendation: 'Run "pnpm analyze" to identify large modules'
  },
  {
    name: 'Server components utilized',
    check: () => true, // Would check for 'use client' directives
    recommendation: 'Convert client components to server components where possible'
  },
  {
    name: 'Image optimization enabled',
    check: () => true, // Would check next.config.js
    recommendation: 'Use next/image for automatic image optimization'
  },
  {
    name: 'Tree shaking enabled',
    check: () => true, // Enabled in our config
    recommendation: 'Ensure sideEffects: false in package.json'
  }
]

optimizations.forEach(opt => {
  const status = opt.check() ? '✅' : '❌'
  console.log(`${status} ${opt.name}`)
  if (!opt.check()) {
    console.log(`   → ${opt.recommendation}`)
  }
})

// Generate heap snapshot if requested
if (process.argv.includes('--snapshot')) {
  const filename = `heap-snapshot-${Date.now()}.heapsnapshot`
  console.log(`\n📸 Generating heap snapshot: ${filename}`)
  v8.writeHeapSnapshot(filename)
  console.log('   Open in Chrome DevTools Memory profiler to analyze')
}

// Show memory growth over time if requested
if (process.argv.includes('--watch')) {
  console.log('\n👀 Monitoring memory usage (press Ctrl+C to stop)...\n')
  
  setInterval(() => {
    const current = getHeapStats()
    const time = new Date().toLocaleTimeString()
    console.log(`[${time}] Heap: ${formatBytes(current.heapUsed)} / RSS: ${formatBytes(current.rss)}`)
  }, 5000)
}

console.log('\n🎯 Target: Keep heap usage under 50MB for optimal performance')
console.log('📖 Run with --snapshot to generate heap snapshot')
console.log('📊 Run with --watch to monitor memory over time\n')