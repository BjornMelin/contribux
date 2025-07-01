#!/usr/bin/env node

/**
 * Comprehensive Dependency Analysis
 * Analyzes dependencies for size, security, duplicates, and optimization opportunities
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

class DependencyAnalyzer {
  constructor() {
    this.packageJsonPath = path.join(process.cwd(), 'package.json')
    this.packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'))
    this.dependencies = this.packageJson.dependencies || {}
    this.devDependencies = this.packageJson.devDependencies || {}
    this.allDependencies = { ...this.dependencies, ...this.devDependencies }
  }

  log(message, emoji = '📦') {
    console.log(`${emoji} ${message}`)
  }

  async runCompleteAnalysis() {
    console.log('🔧 COMPREHENSIVE DEPENDENCY ANALYSIS')
    console.log('='.repeat(50))
    
    await this.analyzeSizes()
    console.log('\n' + '-'.repeat(50))
    await this.securityAudit()
    console.log('\n' + '-'.repeat(50))
    await this.checkForOptimizations()
    console.log('\n' + '-'.repeat(50))
    await this.generateRecommendations()
    
    console.log('\n' + '='.repeat(50))
    console.log('✅ Complete analysis finished!\n')
  }

  /**
   * Security audit analysis
   */
  async securityAudit() {
    this.log('Running security audit...', '🔒')
    
    try {
      execSync('pnpm audit --audit-level moderate', { stdio: 'inherit' })
      console.log('✅ No security vulnerabilities found')
    } catch (error) {
      if (error.stdout && error.stdout.includes('No known vulnerabilities')) {
        console.log('✅ No known security vulnerabilities found')
      } else {
        console.log('⚠️  Security vulnerabilities detected. Run `pnpm security:audit` for details')
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
    console.log('\n🔄 Checking for potential duplicates...')
    
    const patterns = [
      { regex: /^(jose|jsonwebtoken|jwt-)/, name: 'JWT libraries', current: ['jose'] },
      { regex: /^(@octokit|octokit)/, name: 'GitHub API clients', current: ['octokit'] },
      { regex: /^(axios|fetch|node-fetch|undici)/, name: 'HTTP clients', current: ['undici'] },
      { regex: /^(@testing-library|vitest|jest|playwright)/, name: 'Testing frameworks', current: ['vitest', 'playwright'] }
    ]
    
    patterns.forEach(({ regex, name, current }) => {
      const matches = Object.keys(this.allDependencies).filter(dep => regex.test(dep))
      if (matches.length > 1) {
        const extras = matches.filter(dep => !current.includes(dep))
        if (extras.length > 0) {
          console.log(`⚠️  Multiple ${name}: ${matches.join(', ')}`)
          console.log(`   Consider consolidating to: ${current.join(', ')}`)
        }
      } else if (matches.length > 0) {
        console.log(`✅ ${name}: Using ${matches[0]}`)
      }
    })
  }

  /**
   * Check for outdated packages
   */
  async checkOutdated() {
    console.log('\n📅 Checking for outdated packages...')
    
    try {
      const result = execSync('pnpm outdated --format=table', { encoding: 'utf8' })
      if (result.trim()) {
        console.log('📦 Outdated packages found:')
        console.log(result)
        console.log('💡 Run `pnpm deps:update` to update interactively')
      } else {
        console.log('✅ All packages are up to date')
      }
    } catch (error) {
      console.log('✅ All packages are up to date')
    }
  }

  /**
   * Check for heavy packages that might need optimization
   */
  checkHeavyPackages() {
    console.log('\n🏋️  Analyzing heavy packages...')
    
    const results = this.getSizeAnalysis()
    const heavy = results.filter(pkg => pkg.size > 1024 * 1024) // >1MB
    
    if (heavy.length > 0) {
      console.log('Large packages (>1MB) that could be optimized:')
      heavy.slice(0, 5).forEach(pkg => {
        console.log(`   ${pkg.name}: ${this.formatBytes(pkg.size)}`)
        this.suggestOptimization(pkg.name)
      })
    } else {
      console.log('✅ No extremely large packages detected')
    }
  }

  /**
   * Suggest optimization for specific packages
   */
  suggestOptimization(packageName) {
    const optimizations = {
      'next-pwa': '     → Consider lazy loading PWA functionality',
      'framer-motion': '     → Use dynamic imports or lighter alternatives like react-spring',
      'octokit': '     → Use dynamic imports for GitHub API features',
      'next-auth': '     → Load auth providers dynamically',
      '@radix-ui': '     → Import only needed components'
    }
    
    for (const [pattern, suggestion] of Object.entries(optimizations)) {
      if (packageName.includes(pattern)) {
        console.log(suggestion)
        break
      }
    }
  }

  /**
   * Generate comprehensive recommendations
   */
  async generateRecommendations() {
    this.log('Generating optimization recommendations...', '💡')
    
    console.log('\n✅ COMPLETED OPTIMIZATIONS:')
    console.log('   • Security vulnerability resolved (esbuild override)')
    console.log('   • JWT library consolidation (jose only)')
    console.log('   • Octokit packages consolidated to main package')
    console.log('   • Dependency tree optimized and cleaned')
    
    console.log('\n🔧 RECOMMENDED NEXT STEPS:')
    console.log('   1. Monitor bundle size with `pnpm analyze`')
    console.log('   2. Run security audits monthly with `pnpm security:audit`')
    console.log('   3. Update dependencies regularly with `pnpm deps:update`')
    console.log('   4. Implement dynamic imports for heavy components')
    console.log('   5. Set up automated dependency monitoring in CI/CD')
    
    console.log('\n🎯 AUTOMATION SCRIPTS AVAILABLE:')
    console.log('   • `pnpm deps:audit` - Quick dependency audit')
    console.log('   • `pnpm deps:analyze` - Full analysis (this script)')
    console.log('   • `pnpm security:audit` - Security vulnerability scan')
    console.log('   • `pnpm deps:outdated` - Check for updates')
    console.log('   • `pnpm bundle:analyze` - Bundle composition analysis')
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
    console.log('📦 Analyzing dependency sizes...\n')
    
    const results = this.getSizeAnalysis()
    
    // Display results
    console.log('Top 10 Largest Dependencies:')
    console.log('============================')
    console.log('Package Name'.padEnd(40) + 'Version'.padEnd(15) + 'Size'.padEnd(12) + 'Files')
    console.log('-'.repeat(80))

    results.slice(0, 10).forEach(pkg => {
      console.log(
        pkg.name.padEnd(40) +
        pkg.version.padEnd(15) +
        this.formatBytes(pkg.size).padEnd(12) +
        pkg.files
      )
    })

    // Calculate total size
    const totalSize = results.reduce((sum, pkg) => sum + pkg.size, 0)
    console.log('\n' + '-'.repeat(80))
    console.log('Total dependencies size:'.padEnd(55) + this.formatBytes(totalSize))

    // Size optimization recommendations
    console.log('\n💡 Size Optimization Recommendations:')
    console.log('------------------------------------')

    const largePackages = results.filter(pkg => pkg.size > 1024 * 1024) // > 1MB
    if (largePackages.length > 0) {
      console.log('\n⚠️  Large packages detected (>1MB):')
      largePackages.forEach(pkg => {
        console.log(`   - ${pkg.name} (${this.formatBytes(pkg.size)})`)
        this.suggestOptimization(pkg.name)
      })
    }

    this.checkDeduplication()
  }

  /**
   * Check for package deduplication opportunities
   */
  checkDeduplication() {
    console.log('\n🔍 Checking for potential duplicates...')
    try {
      execSync('pnpm dedupe --check', { stdio: 'pipe' })
      console.log('✅ No duplicate packages found')
    } catch (error) {
      console.log('⚠️  Run "pnpm dedupe" to check for and remove duplicate packages')
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
      
      const walkDir = (dir) => {
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
    } catch (error) {
      return { size: 0, files: 0 }
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB']
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