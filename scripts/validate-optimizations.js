#!/usr/bin/env node

/**
 * Optimization Validation Script
 * Validates that performance optimizations are properly implemented
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

class OptimizationValidator {
  constructor() {
    this.results = {
      iconOptimization: false,
      motionOptimization: false,
      bundleAnalyzer: false,
      dynamicImports: false,
      modularizeImports: false,
      cacheOptimization: false,
      performanceDashboard: false,
    }
    this.issues = []
    this.improvements = []
  }

  validateIconOptimization() {
    const iconIndexPath = path.join(projectRoot, 'src/components/icons/index.tsx')

    if (!fs.existsSync(iconIndexPath)) {
      this.issues.push('Icon optimization file missing: src/components/icons/index.tsx')
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
    } else {
      this.improvements.push('✅ Icon tree-shaking implemented')
    }

    if (!hasLazyImports) {
      this.issues.push('Lazy icon loading not implemented')
    } else {
      this.improvements.push('✅ Lazy icon loading implemented')
    }

    this.results.iconOptimization = hasTreeShakenExports && hasLazyImports
    return this.results.iconOptimization
  }

  validateMotionOptimization() {
    const motionIndexPath = path.join(projectRoot, 'src/components/motion/index.tsx')

    if (!fs.existsSync(motionIndexPath)) {
      this.issues.push('Motion optimization file missing: src/components/motion/index.tsx')
      return false
    }

    const content = fs.readFileSync(motionIndexPath, 'utf8')

    // Check for lazy loading
    const hasLazyLoading = content.includes('lazy(') && content.includes('framer-motion')

    // Check for SSR safety
    const hasSSRSafety = content.includes("typeof window === 'undefined'")

    // Check for proper exports
    const hasProperExports =
      content.includes('export const MotionDiv') && content.includes('export const AnimatePresence')

    if (!hasLazyLoading) {
      this.issues.push('Motion components lazy loading not implemented')
    } else {
      this.improvements.push('✅ Framer Motion lazy loading implemented')
    }

    if (!hasSSRSafety) {
      this.issues.push('Motion components SSR safety not implemented')
    } else {
      this.improvements.push('✅ Motion components SSR-safe')
    }

    if (!hasProperExports) {
      this.issues.push('Motion components exports not properly structured')
    } else {
      this.improvements.push('✅ Motion components properly exported')
    }

    this.results.motionOptimization = hasLazyLoading && hasSSRSafety && hasProperExports
    return this.results.motionOptimization
  }

  validateBundleAnalyzer() {
    const packageJsonPath = path.join(projectRoot, 'package.json')
    const nextConfigPath = path.join(projectRoot, 'next.config.js')

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const nextConfig = fs.readFileSync(nextConfigPath, 'utf8')

      // Check for bundle analyzer dependency
      const hasBundleAnalyzer = packageJson.devDependencies?.['@next/bundle-analyzer']

      // Check for bundle analyzer scripts
      const hasAnalyzeScript = packageJson.scripts?.analyze

      // Check for bundle analyzer configuration
      const hasConfiguration =
        nextConfig.includes('withBundleAnalyzer') &&
        nextConfig.includes('bundleAnalyzer(nextConfig)')

      if (!hasBundleAnalyzer) {
        this.issues.push('@next/bundle-analyzer not installed')
      } else {
        this.improvements.push('✅ Bundle analyzer dependency installed')
      }

      if (!hasAnalyzeScript) {
        this.issues.push('Bundle analyzer script not configured')
      } else {
        this.improvements.push('✅ Bundle analyzer scripts configured')
      }

      if (!hasConfiguration) {
        this.issues.push('Bundle analyzer not configured in next.config.js')
      } else {
        this.improvements.push('✅ Bundle analyzer configured in Next.js')
      }

      this.results.bundleAnalyzer = hasBundleAnalyzer && hasAnalyzeScript && hasConfiguration
      return this.results.bundleAnalyzer
    } catch (error) {
      this.issues.push(`Bundle analyzer validation failed: ${error.message}`)
      return false
    }
  }

  validateDynamicImports() {
    const srcFiles = this.getAllSourceFiles()
    let dynamicImportsFound = 0
    let rechartsDynamicImport = false

    for (const file of srcFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8')

        // Check for Next.js dynamic imports
        if (content.includes("import('") || content.includes('dynamic(')) {
          dynamicImportsFound++
        }

        // Check for recharts dynamic import optimization
        if (
          file.includes('real-time-dashboard') &&
          content.includes('dynamic(') &&
          content.includes('recharts')
        ) {
          rechartsDynamicImport = true
        }
      } catch (_error) {
        // Ignore import errors for optional dependencies
      }
    }

    if (dynamicImportsFound === 0) {
      this.issues.push('No dynamic imports found - missing bundle optimization')
    } else {
      this.improvements.push(`✅ ${dynamicImportsFound} dynamic imports implemented`)
    }

    if (!rechartsDynamicImport) {
      this.issues.push('Recharts not dynamically imported in dashboard')
    } else {
      this.improvements.push('✅ Recharts dynamically imported for better performance')
    }

    this.results.dynamicImports = dynamicImportsFound > 0 && rechartsDynamicImport
    return this.results.dynamicImports
  }

  validateModularizeImports() {
    const nextConfigPath = path.join(projectRoot, 'next.config.js')

    try {
      const content = fs.readFileSync(nextConfigPath, 'utf8')

      // Check for modularizeImports configuration
      const hasModularizeImports = content.includes('modularizeImports')
      const hasLucideOptimization = content.includes("'lucide-react'")
      const hasRadixOptimization = content.includes("'@radix-ui/react-**'")

      if (!hasModularizeImports) {
        this.issues.push('modularizeImports not configured in next.config.js')
      } else {
        this.improvements.push('✅ modularizeImports configured')
      }

      if (!hasLucideOptimization) {
        this.issues.push('Lucide React import optimization not configured')
      } else {
        this.improvements.push('✅ Lucide React imports optimized')
      }

      if (!hasRadixOptimization) {
        this.issues.push('Radix UI import optimization not configured')
      } else {
        this.improvements.push('✅ Radix UI imports optimized')
      }

      this.results.modularizeImports = hasModularizeImports && hasLucideOptimization
      return this.results.modularizeImports
    } catch (error) {
      this.issues.push(`modularizeImports validation failed: ${error.message}`)
      return false
    }
  }

  validateUsageOptimization() {
    const srcFiles = this.getAllSourceFiles()
    let optimizedImports = 0
    let totalIconImports = 0

    for (const file of srcFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8')

        // Count imports from our optimized icon barrel
        if (content.includes("from '@/components/icons'")) {
          optimizedImports++
        }

        // Count direct lucide-react imports (should be minimal)
        if (content.includes("from 'lucide-react'")) {
          totalIconImports++
        }
      } catch (_error) {
        // Ignore import errors for optional dependencies
      }
    }

    const optimizationRatio =
      totalIconImports > 0 ? optimizedImports / (optimizedImports + totalIconImports) : 1

    if (optimizationRatio > 0.8) {
      this.improvements.push(`✅ ${Math.round(optimizationRatio * 100)}% of icon imports optimized`)
    } else {
      this.issues.push(`Only ${Math.round(optimizationRatio * 100)}% of icon imports optimized`)
    }

    return optimizationRatio > 0.8
  }

  getAllSourceFiles() {
    const srcDir = path.join(projectRoot, 'src')
    const files = []

    const walkDir = dir => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          if (entry.isDirectory()) {
            walkDir(fullPath)
          } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            files.push(fullPath)
          }
        }
      } catch (_error) {
        // Skip directories we can't read
      }
    }

    if (fs.existsSync(srcDir)) {
      walkDir(srcDir)
    }

    return files
  }

  generateReport() {
    console.log('\n🔍 BUNDLE OPTIMIZATION VALIDATION REPORT\n')

    // Overall score
    const totalChecks = Object.keys(this.results).length
    const passedChecks = Object.values(this.results).filter(Boolean).length
    const score = Math.round((passedChecks / totalChecks) * 100)

    console.log(
      `📊 Overall Score: ${score}% (${passedChecks}/${totalChecks} optimizations implemented)\n`
    )

    // Improvements
    if (this.improvements.length > 0) {
      console.log('✅ IMPLEMENTED OPTIMIZATIONS:')
      this.improvements.forEach(improvement => console.log(`   ${improvement}`))
      console.log('')
    }

    // Issues
    if (this.issues.length > 0) {
      console.log('❌ OPTIMIZATION ISSUES:')
      this.issues.forEach(issue => console.log(`   ❌ ${issue}`))
      console.log('')
    }

    // Detailed results
    console.log('📋 DETAILED RESULTS:')
    Object.entries(this.results).forEach(([check, passed]) => {
      const status = passed ? '✅' : '❌'
      const formattedCheck = check.replace(/([A-Z])/g, ' $1').toLowerCase()
      console.log(`   ${status} ${formattedCheck}`)
    })

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:')
    if (score >= 90) {
      console.log('   🎉 Excellent! Your bundle optimizations are well implemented.')
    } else if (score >= 70) {
      console.log('   👍 Good progress! A few more optimizations will improve performance.')
    } else {
      console.log('   ⚠️ More optimizations needed for optimal bundle performance.')
    }

    // Next steps
    if (this.issues.length > 0) {
      console.log('\n🚀 NEXT STEPS:')
      console.log('   1. Run `pnpm analyze` to see detailed bundle analysis')
      console.log('   2. Address the issues listed above')
      console.log('   3. Run this validator again to verify improvements')
    }

    console.log('\n📈 PERFORMANCE COMMANDS:')
    console.log('   • pnpm analyze - View bundle analyzer')
    console.log('   • pnpm perf:bundle - Run custom bundle analysis')
    console.log('   • pnpm perf:report - Full performance report')

    return score
  }

  async run() {
    try {
      console.log('🔍 Validating bundle optimizations...\n')

      // Run all validations
      this.validateIconOptimization()
      this.validateMotionOptimization()
      this.validateBundleAnalyzer()
      this.validateDynamicImports()
      this.validateModularizeImports()
      this.validateUsageOptimization()

      // Generate and display report
      const score = this.generateReport()

      // Exit with appropriate code
      process.exit(score >= 70 ? 0 : 1)
    } catch (error) {
      console.error('❌ Validation failed:', error.message)
      process.exit(1)
    }
  }
}

// Run the validator
const validator = new OptimizationValidator()
validator.run()
