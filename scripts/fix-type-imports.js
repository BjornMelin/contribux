#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

/**
 * Script to fix missing type imports across the codebase
 */

// Common type imports that need to be added
const typeImportFixes = [
  {
    pattern: /NextRequest/,
    import: "import type { NextRequest } from 'next/server'",
    check: /import.*NextRequest.*from ['"]next\/server['"]/,
  },
  {
    pattern: /ReactNode/,
    import: "import type { ReactNode } from 'react'",
    check: /import.*ReactNode.*from ['"]react['"]/,
  },
  {
    pattern: /FormEvent/,
    import: "import type { FormEvent } from 'react'",
    check: /import.*FormEvent.*from ['"]react['"]/,
  },
  {
    pattern: /KeyboardEvent(?!<)/,
    import: "import type { KeyboardEvent } from 'react'",
    check: /import.*KeyboardEvent.*from ['"]react['"]/,
  },
  {
    pattern: /MouseEvent(?!<)/,
    import: "import type { MouseEvent } from 'react'",
    check: /import.*MouseEvent.*from ['"]react['"]/,
  },
  {
    pattern: /VariantProps/,
    import: "import type { VariantProps } from 'class-variance-authority'",
    check: /import.*VariantProps.*from ['"]class-variance-authority['"]/,
  },
  {
    pattern: /ButtonHTMLAttributes/,
    import: "import type { ButtonHTMLAttributes } from 'react'",
    check: /import.*ButtonHTMLAttributes.*from ['"]react['"]/,
  },
  {
    pattern: /InputHTMLAttributes/,
    import: "import type { InputHTMLAttributes } from 'react'",
    check: /import.*InputHTMLAttributes.*from ['"]react['"]/,
  },
  {
    pattern: /HTMLAttributes/,
    import: "import type { HTMLAttributes } from 'react'",
    check: /import.*HTMLAttributes.*from ['"]react['"]/,
  },
  {
    pattern: /ComponentType/,
    import: "import type { ComponentType } from 'react'",
    check: /import.*ComponentType.*from ['"]react['"]/,
  },
  {
    pattern: /NeonQueryFunction/,
    import: "import type { NeonQueryFunction } from '@neondatabase/serverless'",
    check: /import.*NeonQueryFunction.*from ['"]@neondatabase\/serverless['"]/,
  },
]

/**
 * Get all TypeScript/JavaScript files
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
        files.push(fullPath)
      }
    }
  }

  walkDir(dir)
  return files
}

/**
 * Check if type is used and import is missing
 */
function needsImport(fix, content) {
  return fix.pattern.test(content) && !fix.check.test(content)
}

/**
 * Find insertion point for new import
 */
function findImportInsertionPoint(lines) {
  let insertIndex = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i].trim())) {
      insertIndex = i + 1
    }
  }
  return insertIndex
}

/**
 * Apply import fix to content
 */
function applyImportFix(fix, content) {
  const lines = content.split('\n')
  const insertIndex = findImportInsertionPoint(lines)
  lines.splice(insertIndex, 0, fix.import)
  return lines.join('\n')
}

/**
 * Fix type imports in a file
 */
function fixTypeImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  let modifiedContent = content
  let changes = 0

  for (const fix of typeImportFixes) {
    if (needsImport(fix, content)) {
      modifiedContent = applyImportFix(fix, modifiedContent)
      changes++
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, modifiedContent, 'utf-8')
  }

  return changes
}

/**
 * Main function
 */
function main() {
  const sourceFiles = getSourceFiles('./src')
  let totalChanges = 0
  let _filesModified = 0

  for (const filePath of sourceFiles) {
    try {
      const changes = fixTypeImportsInFile(filePath)

      if (changes > 0) {
        totalChanges += changes
        _filesModified++
      }
    } catch (_error) {
      // Ignore errors during file processing
    }
  }

  if (totalChanges > 0) {
    // Changes were made - files have been processed
  } else {
    // No changes needed - all type imports are already optimized
  }
}

// Run the fix
main()
