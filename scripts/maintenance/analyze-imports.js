#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

/**
 * Script to analyze unused imports and dependencies
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
  const imports = []

  // Match various import patterns
  const importPatterns = [
    // import { a, b } from 'module'
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import * as name from 'module'
    /import\s*\*\s*as\s+(\w+)\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import name from 'module'
    /import\s+(\w+)\s*from\s*['"`]([^'"`]+)['"`]/g,
    // import 'module' (side-effect only)
    /import\s*['"`]([^'"`]+)['"`]/g,
  ]

  for (const pattern of importPatterns) {
    let match = pattern.exec(content)
    while (match !== null) {
      if (match[2]) {
        // Named or default imports
        const specifiers = match[1] ? match[1].split(',').map(s => s.trim()) : []
        imports.push({
          module: match[2],
          specifiers,
          type: 'module',
        })
      } else {
        // Side-effect import
        imports.push({
          module: match[1],
          specifiers: [],
          type: 'side-effect',
        })
      }
      match = pattern.exec(content)
    }
  }

  return imports
}

/**
 * Check if an import specifier is used in the file
 */
function isImportUsed(filePath, _moduleName, specifier) {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Remove import statements to avoid false positives
  const contentWithoutImports = content.replace(/import[^;]+;/g, '')

  // Check for usage patterns
  const usagePatterns = [
    new RegExp(`\\b${specifier}\\b`, 'g'), // Direct usage
    new RegExp(`\\b${specifier}\\.`, 'g'), // Property access
    new RegExp(`<${specifier}\\b`, 'g'), // JSX component
    new RegExp(`typeof\\s+${specifier}\\b`, 'g'), // typeof usage
  ]

  return usagePatterns.some(pattern => pattern.test(contentWithoutImports))
}

/**
 * Check if any specifiers in an import are unused
 */
function checkImportSpecifiers(filePath, importData) {
  const unusedSpecifiers = []

  for (const specifier of importData.specifiers) {
    const cleanSpecifier = specifier.replace(/\s*as\s+\w+/, '').trim()

    if (!isImportUsed(filePath, importData.module, cleanSpecifier)) {
      unusedSpecifiers.push(cleanSpecifier)
    }
  }

  return unusedSpecifiers
}

/**
 * Process imports from a single file
 */
function processFileImports(filePath) {
  const imports = extractImports(filePath)
  const fileUnusedImports = []

  for (const importData of imports) {
    // Skip side-effect imports
    if (importData.type === 'side-effect') continue

    const unusedSpecifiers = checkImportSpecifiers(filePath, importData)

    if (unusedSpecifiers.length > 0) {
      fileUnusedImports.push({
        file: filePath,
        module: importData.module,
        unusedSpecifiers,
      })
    }
  }

  return fileUnusedImports
}

/**
 * Find unused imports in all source files
 */
function findUnusedImports() {
  const sourceFiles = getSourceFiles(SRC_DIR)
  const unusedImports = []

  for (const filePath of sourceFiles) {
    try {
      const fileUnusedImports = processFileImports(filePath)
      unusedImports.push(...fileUnusedImports)
    } catch (_error) {
      // Ignore errors during file processing
    }
  }

  return unusedImports
}

/**
 * Get list of known build tools that don't appear in imports
 */
function getKnownBuildTools() {
  return [
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
  ]
}

/**
 * Extract root package name from module path
 */
function extractPackageName(moduleName) {
  // Extract root package name
  if (moduleName.startsWith('@')) {
    // Scoped package: @scope/package
    const parts = moduleName.split('/')
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`
    }
  } else if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
    // Regular package: package or package/submodule
    return moduleName.split('/')[0]
  }
  return null
}

/**
 * Collect all used dependencies from source files
 */
function collectUsedDependencies() {
  const sourceFiles = getSourceFiles(SRC_DIR)
  const usedDependencies = new Set()

  for (const filePath of sourceFiles) {
    try {
      const imports = extractImports(filePath)

      for (const importData of imports) {
        const packageName = extractPackageName(importData.module)
        if (packageName) {
          usedDependencies.add(packageName)
        }
      }
    } catch (_error) {
      // Ignore errors during file processing
    }
  }

  return usedDependencies
}

/**
 * Check package.json for unused dependencies
 */
function findUnusedDependencies() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'))
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  const usedDependencies = collectUsedDependencies()
  const buildTools = getKnownBuildTools()
  const unusedDependencies = []

  for (const [depName, version] of Object.entries(dependencies)) {
    if (!usedDependencies.has(depName) && !buildTools.includes(depName)) {
      unusedDependencies.push({ name: depName, version })
    }
  }

  return unusedDependencies
}

/**
 * Check for circular dependencies
 */
function findCircularDependencies() {
  try {
    // Use madge to detect circular dependencies if available
    const result = execSync('npx madge --circular --format amd src/', { encoding: 'utf-8' })

    if (result.trim()) {
      return result.split('\n').filter(line => line.trim())
    }

    return []
  } catch (_error) {
    return []
  }
}

/**
 * Display unused imports results
 */
function displayUnusedImports(unusedImports) {
  if (unusedImports.length > 0) {
    for (const _item of unusedImports) {
      // Process unused import
    }
  } else {
    // No unused imports found
  }
}

/**
 * Display unused dependencies results
 */
function displayUnusedDependencies(unusedDependencies) {
  if (unusedDependencies.length > 0) {
    for (const _dep of unusedDependencies) {
      // Process unused dependency
    }
  } else {
    // No unused dependencies found
  }
}

/**
 * Display circular dependencies results
 */
function displayCircularDependencies(circularDeps) {
  if (circularDeps.length > 0) {
    for (const _dep of circularDeps) {
      // Process circular dependency
    }
  } else {
    // No circular dependencies found
  }
}

/**
 * Main analysis function
 */
function main() {
  // 1. Find unused imports
  const unusedImports = findUnusedImports()
  displayUnusedImports(unusedImports)

  // 2. Find unused dependencies
  const unusedDependencies = findUnusedDependencies()
  displayUnusedDependencies(unusedDependencies)

  // 3. Check for circular dependencies
  const circularDeps = findCircularDependencies()
  displayCircularDependencies(circularDeps)

  // Summary
  const totalIssues = unusedImports.length + unusedDependencies.length + circularDeps.length

  if (totalIssues === 0) {
    // No issues found - analysis complete
  } else {
    // Issues found - review needed
  }
}

// Run the analysis
main()
