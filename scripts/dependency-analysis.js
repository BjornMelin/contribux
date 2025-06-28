#!/usr/bin/env node

/**
 * Dependency Size Analysis
 * Analyzes the size of production dependencies
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('📦 Analyzing dependency sizes...\n')

// Get package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
const dependencies = packageJson.dependencies || {}

// Function to get package size (approximate)
function getPackageSize(packageName) {
  try {
    const packagePath = path.join(process.cwd(), 'node_modules', packageName)
    if (!fs.existsSync(packagePath)) {
      return { size: 0, files: 0 }
    }
    
    let totalSize = 0
    let fileCount = 0
    
    function walkDir(dir) {
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

// Format bytes
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toFixed(2)} ${units[i]}`
}

// Analyze dependencies
const results = []
for (const [name, version] of Object.entries(dependencies)) {
  const { size, files } = getPackageSize(name)
  results.push({ name, version, size, files })
}

// Sort by size
results.sort((a, b) => b.size - a.size)

// Display results
console.log('Top 10 Largest Dependencies:')
console.log('============================')
console.log('Package Name'.padEnd(40) + 'Version'.padEnd(15) + 'Size'.padEnd(12) + 'Files')
console.log('-'.repeat(80))

results.slice(0, 10).forEach(pkg => {
  console.log(
    pkg.name.padEnd(40) +
    pkg.version.padEnd(15) +
    formatBytes(pkg.size).padEnd(12) +
    pkg.files
  )
})

// Calculate total size
const totalSize = results.reduce((sum, pkg) => sum + pkg.size, 0)
console.log('\n' + '-'.repeat(80))
console.log('Total dependencies size:'.padEnd(55) + formatBytes(totalSize))

// Memory optimization recommendations
console.log('\n💡 Size Optimization Recommendations:')
console.log('------------------------------------')

const largePackages = results.filter(pkg => pkg.size > 1024 * 1024) // > 1MB
if (largePackages.length > 0) {
  console.log('\n⚠️  Large packages detected (>1MB):')
  largePackages.forEach(pkg => {
    console.log(`   - ${pkg.name} (${formatBytes(pkg.size)})`)
    
    // Specific recommendations
    if (pkg.name === 'next-pwa') {
      console.log('     → Consider lazy loading PWA functionality')
    }
    if (pkg.name.includes('auth')) {
      console.log('     → Implement dynamic imports for auth modules')
    }
    if (pkg.name.includes('octokit')) {
      console.log('     → Use dynamic imports for GitHub API client')
    }
  })
}

// Check for duplicate packages
console.log('\n🔍 Checking for potential duplicates...')
try {
  const dedupCheck = execSync('pnpm dedupe --check', { encoding: 'utf8' })
  if (dedupCheck.includes('No duplicates found')) {
    console.log('✅ No duplicate packages found')
  } else {
    console.log('⚠️  Potential duplicates found. Run "pnpm dedupe" to optimize')
  }
} catch (error) {
  // Command might fail if there are duplicates
  console.log('⚠️  Run "pnpm dedupe" to check for and remove duplicate packages')
}

// Bundle optimization tips
console.log('\n📋 Bundle Optimization Checklist:')
console.log('---------------------------------')
console.log('✅ Use dynamic imports for heavy components')
console.log('✅ Enable tree shaking in next.config.js')
console.log('✅ Use modularizeImports for icon libraries')
console.log('✅ Mark server-only packages in serverComponentsExternalPackages')
console.log('✅ Use "pnpm analyze" to visualize bundle composition')
console.log('✅ Consider replacing large dependencies with lighter alternatives')

console.log('\n🎯 Next steps:')
console.log('   1. Run "pnpm build && pnpm analyze" to visualize bundle')
console.log('   2. Implement dynamic imports for large dependencies')
console.log('   3. Review and remove unused dependencies')
console.log('   4. Consider code splitting strategies\n')