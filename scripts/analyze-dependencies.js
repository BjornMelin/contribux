#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

/**
 * Script to analyze and report on dependency usage
 */

// Configuration
const SRC_DIR = './src'
const EXCLUDE_PATTERNS = ['.test.', '.spec.', '.d.ts']
const PACKAGE_JSON_PATH = './package.json'

/**
 * Get all TypeScript/JavaScript files in src directory
 */
function getSourceFiles(dir) {
  const files = []

  function walkDir(currentDir) {
    const entries = fs.readdirSync(currentDir)

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        walkDir(fullPath)
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        // Skip test files
        if (!EXCLUDE_PATTERNS.some(pattern => entry.includes(pattern))) {
          files.push(fullPath)
        }
      }
    }
  }

  walkDir(dir)
  return files
}

/**
 * Extract imports from a file
 */
function extractImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const imports = new Set()

  // Match various import patterns
  const importPatterns = [
    // import { a, b } from 'module'
    /import\s*{\s*[^}]+\s*}\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import * as name from 'module'
    /import\s*\*\s*as\s+\w+\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import name from 'module'
    /import\s+\w+\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import 'module' (side-effect only)
    /import\s*['"`]([^'"`]+)['"`]/g,
  ]

  for (const pattern of importPatterns) {
    let match = pattern.exec(content)
    while (match !== null) {
      const moduleName = match[1]

      // Only include external modules (not relative paths)
      if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
        imports.add(moduleName)
      }
      match = pattern.exec(content)
    }
  }

  return Array.from(imports)
}

/**
 * Get known build tools and development dependencies
 */
function getKnownBuildTools() {
  return new Set([
    '@biomejs/biome',
    '@vitejs/plugin-react',
    '@vitest/coverage-v8',
    '@vitest/ui',
    'autoprefixer',
    'postcss',
    'tailwindcss',
    'typescript',
    'vitest',
    '@next/bundle-analyzer',
    'cross-env',
    'dotenv',
    'msw',
    'tsx',
    '@testing-library/jest-dom',
    '@testing-library/react',
    '@testing-library/user-event',
    'jsdom',
    'commander',
    'nock',
    'undici',
    'vite-tsconfig-paths',
    '@fast-check/vitest',
    '@peculiar/webcrypto',
    '@tailwindcss/postcss',
    'tw-animate-css',
  ])
}

/**
 * Get known type definition packages
 */
function getKnownTypeDefinitions() {
  return new Set(['@types/node', '@types/pg', '@types/react', '@types/react-dom'])
}

/**
 * Extract root package name from import module name
 */
function extractRootPackageName(moduleName) {
  if (moduleName.startsWith('@')) {
    // Scoped package: @scope/package
    const parts = moduleName.split('/')
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`
    }
  } else {
    // Regular package: package or package/submodule
    return moduleName.split('/')[0]
  }
  return null
}

/**
 * Collect all used modules from source files
 */
function collectUsedModules() {
  const sourceFiles = getSourceFiles(SRC_DIR)
  const usedModules = new Set()

  for (const filePath of sourceFiles) {
    try {
      const imports = extractImports(filePath)

      for (const moduleName of imports) {
        const rootPackage = extractRootPackageName(moduleName)
        if (rootPackage) {
          usedModules.add(rootPackage)
        }
      }
    } catch (_error) {
      // Ignore errors during file processing
    }
  }

  return usedModules
}

/**
 * Categorize dependencies into used, unused, build tools, and type definitions
 */
function categorizeDependencies(dependencies, usedModules) {
  const categories = {
    used: [],
    unused: [],
    buildTools: [],
    typeDefinitions: [],
  }

  const buildTools = getKnownBuildTools()
  const typeDefinitions = getKnownTypeDefinitions()

  for (const [depName, version] of Object.entries(dependencies)) {
    if (usedModules.has(depName)) {
      categories.used.push({ name: depName, version })
    } else if (buildTools.has(depName)) {
      categories.buildTools.push({ name: depName, version })
    } else if (typeDefinitions.has(depName)) {
      categories.typeDefinitions.push({ name: depName, version })
    } else {
      categories.unused.push({ name: depName, version })
    }
  }

  return categories
}

/**
 * Analyze dependency usage
 */
function analyzeDependencyUsage() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'))
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  const usedModules = collectUsedModules()
  const categories = categorizeDependencies(dependencies, usedModules)
  for (const _dep of categories.used.sort((a, b) => a.name.localeCompare(b.name))) {
    // Track used dependency
  }
  for (const _dep of categories.buildTools.sort((a, b) => a.name.localeCompare(b.name))) {
    // Track build tool dependency
  }
  for (const _dep of categories.typeDefinitions.sort((a, b) => a.name.localeCompare(b.name))) {
    // Track type definition dependency
  }

  if (categories.unused.length > 0) {
    for (const _dep of categories.unused.sort((a, b) => a.name.localeCompare(b.name))) {
      // Track unused dependency
    }
  } else {
    // No unused dependencies found
  }

  // Specific analysis for the unused dependencies found
  if (categories.unused.length > 0) {
    const specificAnalysis = {
      '@octokit/types': 'Used for TypeScript types in GitHub API client',
      ioredis: 'Used for Redis connections in rate limiting/caching',
      'next-pwa': 'Used for Progressive Web App features',
      'rate-limiter-flexible': 'Used for rate limiting in middleware',
      'react-dom': 'Required by React for DOM rendering',
    }
    for (const dep of categories.unused) {
      const analysis = specificAnalysis[dep.name]
      if (analysis) {
        // Specific analysis available for this dependency
      } else {
        // No specific analysis for this dependency
      }
    }
  }

  return categories
}

/**
 * Categorize import path by type
 */
function categorizeImportPath(importPath) {
  if (importPath.startsWith('@/')) {
    return 'aliased'
  }
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return 'relative'
  }
  if (importPath.startsWith('/')) {
    return 'absolute'
  }
  return 'external'
}

/**
 * Check if import path is non-optimal (uses relative paths that could be aliased)
 */
function isNonOptimalImport(importPath) {
  return importPath.startsWith('../')
}

/**
 * Process imports from a single file for path analysis
 */
function processFileImportsForPaths(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const importPattern = /import\s+[^'"`]*['"`]([^'"`]+)['"`]/g
  const results = {
    stats: { relative: 0, absolute: 0, external: 0, aliased: 0 },
    nonOptimal: [],
  }

  let match = importPattern.exec(content)
  while (match !== null) {
    const importPath = match[1]
    const category = categorizeImportPath(importPath)

    results.stats[category]++

    if (category === 'relative' && isNonOptimalImport(importPath)) {
      results.nonOptimal.push({
        file: filePath,
        import: importPath,
        line: match[0],
      })
    }

    match = importPattern.exec(content)
  }

  return results
}

/**
 * Display import optimization opportunities
 */
function displayOptimizationOpportunities(nonOptimalImports) {
  if (nonOptimalImports.length > 0) {
    for (const _item of nonOptimalImports.slice(0, 10)) {
      // Process non-optimal import
    }
    if (nonOptimalImports.length > 10) {
      // More than 10 non-optimal imports found
    }
  }
}

/**
 * Check for import path optimization opportunities
 */
function analyzeImportPaths() {
  const sourceFiles = getSourceFiles(SRC_DIR)
  const importStats = {
    relative: 0,
    absolute: 0,
    external: 0,
    aliased: 0,
  }
  const nonOptimalImports = []

  for (const filePath of sourceFiles) {
    try {
      const results = processFileImportsForPaths(filePath)

      // Accumulate stats
      importStats.relative += results.stats.relative
      importStats.absolute += results.stats.absolute
      importStats.external += results.stats.external
      importStats.aliased += results.stats.aliased

      // Collect non-optimal imports
      nonOptimalImports.push(...results.nonOptimal)
    } catch (_error) {
      // Ignore errors during file processing
    }
  }

  displayOptimizationOpportunities(nonOptimalImports)

  return { importStats, nonOptimalImports }
}

/**
 * Main analysis function
 */
function main() {
  const dependencyAnalysis = analyzeDependencyUsage()
  const importAnalysis = analyzeImportPaths()

  if (dependencyAnalysis.unused.length > 0) {
    // Unused dependencies found
  }

  if (importAnalysis.nonOptimalImports.length > 0) {
    // Non-optimal imports found
  }

  const overallScore =
    100 - dependencyAnalysis.unused.length * 5 - importAnalysis.nonOptimalImports.length * 2

  if (overallScore >= 90) {
    // Excellent score
  } else if (overallScore >= 70) {
    // Good score
  } else {
    // Needs improvement
  }
}

// Run the analysis
main()
