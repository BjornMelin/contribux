#!/usr/bin/env node

/**
 * Advanced Memory Optimization Suite
 * Analyzes and optimizes memory usage across the entire application
 */

const { performance } = require('perf_hooks')
const v8 = require('v8')
const fs = require('fs').promises
const path = require('path')

class MemoryOptimizer {
  constructor() {
    this.baseline = null
    this.snapshots = []
    this.recommendations = []
  }

  // Format bytes to human readable
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024
      i++
    }
    return `${bytes.toFixed(2)} ${units[i]}`
  }

  // Get comprehensive memory statistics
  getMemoryStats() {
    const heapStats = v8.getHeapStatistics()
    const memoryUsage = process.memoryUsage()
    const heapSpaceStats = v8.getHeapSpaceStatistics()
    
    return {
      timestamp: Date.now(),
      heap: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        efficiency: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      v8: {
        totalHeapSize: heapStats.total_heap_size,
        usedHeapSize: heapStats.used_heap_size,
        totalAvailableSize: heapStats.total_available_size,
        heapSizeLimit: heapStats.heap_size_limit
      },
      process: {
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      heapSpaces: heapSpaceStats.map(space => ({
        name: space.space_name,
        size: space.space_size,
        used: space.space_used_size,
        available: space.space_available_size,
        efficiency: (space.space_used_size / space.space_size) * 100
      }))
    }
  }

  // Set baseline measurement
  setBaseline() {
    this.baseline = this.getMemoryStats()
    console.log('📊 Baseline memory usage established:')
    console.log(`   Heap Used: ${this.formatBytes(this.baseline.heap.used)}`)
    console.log(`   RSS: ${this.formatBytes(this.baseline.process.rss)}`)
  }

  // Take memory snapshot
  takeSnapshot(label = 'snapshot') {
    const stats = this.getMemoryStats()
    this.snapshots.push({ label, stats })
    
    console.log(`📸 Memory snapshot "${label}":`)
    console.log(`   Heap Used: ${this.formatBytes(stats.heap.used)}`)
    console.log(`   RSS: ${this.formatBytes(stats.process.rss)}`)
    
    if (this.baseline) {
      const heapDiff = stats.heap.used - this.baseline.heap.used
      const rssDiff = stats.process.rss - this.baseline.process.rss
      console.log(`   Heap Δ: ${heapDiff > 0 ? '+' : ''}${this.formatBytes(heapDiff)}`)
      console.log(`   RSS Δ: ${rssDiff > 0 ? '+' : ''}${this.formatBytes(rssDiff)}`)
    }
  }

  // Force garbage collection if available
  forceGC() {
    if (global.gc) {
      const before = this.getMemoryStats()
      global.gc()
      const after = this.getMemoryStats()
      
      const freed = before.heap.used - after.heap.used
      console.log(`🗑️  Garbage collection freed: ${this.formatBytes(freed)}`)
      return freed
    } else {
      console.log('⚠️  Garbage collection not available (run with --expose-gc)')
      return 0
    }
  }

  // Analyze memory patterns
  analyzePatterns() {
    if (this.snapshots.length < 2) {
      console.log('📈 Need at least 2 snapshots for pattern analysis')
      return
    }

    console.log('\n📈 Memory Pattern Analysis:')
    console.log('---------------------------')

    const growth = this.snapshots.map((snapshot, i) => {
      if (i === 0) return null
      const prev = this.snapshots[i - 1]
      return {
        label: `${prev.label} → ${snapshot.label}`,
        heapGrowth: snapshot.stats.heap.used - prev.stats.heap.used,
        rssGrowth: snapshot.stats.process.rss - prev.stats.process.rss
      }
    }).filter(Boolean)

    growth.forEach(g => {
      console.log(`   ${g.label}:`)
      console.log(`     Heap: ${g.heapGrowth > 0 ? '+' : ''}${this.formatBytes(g.heapGrowth)}`)
      console.log(`     RSS: ${g.rssGrowth > 0 ? '+' : ''}${this.formatBytes(g.rssGrowth)}`)
    })
  }

  // Generate optimization recommendations
  generateRecommendations() {
    const current = this.getMemoryStats()
    this.recommendations = []

    // Heap efficiency check
    if (current.heap.efficiency < 60) {
      this.recommendations.push({
        type: 'heap-efficiency',
        severity: 'medium',
        message: 'Low heap efficiency detected',
        action: 'Consider forcing garbage collection or reducing heap allocations'
      })
    }

    // High RSS check
    if (current.process.rss > 100 * 1024 * 1024) {
      this.recommendations.push({
        type: 'high-rss',
        severity: 'high',
        message: 'RSS exceeds 100MB',
        action: 'Investigate memory leaks and optimize large object allocations'
      })
    }

    // External memory check
    if (current.process.external > 20 * 1024 * 1024) {
      this.recommendations.push({
        type: 'high-external',
        severity: 'medium',
        message: 'High external memory usage',
        action: 'Review Buffer usage and native module memory consumption'
      })
    }

    // Heap space analysis
    current.heapSpaces.forEach(space => {
      if (space.efficiency > 90 && space.size > 10 * 1024 * 1024) {
        this.recommendations.push({
          type: 'heap-space-pressure',
          severity: 'medium',
          message: `High pressure in ${space.name} heap space`,
          action: 'Consider optimizing object allocations in this space'
        })
      }
    })

    console.log('\n💡 Optimization Recommendations:')
    console.log('--------------------------------')
    
    if (this.recommendations.length === 0) {
      console.log('✅ No immediate optimizations needed')
    } else {
      this.recommendations.forEach(rec => {
        const icon = rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '🟢'
        console.log(`${icon} ${rec.message}`)
        console.log(`   → ${rec.action}`)
      })
    }
  }

  // Generate detailed report
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseline: this.baseline,
      snapshots: this.snapshots,
      recommendations: this.recommendations,
      summary: {
        totalSnapshots: this.snapshots.length,
        currentHeapUsage: this.getMemoryStats().heap.used,
        currentRSSUsage: this.getMemoryStats().process.rss,
        optimizationsSuggested: this.recommendations.length
      }
    }

    const reportPath = `memory-optimization-report-${Date.now()}.json`
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
    
    console.log(`\n📋 Detailed report saved: ${reportPath}`)
    return report
  }

  // Run automated memory test
  async runMemoryTest() {
    console.log('🧪 Running Automated Memory Test\n')
    
    this.setBaseline()
    
    // Simulate various memory scenarios
    console.log('\n1. Initial state')
    this.takeSnapshot('initial')
    
    console.log('\n2. Simulating object creation')
    const objects = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      data: new Array(100).fill(Math.random()),
      timestamp: Date.now()
    }))
    this.takeSnapshot('after-allocation')
    
    console.log('\n3. Forcing garbage collection')
    this.forceGC()
    this.takeSnapshot('after-gc')
    
    console.log('\n4. Clearing references')
    objects.length = 0
    this.forceGC()
    this.takeSnapshot('after-cleanup')
    
    this.analyzePatterns()
    this.generateRecommendations()
    
    return await this.generateReport()
  }
}

// CLI interface
async function main() {
  const optimizer = new MemoryOptimizer()
  
  if (process.argv.includes('--test')) {
    await optimizer.runMemoryTest()
  } else if (process.argv.includes('--current')) {
    optimizer.setBaseline()
    optimizer.generateRecommendations()
  } else if (process.argv.includes('--watch')) {
    console.log('👀 Monitoring memory usage (press Ctrl+C to stop)...\n')
    optimizer.setBaseline()
    
    let snapshotCount = 0
    const interval = setInterval(() => {
      optimizer.takeSnapshot(`watch-${++snapshotCount}`)
      
      if (snapshotCount % 5 === 0) {
        optimizer.analyzePatterns()
        optimizer.generateRecommendations()
      }
    }, 5000)
    
    process.on('SIGINT', async () => {
      clearInterval(interval)
      console.log('\n📊 Final analysis...')
      await optimizer.generateReport()
      process.exit(0)
    })
  } else {
    console.log('Memory Optimizer Usage:')
    console.log('  --test     Run automated memory test')
    console.log('  --current  Analyze current memory usage')
    console.log('  --watch    Monitor memory usage over time')
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { MemoryOptimizer }