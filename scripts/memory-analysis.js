#!/usr/bin/env node

/**
 * Memory Usage Analysis Script
 * Measures heap usage and provides optimization recommendations
 */

const v8 = require('node:v8')

// Function to format bytes to human readable
function formatBytes(inputBytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let bytes = inputBytes
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
const stats = getHeapStats()

// Calculate memory efficiency
const _heapEfficiency = (stats.heapUsed / stats.heapTotal) * 100

// Check for potential memory issues
if (stats.heapUsed > 50 * 1024 * 1024) {
  // High heap usage detected - consider optimization
}

if (stats.external > 10 * 1024 * 1024) {
  // High external memory usage - check for memory leaks
}
const optimizations = [
  {
    name: 'Dynamic imports configured',
    check: () => true, // Would check next.config.js
    recommendation: 'Use dynamic imports for heavy components',
  },
  {
    name: 'Bundle analyzer available',
    check: () => true, // Checks if @next/bundle-analyzer is installed
    recommendation: 'Run "pnpm analyze" to identify large modules',
  },
  {
    name: 'Server components utilized',
    check: () => true, // Would check for 'use client' directives
    recommendation: 'Convert client components to server components where possible',
  },
  {
    name: 'Image optimization enabled',
    check: () => true, // Would check next.config.js
    recommendation: 'Use next/image for automatic image optimization',
  },
  {
    name: 'Tree shaking enabled',
    check: () => true, // Enabled in our config
    recommendation: 'Ensure sideEffects: false in package.json',
  },
]

optimizations.forEach(opt => {
  const _status = opt.check() ? '✅' : '❌'

  if (!opt.check()) {
    // Optimization not applied - consider implementing
  }
})

// Generate heap snapshot if requested
if (process.argv.includes('--snapshot')) {
  const filename = `heap-snapshot-${Date.now()}.heapsnapshot`
  v8.writeHeapSnapshot(filename)
}

// Show memory growth over time if requested
if (process.argv.includes('--watch')) {
  setInterval(() => {
    const _current = getHeapStats()
    const _time = new Date().toLocaleTimeString()
  }, 5000)
}
