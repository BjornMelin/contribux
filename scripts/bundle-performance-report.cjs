#!/usr/bin/env node

/**
 * Bundle Performance Assessment Report
 * Analyzes build output and provides optimization insights
 */

const fs = require('fs')
const path = require('path')

// Configuration
const BUNDLE_TARGETS = {
  maxAssetSize: 500, // KB
  maxEntrypointSize: 1000, // KB
  targetMainChunk: 1000, // KB
}

// Performance metrics
const OPTIMIZATION_CHECKS = {
  lazyLoading: {
    description: 'Dynamic imports for code splitting',
    files: [
      'src/components/motion/index.tsx',
      'src/components/monitoring/real-time-dashboard.tsx',
    ],
    pattern: /dynamic\(.*import\(/,
    weight: 20,
  },
  treeShaking: {
    description: 'Optimized icon imports',
    files: ['src/components/icons/index.tsx'],
    pattern: /export.*from 'lucide-react'/,
    weight: 15,
  },
  bundleAnalyzer: {
    description: 'Bundle analyzer integration',
    files: ['next.config.js'],
    pattern: /withBundleAnalyzer/,
    weight: 10,
  },
  modularImports: {
    description: 'Module optimization configuration',
    files: ['next.config.js'],
    pattern: /modularizeImports/,
    weight: 15,
  },
  chunkSplitting: {
    description: 'Enhanced chunk splitting configuration',
    files: ['next.config.js'],
    pattern: /splitChunks.*cacheGroups/s,
    weight: 20,
  },
  motionOptimization: {
    description: 'Framer Motion lazy loading',
    files: ['src/components/motion/index.tsx'],
    pattern: /React\.lazy.*framer-motion/,
    weight: 20,
  },
}

/**
 * Analyze optimization implementation
 */
function analyzeOptimizations() {
  console.log('🔍 Analyzing bundle optimizations...\n')
  
  let totalScore = 0
  let maxScore = 0
  const results = []

  for (const [key, check] of Object.entries(OPTIMIZATION_CHECKS)) {
    maxScore += check.weight
    let implemented = false
    let details = []

    for (const filePath of check.files) {
      const fullPath = path.join(process.cwd(), filePath)
      
      if (!fs.existsSync(fullPath)) {
        details.push(`❌ File not found: ${filePath}`)
        continue
      }

      const content = fs.readFileSync(fullPath, 'utf8')
      if (check.pattern.test(content)) {
        implemented = true
        details.push(`✅ Pattern found in ${filePath}`)
      } else {
        details.push(`❌ Pattern missing in ${filePath}`)
      }
    }

    if (implemented) {
      totalScore += check.weight
    }

    results.push({
      name: key,
      description: check.description,
      implemented,
      weight: check.weight,
      details,
    })
  }

  return { results, totalScore, maxScore }
}

/**
 * Check for common bundle size issues
 */
function checkCommonIssues() {
  console.log('🔍 Checking for common bundle issues...\n')
  
  const issues = []
  const srcDir = path.join(process.cwd(), 'src')

  // Check for direct framer-motion imports
  const frameworkImportPattern = /import.*from ['"]framer-motion['"]/
  
  // Check for direct lucide-react imports (outside of icons/index.tsx)
  const iconImportPattern = /import.*from ['"]lucide-react['"]/

  function scanDirectory(dir, parentDir = '') {
    const items = fs.readdirSync(dir)
    
    for (const item of items) {
      const fullPath = path.join(dir, item)
      const relativePath = path.join(parentDir, item)
      
      if (fs.statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath, relativePath)
      } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf8')
        
        // Skip the icons index file for lucide-react imports
        if (!relativePath.includes('icons/index.tsx') && iconImportPattern.test(content)) {
          issues.push({
            type: 'direct-icon-import',
            file: relativePath,
            suggestion: 'Use @/components/icons instead of direct lucide-react imports',
          })
        }
        
        // Skip motion files for framer-motion imports
        if (!relativePath.includes('motion/') && frameworkImportPattern.test(content)) {
          issues.push({
            type: 'direct-motion-import',
            file: relativePath,
            suggestion: 'Use @/components/motion instead of direct framer-motion imports',
          })
        }
      }
    }
  }

  try {
    scanDirectory(srcDir)
  } catch (error) {
    console.error('Error scanning directory:', error.message)
  }

  return issues
}

/**
 * Analyze Next.js build output
 */
function analyzeBuildOutput() {
  const nextDir = path.join(process.cwd(), '.next')
  const buildManifest = path.join(nextDir, 'build-manifest.json')
  
  if (!fs.existsSync(buildManifest)) {
    return {
      status: 'no-build',
      message: 'No build output found. Run `pnpm build` first.',
    }
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(buildManifest, 'utf8'))
    
    return {
      status: 'found',
      pages: Object.keys(manifest.pages || {}),
      staticFiles: Object.keys(manifest.staticFiles || {}),
    }
  } catch (error) {
    return {
      status: 'error',
      message: `Error reading build manifest: ${error.message}`,
    }
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(issues, optimizationResults) {
  const recommendations = []

  // Issues-based recommendations
  const issueTypes = issues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1
    return acc
  }, {})

  if (issueTypes['direct-icon-import']) {
    recommendations.push({
      priority: 'high',
      category: 'Tree Shaking',
      action: `Fix ${issueTypes['direct-icon-import']} direct icon imports`,
      impact: 'Reduces bundle size by better tree-shaking',
    })
  }

  if (issueTypes['direct-motion-import']) {
    recommendations.push({
      priority: 'high',
      category: 'Code Splitting',
      action: `Fix ${issueTypes['direct-motion-import']} direct motion imports`,
      impact: 'Enables lazy loading of animation library',
    })
  }

  // Optimization-based recommendations
  const unimplementedOptimizations = optimizationResults.results.filter(r => !r.implemented)
  
  for (const opt of unimplementedOptimizations) {
    recommendations.push({
      priority: opt.weight > 15 ? 'high' : 'medium',
      category: 'Bundle Optimization',
      action: `Implement ${opt.description}`,
      impact: `Worth ${opt.weight} optimization points`,
    })
  }

  return recommendations
}

/**
 * Main report function
 */
function generateReport() {
  console.log('📊 BUNDLE PERFORMANCE REPORT')
  console.log('=' .repeat(50))
  console.log('')

  // Optimization analysis
  const optimizationResults = analyzeOptimizations()
  const score = Math.round((optimizationResults.totalScore / optimizationResults.maxScore) * 100)
  
  console.log(`📈 Optimization Score: ${score}% (${optimizationResults.totalScore}/${optimizationResults.maxScore} points)`)
  console.log('')

  // Issues analysis
  const issues = checkCommonIssues()
  
  if (issues.length === 0) {
    console.log('✅ No common bundle issues found!')
  } else {
    console.log(`⚠️  Found ${issues.length} potential issues:`)
    issues.forEach(issue => {
      console.log(`   • ${issue.file}: ${issue.suggestion}`)
    })
  }
  console.log('')

  // Build output analysis
  const buildAnalysis = analyzeBuildOutput()
  console.log('🏗️  Build Analysis:')
  if (buildAnalysis.status === 'found') {
    console.log(`   ✅ Build found with ${buildAnalysis.pages.length} pages`)
  } else {
    console.log(`   ❌ ${buildAnalysis.message}`)
  }
  console.log('')

  // Recommendations
  const recommendations = generateRecommendations(issues, optimizationResults)
  
  if (recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS:')
    recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`)
      console.log(`      Impact: ${rec.impact}`)
    })
  } else {
    console.log('🎉 All optimizations look good!')
  }
  
  console.log('')
  console.log('📋 Next Steps:')
  console.log('   1. Run `pnpm analyze` to view detailed bundle composition')
  console.log('   2. Run `pnpm build` to generate fresh build statistics')
  console.log('   3. Address high-priority recommendations above')
  console.log('')
}

// Run the report
if (require.main === module) {
  generateReport()
}

module.exports = { generateReport, analyzeOptimizations, checkCommonIssues }