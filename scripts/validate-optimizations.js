#!/usr/bin/env node

/**
 * Optimization Validation Script
 * Validates that performance optimizations are properly implemented
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

class OptimizationValidator {
  constructor() {
    this.results = {
      iconOptimization: false,
      motionOptimization: false,
      cacheOptimization: false,
      queryOptimization: false,
      bundleConfig: false,
      performanceDashboard: false,
    }
    this.issues = []
  }

  validateIconOptimization() {
    console.log('🎯 Validating icon optimization...')

    const iconIndexPath = path.join(projectRoot, 'src/components/icons/index.ts')

    if (!fs.existsSync(iconIndexPath)) {
      this.issues.push('Icon optimization file missing: src/components/icons/index.ts')
      return false
    }

    const content = fs.readFileSync(iconIndexPath, 'utf8')

    // Check for tree-shaken exports
    const hasTreeShakenExports =
      content.includes('export {') && content.includes("from 'lucide-react'")

    // Check for lazy imports
    const hasLazyImports =
      content.includes('LazyIcons') && content.includes("import('lucide-react')")

    if (!hasTreeShakenExports) {
      this.issues.push('Icon tree-shaking not properly implemented')
    }

    if (!hasLazyImports) {
      this.issues.push('Lazy icon loading not implemented')
    }

    this.results.iconOptimization = hasTreeShakenExports && hasLazyImports
    return this.results.iconOptimization
  }

  validateMotionOptimization() {
    console.log('🎬 Validating motion optimization...')

    const motionIndexPath = path.join(projectRoot, 'src/components/motion/index.tsx')

    if (!fs.existsSync(motionIndexPath)) {
      this.issues.push('Motion optimization file missing: src/components/motion/index.tsx')
      return false
    }

    const content = fs.readFileSync(motionIndexPath, 'utf8')

    // Check for lazy loading
    const hasLazyLoading = content.includes('lazy(') && content.includes('framer-motion')

    // Check for motion preference detection
    const hasMotionPreference = content.includes('prefers-reduced-motion')

    // Check for suspense wrapper
    const hasSuspense = content.includes('Suspense')

    if (!hasLazyLoading) {
      this.issues.push('Motion lazy loading not properly implemented')
    }

    if (!hasMotionPreference) {
      this.issues.push('Motion preference detection missing')
    }

    if (!hasSuspense) {
      this.issues.push('Suspense wrapper for motion components missing')
    }

    this.results.motionOptimization = hasLazyLoading && hasMotionPreference && hasSuspense
    return this.results.motionOptimization
  }

  validateCacheOptimization() {
    console.log('🚀 Validating cache optimization...')

    const cacheOptimizedPath = path.join(projectRoot, 'src/lib/cache/api-cache-optimized.ts')

    if (!fs.existsSync(cacheOptimizedPath)) {
      this.issues.push('Cache optimization file missing: src/lib/cache/api-cache-optimized.ts')
      return false
    }

    const content = fs.readFileSync(cacheOptimizedPath, 'utf8')

    // Check for cache configurations
    const hasCacheConfigs = content.includes('CACHE_CONFIGS') && content.includes('staleTime')

    // Check for cache key management
    const hasCacheKeyManager = content.includes('CacheKeyManager')

    // Check for invalidation strategies
    const hasInvalidationManager = content.includes('CacheInvalidationManager')

    // Check for priority-based caching
    const hasPrioritySystem = content.includes('CachePriority')

    if (!hasCacheConfigs) {
      this.issues.push('Cache configurations not properly implemented')
    }

    if (!hasCacheKeyManager) {
      this.issues.push('Cache key management missing')
    }

    if (!hasInvalidationManager) {
      this.issues.push('Cache invalidation strategies missing')
    }

    this.results.cacheOptimization = hasCacheConfigs && hasCacheKeyManager && hasInvalidationManager
    return this.results.cacheOptimization
  }

  validateQueryOptimization() {
    console.log('📊 Validating query optimization...')

    const queryOptimizerPath = path.join(projectRoot, 'src/lib/db/query-optimizer.ts')

    if (!fs.existsSync(queryOptimizerPath)) {
      this.issues.push('Query optimizer missing: src/lib/db/query-optimizer.ts')
      return false
    }

    const content = fs.readFileSync(queryOptimizerPath, 'utf8')

    // Check for query analysis
    const hasQueryAnalysis = content.includes('analyzeQuery') && content.includes('EXPLAIN')

    // Check for index recommendations
    const hasIndexRecommendations = content.includes('generateIndexRecommendations')

    // Check for performance metrics
    const hasPerformanceMetrics = content.includes('QueryMetrics')

    if (!hasQueryAnalysis) {
      this.issues.push('Query analysis functionality missing')
    }

    if (!hasIndexRecommendations) {
      this.issues.push('Index recommendation system missing')
    }

    this.results.queryOptimization =
      hasQueryAnalysis && hasIndexRecommendations && hasPerformanceMetrics
    return this.results.queryOptimization
  }

  validateBundleConfig() {
    console.log('📦 Validating bundle configuration...')

    const nextConfigPath = path.join(projectRoot, 'next.config.js')

    if (!fs.existsSync(nextConfigPath)) {
      this.issues.push('Next.js config missing')
      return false
    }

    const content = fs.readFileSync(nextConfigPath, 'utf8')

    // Check for optimized chunk splitting
    const hasChunkSplitting = content.includes('splitChunks') && content.includes('cacheGroups')

    // Check for performance hints
    const hasPerformanceHints = content.includes('performance') && content.includes('maxAssetSize')

    // Check for image optimization
    const hasImageOptimization = content.includes('images') && content.includes('formats')

    if (!hasChunkSplitting) {
      this.issues.push('Optimized chunk splitting not configured')
    }

    if (!hasPerformanceHints) {
      this.issues.push('Performance hints not configured')
    }

    this.results.bundleConfig = hasChunkSplitting && hasPerformanceHints && hasImageOptimization
    return this.results.bundleConfig
  }

  validatePerformanceDashboard() {
    console.log('📈 Validating performance dashboard...')

    const dashboardPath = path.join(
      projectRoot,
      'src/components/monitoring/performance-dashboard.tsx'
    )
    const pagePath = path.join(projectRoot, 'src/app/performance/page.tsx')

    if (!fs.existsSync(dashboardPath)) {
      this.issues.push(
        'Performance dashboard missing: src/components/monitoring/performance-dashboard.tsx'
      )
      return false
    }

    if (!fs.existsSync(pagePath)) {
      this.issues.push('Performance page missing: src/app/performance/page.tsx')
      return false
    }

    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8')

    // Check for metrics tracking
    const hasMetricsTracking = dashboardContent.includes('PerformanceMetrics')

    // Check for optimization status
    const hasOptimizationStatus = dashboardContent.includes('OptimizationStatus')

    // Check for performance scoring
    const hasPerformanceScoring = dashboardContent.includes('calculateOverallScore')

    this.results.performanceDashboard =
      hasMetricsTracking && hasOptimizationStatus && hasPerformanceScoring
    return this.results.performanceDashboard
  }

  generateReport() {
    console.log('\n🚀 OPTIMIZATION VALIDATION REPORT')
    console.log('==================================\n')

    const validations = [
      { name: 'Icon Optimization', status: this.results.iconOptimization },
      { name: 'Motion Optimization', status: this.results.motionOptimization },
      { name: 'Cache Optimization', status: this.results.cacheOptimization },
      { name: 'Query Optimization', status: this.results.queryOptimization },
      { name: 'Bundle Configuration', status: this.results.bundleConfig },
      { name: 'Performance Dashboard', status: this.results.performanceDashboard },
    ]

    let passedCount = 0

    validations.forEach(validation => {
      const status = validation.status ? '✅ PASS' : '❌ FAIL'
      console.log(`${validation.name}: ${status}`)
      if (validation.status) passedCount++
    })

    console.log(`\nValidation Score: ${passedCount}/${validations.length}`)

    if (this.issues.length > 0) {
      console.log('\n🚨 ISSUES FOUND:')
      this.issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`)
      })
    } else {
      console.log('\n🎉 All optimizations validated successfully!')
    }

    const overallStatus = passedCount === validations.length ? 'PASS' : 'FAIL'
    console.log(`\nOverall Status: ${overallStatus}`)

    return overallStatus === 'PASS'
  }

  async run() {
    console.log('🔍 Starting optimization validation...\n')

    try {
      this.validateIconOptimization()
      this.validateMotionOptimization()
      this.validateCacheOptimization()
      this.validateQueryOptimization()
      this.validateBundleConfig()
      this.validatePerformanceDashboard()

      const success = this.generateReport()

      if (success) {
        console.log('\n✅ All performance optimizations are properly implemented!')
        process.exit(0)
      } else {
        console.log('\n❌ Some optimizations need attention. Check the issues above.')
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Error during validation:', error)
      process.exit(1)
    }
  }
}

// Run the validator
const validator = new OptimizationValidator()
validator.run()
