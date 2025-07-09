#!/usr/bin/env node

/**
 * Bundle Size Analysis and Optimization Script
 *
 * Analyzes the impact of new dependencies (Octokit, WebAuthn, NextAuth, etc.)
 * on bundle size and provides optimization recommendations.
 *
 * This addresses PR review requirements for bundle size impact assessment.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

// Color utilities for console output
const _colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

const log = {
  info: msg => console.log(`ℹ️ ${msg}`),
  success: msg => console.log(`✅ ${msg}`),
  warning: msg => console.log(`⚠️ ${msg}`),
  error: msg => console.error(`❌ ${msg}`),
  section: msg => console.log(`\n📊 ${msg}\n${'='.repeat(50)}`),
}

class BundleSizeAnalyzer {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      dependencies: {},
      bundles: {},
      recommendations: [],
      summary: {},
    }

    // Critical dependencies introduced in PR #7
    this.criticalDependencies = [
      '@octokit/rest',
      '@simplewebauthn/server',
      'next-auth',
      '@auth/prisma-adapter',
      'resend',
      'react-email',
      'msw',
      'vitest',
      '@testing-library/react',
      'docker',
    ]
  }

  /**
   * Run comprehensive bundle size analysis
   */
  async runAnalysis() {
    try {
      log.section('🔍 Bundle Size Analysis Starting...')

      await this.analyzePackageJSON()
      await this.analyzeDependencySizes()
      await this.generateNextJSBundleReport()
      await this.calculateBundleImpact()
      await this.generateOptimizationRecommendations()
      await this.generateReport()

      log.section('📊 Bundle Size Analysis Complete!')
      this.printSummary()

      return this.results
    } catch (error) {
      log.error(`Bundle analysis failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Analyze package.json for dependency information
   */
  async analyzePackageJSON() {
    log.info('📦 Analyzing package.json dependencies...')

    const packagePath = join(PROJECT_ROOT, 'package.json')
    if (!existsSync(packagePath)) {
      throw new Error('package.json not found')
    }

    const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'))
    const allDeps = {
      ...packageJSON.dependencies,
      ...packageJSON.devDependencies,
    }

    this.results.dependencies.total = Object.keys(allDeps).length
    this.results.dependencies.production = Object.keys(packageJSON.dependencies || {}).length
    this.results.dependencies.development = Object.keys(packageJSON.devDependencies || {}).length

    // Analyze critical dependencies
    this.results.dependencies.critical = []
    for (const dep of this.criticalDependencies) {
      if (allDeps[dep]) {
        this.results.dependencies.critical.push({
          name: dep,
          version: allDeps[dep],
          type: packageJSON.dependencies?.[dep] ? 'production' : 'development',
        })
      }
    }

    log.success(`Found ${this.results.dependencies.total} total dependencies`)
    log.success(`${this.results.dependencies.critical.length} critical dependencies from PR #7`)
  }

  /**
   * Analyze individual dependency sizes using npm pack
   */
  async analyzeDependencySizes() {
    log.info('📏 Analyzing dependency sizes...')

    const dependencySizes = {}

    for (const dep of this.results.dependencies.critical) {
      try {
        log.info(`  Analyzing ${dep.name}...`)

        // Get package size info using npm pack --dry-run
        const packOutput = execSync(`npm pack ${dep.name} --dry-run --json`, {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        const packInfo = JSON.parse(packOutput)[0]

        dependencySizes[dep.name] = {
          version: dep.version,
          type: dep.type,
          packageSize: packInfo.size || 0,
          unpackedSize: packInfo.unpackedSize || 0,
          fileCount: packInfo.fileCount || 0,
          bundled: packInfo.bundled || [],
        }
      } catch (error) {
        log.warning(`Could not analyze ${dep.name}: ${error.message}`)
        dependencySizes[dep.name] = {
          version: dep.version,
          type: dep.type,
          error: error.message,
        }
      }
    }

    this.results.dependencies.sizes = dependencySizes
    log.success('Dependency size analysis complete')
  }

  /**
   * Generate Next.js bundle report using next build
   */
  async generateNextJSBundleReport() {
    log.info('🏗️  Generating Next.js bundle report...')

    try {
      // First, ensure dependencies are installed
      log.info('Installing dependencies...')
      execSync('pnpm install', { cwd: PROJECT_ROOT, stdio: 'inherit' })

      // Generate production build with bundle analysis
      log.info('Building Next.js application...')
      const buildOutput = execSync('pnpm build', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Parse build output for bundle information
      this.results.bundles.buildOutput = buildOutput
      this.results.bundles.buildSuccess = true

      // Check for .next/analyze directory or bundle analyzer output
      const analyzeDir = join(PROJECT_ROOT, '.next', 'analyze')
      if (existsSync(analyzeDir)) {
        log.success('Bundle analyzer data found')
        this.results.bundles.analyzerAvailable = true
      }

      log.success('Next.js bundle analysis complete')
    } catch (error) {
      log.warning(`Next.js build failed: ${error.message}`)
      this.results.bundles.buildSuccess = false
      this.results.bundles.buildError = error.message

      // Continue analysis even if build fails
      log.info('Continuing analysis without build data...')
    }
  }

  /**
   * Calculate bundle impact of new dependencies
   */
  async calculateBundleImpact() {
    log.info('📈 Calculating bundle impact...')

    const impact = {
      totalDependencySize: 0,
      criticalDependencySize: 0,
      largestDependencies: [],
      riskFactors: [],
    }

    // Calculate total size impact
    for (const [name, info] of Object.entries(this.results.dependencies.sizes)) {
      if (info.unpackedSize) {
        impact.totalDependencySize += info.unpackedSize

        if (info.type === 'production') {
          impact.criticalDependencySize += info.unpackedSize
        }

        impact.largestDependencies.push({
          name,
          size: info.unpackedSize,
          type: info.type,
        })
      }
    }

    // Sort by size descending
    impact.largestDependencies.sort((a, b) => b.size - a.size)
    impact.largestDependencies = impact.largestDependencies.slice(0, 10)

    // Identify risk factors
    if (impact.criticalDependencySize > 5 * 1024 * 1024) {
      // 5MB
      impact.riskFactors.push('Large production bundle size (>5MB)')
    }

    if (impact.largestDependencies[0]?.size > 2 * 1024 * 1024) {
      // 2MB
      impact.riskFactors.push(`Single large dependency: ${impact.largestDependencies[0].name}`)
    }

    if (this.results.dependencies.critical.length > 10) {
      impact.riskFactors.push('High number of new dependencies')
    }

    this.results.bundles.impact = impact

    log.success(`Bundle impact calculated: ${this.formatSize(impact.totalDependencySize)} total`)
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations() {
    log.info('💡 Generating optimization recommendations...')

    const recommendations = []
    const impact = this.results.bundles.impact

    // Bundle size recommendations
    if (impact.criticalDependencySize > 3 * 1024 * 1024) {
      recommendations.push({
        type: 'bundle-optimization',
        priority: 'high',
        title: 'Implement dynamic imports for large dependencies',
        description: 'Use Next.js dynamic imports to load large libraries only when needed',
        implementation: 'Convert large dependencies to dynamic imports using next/dynamic',
        impact: 'Could reduce initial bundle size by 30-50%',
      })
    }

    // Dependency-specific recommendations
    for (const dep of impact.largestDependencies.slice(0, 3)) {
      if (dep.size > 1024 * 1024) {
        // 1MB
        recommendations.push({
          type: 'dependency-optimization',
          priority: 'medium',
          title: `Optimize ${dep.name} usage`,
          description: `${dep.name} is ${this.formatSize(dep.size)} - consider tree shaking or alternatives`,
          implementation: `Review ${dep.name} imports and use specific imports instead of full library`,
          impact: `Could reduce bundle size by ${this.formatSize(dep.size * 0.3)}`,
        })
      }
    }

    // Development dependency recommendations
    const devDeps = this.results.dependencies.critical.filter(d => d.type === 'development')
    if (devDeps.length > 5) {
      recommendations.push({
        type: 'dev-optimization',
        priority: 'low',
        title: 'Audit development dependencies',
        description: 'Review development dependencies for unused packages',
        implementation: 'Use tools like depcheck to identify unused dependencies',
        impact: 'Faster install times and reduced node_modules size',
      })
    }

    // Security recommendations
    recommendations.push({
      type: 'security',
      priority: 'high',
      title: 'Regular dependency security audits',
      description: 'Implement automated security scanning for new dependencies',
      implementation: 'Add GitHub Actions workflow for dependency vulnerability scanning',
      impact: 'Improved security posture and compliance',
    })

    // Performance recommendations
    recommendations.push({
      type: 'performance',
      priority: 'medium',
      title: 'Bundle size monitoring',
      description: 'Set up automated bundle size tracking and alerts',
      implementation: 'Add bundle analyzer to CI/CD pipeline with size thresholds',
      impact: 'Prevent bundle size regressions in future PRs',
    })

    this.results.recommendations = recommendations
    log.success(`Generated ${recommendations.length} optimization recommendations`)
  }

  /**
   * Generate comprehensive report
   */
  async generateReport() {
    log.info('📄 Generating bundle analysis report...')

    const reportPath = join(PROJECT_ROOT, 'bundle-analysis-report.json')
    const markdownPath = join(PROJECT_ROOT, 'BUNDLE_ANALYSIS.md')

    // Write JSON report
    writeFileSync(reportPath, JSON.stringify(this.results, null, 2))

    // Generate markdown report
    const markdown = this.generateMarkdownReport()
    writeFileSync(markdownPath, markdown)

    log.success('Reports generated:')
    log.success(`  JSON: ${reportPath}`)
    log.success(`  Markdown: ${markdownPath}`)
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport() {
    const { dependencies, bundles, recommendations } = this.results

    return `# Bundle Size Analysis Report

Generated: ${this.results.timestamp}

## Summary

- **Total Dependencies**: ${dependencies.total}
- **Critical Dependencies**: ${dependencies.critical.length}
- **Total Size Impact**: ${this.formatSize(bundles.impact?.totalDependencySize || 0)}
- **Production Bundle Impact**: ${this.formatSize(bundles.impact?.criticalDependencySize || 0)}

## Critical Dependencies (PR #7)

${dependencies.critical.map(dep => `- **${dep.name}** (${dep.version}) - ${dep.type}`).join('\n')}

## Largest Dependencies

${
  bundles.impact?.largestDependencies
    ?.slice(0, 5)
    .map((dep, i) => `${i + 1}. **${dep.name}** - ${this.formatSize(dep.size)} (${dep.type})`)
    .join('\n') || 'No size data available'
}

## Risk Factors

${bundles.impact?.riskFactors?.map(risk => `- ⚠️ ${risk}`).join('\n') || 'No significant risks identified'}

## Optimization Recommendations

${recommendations
  .map(
    (rec, i) => `
### ${i + 1}. ${rec.title} (${rec.priority.toUpperCase()})

**Type**: ${rec.type}
**Description**: ${rec.description}
**Implementation**: ${rec.implementation}
**Expected Impact**: ${rec.impact}
`
  )
  .join('\n')}

## Build Status

${bundles.buildSuccess ? '✅ Next.js build successful' : '❌ Next.js build failed'}
${bundles.buildError ? `\nBuild Error: ${bundles.buildError}` : ''}

---

*Report generated by bundle-size-analysis.js*
`
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const { bundles } = this.results

    if (bundles.impact) {
      if (bundles.impact.riskFactors.length > 0) {
        log.section('Risk Factors')
        bundles.impact.riskFactors.forEach(risk => {
          log.warning(`${risk.factor}: ${risk.description}`)
        })
      }
    }
  }

  /**
   * Format bytes to human readable string
   */
  formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / k ** i).toFixed(1)} ${units[i]}`
  }
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new BundleSizeAnalyzer()

  analyzer
    .runAnalysis()
    .then(() => {
      log.success('Bundle size analysis completed successfully')
      process.exit(0)
    })
    .catch(error => {
      log.error(`Bundle size analysis failed: ${error.message}`)
      process.exit(1)
    })
}

export default BundleSizeAnalyzer
