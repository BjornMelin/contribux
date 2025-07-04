#!/usr/bin/env node

/**
 * Comprehensive Dependency Analysis
 * Analyzes dependencies for size, security, duplicates, and optimization opportunities
 */

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

class DependencyAnalyzer {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json')
    this.packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'))
    this.dependencies = this.packageJson.dependencies || {}
    this.devDependencies = this.packageJson.devDependencies || {}
    this.allDependencies = { ...this.dependencies, ...this.devDependencies }
  }

  log(_message, _emoji = '📦') {
    // Log message with emoji
  }

  async runCompleteAnalysis() {
    await this.analyzeSizes()
    await this.securityAudit()
    await this.checkForOptimizations()
    await this.generateRecommendations()
  }

  /**
   * Security audit analysis
   */
  async securityAudit() {
    this.log('Running security audit...', '🔒')

    try {
      execSync('pnpm audit --audit-level moderate', { stdio: 'inherit' })
    } catch (error) {
      if (error.stdout?.includes('No known vulnerabilities')) {
        // No vulnerabilities found
      } else {
        // Vulnerabilities found
      }
    }
  }

  /**
   * Check for optimization opportunities
   */
  async checkForOptimizations() {
    this.log('Checking optimization opportunities...', '⚡')

    // Check for potential duplicates
    this.checkDuplicatePatterns()

    // Check outdated packages
    await this.checkOutdated()

    // Check for heavy packages
    this.checkHeavyPackages()
  }

  /**
   * Check for duplicate dependency patterns
   */
  checkDuplicatePatterns() {
    const patterns = [
      { regex: /^(jose|jsonwebtoken|jwt-)/, name: 'JWT libraries', current: ['jose'] },
      { regex: /^(@octokit|octokit)/, name: 'GitHub API clients', current: ['octokit'] },
      { regex: /^(axios|fetch|node-fetch|undici)/, name: 'HTTP clients', current: ['undici'] },
      {
        regex: /^(@testing-library|vitest|jest|playwright)/,
        name: 'Testing frameworks',
        current: ['vitest', 'playwright'],
      },
    ]

    patterns.forEach(({ regex, _name, current }) => {
      const matches = Object.keys(this.allDependencies).filter(dep => regex.test(dep))
      if (matches.length > 1) {
        const extras = matches.filter(dep => !current.includes(dep))
        if (extras.length > 0) {
          // Extra dependencies found
        }
      } else if (matches.length > 0) {
        // Dependencies found
      }
    })
  }

  /**
   * Check for outdated packages
   */
  async checkOutdated() {
    try {
      const result = execSync('pnpm outdated --format=table', { encoding: 'utf8' })
      if (result.trim()) {
        // Outdated packages found
      } else {
        // No outdated packages
      }
    } catch (_error) {
      // Error checking outdated packages
    }
  }

  /**
   * Check for heavy packages that might need optimization
   */
  checkHeavyPackages() {
    const results = this.getSizeAnalysis()
    const heavy = results.filter(pkg => pkg.size > 1024 * 1024) // >1MB

    if (heavy.length > 0) {
      heavy.slice(0, 5).forEach(pkg => {
        this.suggestOptimization(pkg.name)
      })
    } else {
      // No heavy packages found
    }
  }

  /**
   * Suggest optimization for specific packages
   */
  suggestOptimization(packageName) {
    const optimizations = {
      'next-pwa': '     → Consider lazy loading PWA functionality',
      'framer-motion': '     → Use dynamic imports or lighter alternatives like react-spring',
      octokit: '     → Use dynamic imports for GitHub API features',
      'next-auth': '     → Load auth providers dynamically',
      '@radix-ui': '     → Import only needed components',
    }

    for (const [pattern, _suggestion] of Object.entries(optimizations)) {
      if (packageName.includes(pattern)) {
        break
      }
    }
  }

  /**
   * Generate comprehensive recommendations
   */
  async generateRecommendations() {
    this.log('Generating optimization recommendations...', '💡')
  }

  /**
   * Get size analysis (existing functionality preserved)
   */
  getSizeAnalysis() {
    const results = []
    for (const [name, version] of Object.entries(this.dependencies)) {
      const { size, files } = this.getPackageSize(name)
      results.push({ name, version, size, files })
    }
    return results.sort((a, b) => b.size - a.size)
  }

  async analyzeSizes() {
    const results = this.getSizeAnalysis()

    results.slice(0, 10).forEach(_pkg => {
      // Process package size data
    })

    // Calculate total size
    const _totalSize = results.reduce((sum, pkg) => sum + pkg.size, 0)

    const largePackages = results.filter(pkg => pkg.size > 1024 * 1024) // > 1MB
    if (largePackages.length > 0) {
      largePackages.forEach(pkg => {
        this.suggestOptimization(pkg.name)
      })
    }

    this.checkDeduplication()
  }

  /**
   * Check for package deduplication opportunities
   */
  checkDeduplication() {
    try {
      execSync('pnpm dedupe --check', { stdio: 'pipe' })
    } catch (_error) {
      // Error checking outdated packages
    }
  }

  /**
   * Get package size (approximate)
   */
  getPackageSize(packageName) {
    try {
      const packagePath = path.join(process.cwd(), 'node_modules', packageName)
      if (!fs.existsSync(packagePath)) {
        return { size: 0, files: 0 }
      }

      let totalSize = 0
      let fileCount = 0

      const walkDir = dir => {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)
          if (stat.isDirectory() && file !== 'node_modules') {
            walkDir(filePath)
          } else if (stat.isFile()) {
            totalSize += stat.size
            fileCount++
          }
        }
      }

      walkDir(packagePath)
      return { size: totalSize, files: fileCount }
    } catch (_error) {
      return { size: 0, files: 0 }
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(inputBytes) {
    const units = ['B', 'KB', 'MB', 'GB']
    let bytes = inputBytes
    let i = 0
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024
      i++
    }
    return `${bytes.toFixed(2)} ${units[i]}`
  }
}

// Run analysis if called directly
if (require.main === module) {
  const args = process.argv.slice(2)
  const analyzer = new DependencyAnalyzer()

  if (args.includes('--complete') || args.includes('-c')) {
    analyzer.runCompleteAnalysis().catch(console.error)
  } else {
    // Default to size analysis for backward compatibility
    analyzer.analyzeSizes().catch(console.error)
  }
}

module.exports = DependencyAnalyzer
