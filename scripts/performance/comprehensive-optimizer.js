#!/usr/bin/env node

/**
 * Comprehensive Performance Optimizer
 * Analyzes and optimizes the entire application for maximum performance
 */

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

class ComprehensiveOptimizer {
  constructor() {
    this.results = {
      bundleAnalysis: null,
      dependencyOptimization: null,
      imageOptimization: null,
      cacheOptimization: null,
      databaseOptimization: null,
      memoryOptimization: null,
      recommendations: [],
    }

    this.projectRoot = process.cwd()
    this.packageJson = this.loadPackageJson()
  }

  /**
   * Run comprehensive optimization analysis
   */
  async optimize() {
    try {
      // 1. Bundle Analysis
      await this.analyzeBundleSize()

      // 2. Dependency Optimization
      await this.optimizeDependencies()

      // 3. Image Optimization
      await this.optimizeImages()

      // 4. Cache Strategy Analysis
      await this.analyzeCacheStrategy()

      // 5. Database Optimization
      await this.optimizeDatabase()

      // 6. Memory Optimization
      await this.optimizeMemory()

      // 7. Generate comprehensive report
      this.generateReport()

      // 8. Apply automatic optimizations
      await this.applyOptimizations()
    } catch (_error) {
      process.exit(1)
    }
  }

  /**
   * Analyze bundle size and identify optimization opportunities
   */
  async analyzeBundleSize() {
    try {
      // Generate bundle analyzer report
      process.env.ANALYZE = 'true'
      execSync('npm run build', { stdio: 'pipe' })

      // Check if .next/analyze exists
      const analyzeDir = path.join(this.projectRoot, '.next', 'analyze')
      if (fs.existsSync(analyzeDir)) {
        const clientBundle = this.findFile(analyzeDir, 'client.html')
        const serverBundle = this.findFile(analyzeDir, 'server.html')

        this.results.bundleAnalysis = {
          clientBundleReport: clientBundle,
          serverBundleReport: serverBundle,
          status: 'success',
        }
      }

      // Analyze bundle stats
      const buildManifest = path.join(this.projectRoot, '.next', 'build-manifest.json')
      if (fs.existsSync(buildManifest)) {
        const manifest = JSON.parse(fs.readFileSync(buildManifest, 'utf8'))
        const totalPages = Object.keys(manifest.pages).length
        const sharedFiles = manifest.pages['/_app']?.length || 0

        this.results.bundleAnalysis = {
          ...this.results.bundleAnalysis,
          totalPages,
          sharedFiles,
          codeSpitting: totalPages > sharedFiles ? 'effective' : 'needs_improvement',
        }

        if (totalPages > sharedFiles) {
        } else {
          this.results.recommendations.push('Implement more aggressive code splitting')
        }
      }
    } catch (error) {
      this.results.bundleAnalysis = { status: 'failed', error: error.message }
    }
  }

  /**
   * Optimize dependencies
   */
  async optimizeDependencies() {
    try {
      const dependencies = this.packageJson.dependencies || {}
      const devDependencies = this.packageJson.devDependencies || {}
      const allDeps = { ...dependencies, ...devDependencies }

      // Check for heavy dependencies
      const heavyDeps = this.identifyHeavyDependencies(allDeps)

      // Check for duplicate dependencies
      const duplicates = this.findDuplicateDependencies()

      // Check for unused dependencies
      const unused = await this.findUnusedDependencies()

      this.results.dependencyOptimization = {
        totalDependencies: Object.keys(allDeps).length,
        heavyDependencies: heavyDeps,
        duplicates: duplicates,
        unused: unused,
        recommendations: [],
      }

      if (heavyDeps.length > 0) {
        this.results.dependencyOptimization.recommendations.push(
          'Consider lighter alternatives for heavy dependencies'
        )
      }

      if (duplicates.length > 0) {
        this.results.dependencyOptimization.recommendations.push(
          'Remove duplicate dependencies to reduce bundle size'
        )
      }

      if (unused.length > 0) {
        this.results.dependencyOptimization.recommendations.push(
          'Remove unused dependencies to improve build performance'
        )
      }

      if (heavyDeps.length === 0 && duplicates.length === 0 && unused.length === 0) {
      }
    } catch (error) {
      this.results.dependencyOptimization = { status: 'failed', error: error.message }
    }
  }

  /**
   * Optimize images
   */
  async optimizeImages() {
    try {
      const publicDir = path.join(this.projectRoot, 'public')
      const images = this.findImageFiles(publicDir)

      let totalSize = 0
      let unoptimizedCount = 0
      const largeImages = []

      for (const imagePath of images) {
        const stats = fs.statSync(imagePath)
        totalSize += stats.size

        // Check for large images (>500KB)
        if (stats.size > 500 * 1024) {
          largeImages.push({
            path: path.relative(publicDir, imagePath),
            size: Math.round(stats.size / 1024), // KB
          })
        }

        // Check for unoptimized formats
        const ext = path.extname(imagePath).toLowerCase()
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          unoptimizedCount++
        }
      }

      this.results.imageOptimization = {
        totalImages: images.length,
        totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        largeImages: largeImages,
        unoptimizedCount: unoptimizedCount,
        recommendations: [],
      }

      if (largeImages.length > 0) {
        this.results.imageOptimization.recommendations.push(
          'Optimize large images using Next.js Image component and compression'
        )
      }

      if (unoptimizedCount > 0) {
        this.results.imageOptimization.recommendations.push(
          'Convert images to WebP/AVIF for better compression'
        )
      }

      if (largeImages.length === 0 && unoptimizedCount === 0) {
      }
    } catch (error) {
      this.results.imageOptimization = { status: 'failed', error: error.message }
    }
  }

  /**
   * Analyze cache strategy
   */
  async analyzeCacheStrategy() {
    try {
      // Check for cache implementation
      const cacheFiles = ['src/lib/cache', 'src/lib/redis', 'src/utils/cache']

      let cacheImplemented = false
      let redisConfigured = false
      let memoryCache = false

      for (const cacheDir of cacheFiles) {
        const fullPath = path.join(this.projectRoot, cacheDir)
        if (fs.existsSync(fullPath)) {
          cacheImplemented = true
          break
        }
      }

      // Check for Redis configuration
      if (this.packageJson.dependencies?.ioredis || this.packageJson.dependencies?.redis) {
        redisConfigured = true
      }

      // Check Next.js configuration for caching
      const nextConfigPath = path.join(this.projectRoot, 'next.config.js')
      if (fs.existsSync(nextConfigPath)) {
        const nextConfig = fs.readFileSync(nextConfigPath, 'utf8')
        if (nextConfig.includes('Cache-Control') || nextConfig.includes('maxAge')) {
          memoryCache = true
        }
      }

      this.results.cacheOptimization = {
        cacheImplemented,
        redisConfigured,
        memoryCache,
        recommendations: [],
      }

      if (!cacheImplemented) {
        this.results.cacheOptimization.recommendations.push(
          'Implement caching for frequently accessed data'
        )
      }

      if (!redisConfigured) {
        this.results.cacheOptimization.recommendations.push(
          'Configure Redis for distributed caching'
        )
      }

      if (!memoryCache) {
        this.results.cacheOptimization.recommendations.push(
          'Optimize HTTP cache headers for static assets'
        )
      }

      if (cacheImplemented && redisConfigured && memoryCache) {
      }
    } catch (error) {
      this.results.cacheOptimization = { status: 'failed', error: error.message }
    }
  }

  /**
   * Optimize database configuration
   */
  async optimizeDatabase() {
    try {
      const dbOptimizations = this.analyzeDatabaseOptimizations()

      this.results.databaseOptimization = {
        ...dbOptimizations,
        recommendations: [],
      }

      this.addDatabaseRecommendations(dbOptimizations)

      if (
        dbOptimizations.connectionPooling &&
        dbOptimizations.queryOptimization &&
        dbOptimizations.indexStrategy
      ) {
      }
    } catch (error) {
      this.results.databaseOptimization = { status: 'failed', error: error.message }
    }
  }

  /**
   * Analyze database optimization patterns
   */
  analyzeDatabaseOptimizations() {
    let connectionPooling = false
    let queryOptimization = false
    let indexStrategy = false

    const dbFiles = this.findFiles(path.join(this.projectRoot, 'src'), /db|database/)
    for (const file of dbFiles) {
      const content = fs.readFileSync(file, 'utf8')

      if (content.includes('pool') || content.includes('pooled')) {
        connectionPooling = true
      }
      if (content.includes('explain') || content.includes('query plan')) {
        queryOptimization = true
      }
      if (content.includes('index') || content.includes('btree') || content.includes('gin')) {
        indexStrategy = true
      }
    }

    return { connectionPooling, queryOptimization, indexStrategy }
  }

  /**
   * Add database optimization recommendations
   */
  addDatabaseRecommendations(optimizations) {
    if (!optimizations.connectionPooling) {
      this.results.databaseOptimization.recommendations.push(
        'Implement connection pooling for better database performance'
      )
    }

    if (!optimizations.queryOptimization) {
      this.results.databaseOptimization.recommendations.push(
        'Implement query performance monitoring and optimization'
      )
    }

    if (!optimizations.indexStrategy) {
      this.results.databaseOptimization.recommendations.push(
        'Review and optimize database indexes for query performance'
      )
    }
  }

  /**
   * Optimize memory usage
   */
  async optimizeMemory() {
    try {
      const memoryOptimizations = this.analyzeMemoryOptimizations()

      this.results.memoryOptimization = {
        ...memoryOptimizations,
        recommendations: [],
      }

      this.addMemoryRecommendations(memoryOptimizations)

      if (
        memoryOptimizations.memoization &&
        memoryOptimizations.lazyLoading &&
        !memoryOptimizations.memoryLeaks
      ) {
      }
    } catch (error) {
      this.results.memoryOptimization = { status: 'failed', error: error.message }
    }
  }

  /**
   * Analyze memory optimization patterns
   */
  analyzeMemoryOptimizations() {
    let memoization = false
    let lazyLoading = false
    let memoryLeaks = false

    const srcFiles = this.findFiles(path.join(this.projectRoot, 'src'), /\.(ts|tsx|js|jsx)$/)

    for (const file of srcFiles.slice(0, 50)) {
      // Limit to first 50 files for performance
      const content = fs.readFileSync(file, 'utf8')

      if (this.hasMemoization(content)) {
        memoization = true
      }

      if (this.hasLazyLoading(content)) {
        lazyLoading = true
      }

      if (this.hasMemoryLeaks(content)) {
        memoryLeaks = true
      }
    }

    return { memoization, lazyLoading, memoryLeaks }
  }

  /**
   * Check if content has memoization patterns
   */
  hasMemoization(content) {
    return (
      content.includes('useMemo') || content.includes('useCallback') || content.includes('memo(')
    )
  }

  /**
   * Check if content has lazy loading patterns
   */
  hasLazyLoading(content) {
    return content.includes('lazy(') || content.includes('dynamic(') || content.includes('Suspense')
  }

  /**
   * Check for potential memory leaks
   */
  hasMemoryLeaks(content) {
    return content.includes('setInterval') && !content.includes('clearInterval')
  }

  /**
   * Add memory optimization recommendations
   */
  addMemoryRecommendations(optimizations) {
    if (!optimizations.memoization) {
      this.results.memoryOptimization.recommendations.push(
        'Implement React.memo, useMemo, and useCallback for expensive operations'
      )
    }

    if (!optimizations.lazyLoading) {
      this.results.memoryOptimization.recommendations.push(
        'Implement lazy loading for heavy components and routes'
      )
    }

    if (optimizations.memoryLeaks) {
      this.results.memoryOptimization.recommendations.push(
        'Review timer and event listener cleanup to prevent memory leaks'
      )
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        bundleAnalysis: this.results.bundleAnalysis?.status || 'not_analyzed',
        dependencyOptimization: this.results.dependencyOptimization?.totalDependencies || 0,
        imageOptimization: this.results.imageOptimization?.totalImages || 0,
        cacheStrategy: this.results.cacheOptimization?.cacheImplemented || false,
        databaseOptimization: this.results.databaseOptimization?.connectionPooling || false,
        memoryOptimization: this.results.memoryOptimization?.memoization || false,
      },
      detailed: this.results,
      recommendations: this.compileAllRecommendations(),
    }

    // Save report
    const reportsDir = path.join(this.projectRoot, 'reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    const reportPath = path.join(reportsDir, `performance-optimization-${Date.now()}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    const allRecommendations = this.compileAllRecommendations()
    allRecommendations.forEach((_rec, _index) => {
      // Recommendations are compiled and will be included in the report
    })

    if (allRecommendations.length === 0) {
    }
  }

  /**
   * Apply automatic optimizations
   */
  async applyOptimizations() {
    try {
      // 1. Update package.json scripts if needed
      this.optimizePackageScripts()

      // 2. Create performance optimization config
      this.createPerformanceConfig()

      // 3. Update .gitignore for optimization artifacts
      this.updateGitignore()
    } catch (_error) {}
  }

  /**
   * Helper methods
   */

  loadPackageJson() {
    const packagePath = path.join(this.projectRoot, 'package.json')
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  }

  findFile(dir, filename) {
    try {
      const files = fs.readdirSync(dir)
      return files.find(file => file.includes(filename))
    } catch {
      return null
    }
  }

  findFiles(dir, pattern) {
    const files = []

    function walk(currentDir) {
      try {
        const items = fs.readdirSync(currentDir)
        for (const item of items) {
          const fullPath = path.join(currentDir, item)
          const stats = fs.statSync(fullPath)

          if (stats.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
            walk(fullPath)
          } else if (stats.isFile() && pattern.test(item)) {
            files.push(fullPath)
          }
        }
      } catch {
        // Ignore permission errors
      }
    }

    walk(dir)
    return files
  }

  findImageFiles(dir) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif']
    return this.findFiles(
      dir,
      new RegExp(`\\.(${imageExtensions.map(ext => ext.slice(1)).join('|')})$`, 'i')
    )
  }

  identifyHeavyDependencies(dependencies) {
    const heavyLibraries = [
      'lodash',
      'moment',
      'three',
      'react-big-calendar',
      'recharts',
      'antd',
      '@mui/material',
      'bootstrap',
    ]

    return Object.keys(dependencies).filter(dep =>
      heavyLibraries.some(heavy => dep.includes(heavy))
    )
  }

  findDuplicateDependencies() {
    // Simple duplicate detection based on similar names
    const deps = Object.keys(this.packageJson.dependencies || {})
    const devDeps = Object.keys(this.packageJson.devDependencies || {})

    return deps.filter(dep => devDeps.includes(dep))
  }

  async findUnusedDependencies() {
    // Simple unused dependency detection
    try {
      const srcFiles = this.findFiles(path.join(this.projectRoot, 'src'), /\.(ts|tsx|js|jsx)$/)
      const allContent = srcFiles
        .map(file => {
          try {
            return fs.readFileSync(file, 'utf8')
          } catch {
            return ''
          }
        })
        .join('')

      const dependencies = Object.keys(this.packageJson.dependencies || {})
      return dependencies.filter(dep => !allContent.includes(dep))
    } catch {
      return []
    }
  }

  compileAllRecommendations() {
    const allRecs = []

    Object.values(this.results).forEach(result => {
      if (result?.recommendations) {
        allRecs.push(...result.recommendations)
      }
    })

    allRecs.push(...this.results.recommendations)

    return [...new Set(allRecs)] // Remove duplicates
  }

  optimizePackageScripts() {
    // Add performance scripts if they don't exist
    const performanceScripts = {
      'analyze:bundle': 'cross-env ANALYZE=true next build',
      'performance:test': 'node scripts/performance/benchmark-suite.js',
      'optimize:images': 'echo "Consider implementing image optimization pipeline"',
      'cache:clear': 'node -e "console.log(\'Cache clearing not implemented yet\')"',
    }

    let updated = false
    for (const [script, command] of Object.entries(performanceScripts)) {
      if (!this.packageJson.scripts[script]) {
        this.packageJson.scripts[script] = command
        updated = true
      }
    }

    if (updated) {
      fs.writeFileSync(
        path.join(this.projectRoot, 'package.json'),
        JSON.stringify(this.packageJson, null, 2)
      )
    }
  }

  createPerformanceConfig() {
    const configPath = path.join(this.projectRoot, 'performance.config.js')
    if (!fs.existsSync(configPath)) {
      const config = `
// Performance optimization configuration
module.exports = {
  cache: {
    strategy: 'selective',
    ttl: 300,
    redis: {
      enabled: !!process.env.REDIS_URL,
      url: process.env.REDIS_URL,
    },
  },
  
  database: {
    pooling: true,
    queryOptimization: true,
    slowQueryThreshold: 1000,
  },
  
  bundle: {
    analysis: true,
    chunkSizeWarning: 500, // KB
    assetSizeWarning: 250, // KB
  },
  
  memory: {
    monitoring: true,
    garbageCollection: true,
    leakDetection: true,
  },
}
      `.trim()

      fs.writeFileSync(configPath, config)
    }
  }

  updateGitignore() {
    const gitignorePath = path.join(this.projectRoot, '.gitignore')
    if (fs.existsSync(gitignorePath)) {
      let gitignore = fs.readFileSync(gitignorePath, 'utf8')

      const performanceEntries = [
        '# Performance optimization artifacts',
        'reports/',
        '.next/analyze/',
        'performance-*.json',
      ]

      let updated = false
      for (const entry of performanceEntries) {
        if (!gitignore.includes(entry)) {
          gitignore += `\n${entry}`
          updated = true
        }
      }

      if (updated) {
        fs.writeFileSync(gitignorePath, gitignore)
      }
    }
  }
}

// CLI interface
async function main() {
  const optimizer = new ComprehensiveOptimizer()
  await optimizer.optimize()
}

if (require.main === module) {
  main().catch(_error => {
    process.exit(1)
  })
}

module.exports = { ComprehensiveOptimizer }
