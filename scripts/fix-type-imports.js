#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to fix missing type imports across the codebase
 */

// Common type imports that need to be added
const typeImportFixes = [
  {
    pattern: /NextRequest/,
    import: "import type { NextRequest } from 'next/server'",
    check: /import.*NextRequest.*from ['"]next\/server['"]/
  },
  {
    pattern: /ReactNode/,
    import: "import type { ReactNode } from 'react'",
    check: /import.*ReactNode.*from ['"]react['"]/
  },
  {
    pattern: /FormEvent/,
    import: "import type { FormEvent } from 'react'",
    check: /import.*FormEvent.*from ['"]react['"]/
  },
  {
    pattern: /KeyboardEvent(?!<)/,
    import: "import type { KeyboardEvent } from 'react'",
    check: /import.*KeyboardEvent.*from ['"]react['"]/
  },
  {
    pattern: /MouseEvent(?!<)/,
    import: "import type { MouseEvent } from 'react'",
    check: /import.*MouseEvent.*from ['"]react['"]/
  },
  {
    pattern: /VariantProps/,
    import: "import type { VariantProps } from 'class-variance-authority'",
    check: /import.*VariantProps.*from ['"]class-variance-authority['"]/
  },
  {
    pattern: /ButtonHTMLAttributes/,
    import: "import type { ButtonHTMLAttributes } from 'react'",
    check: /import.*ButtonHTMLAttributes.*from ['"]react['"]/
  },
  {
    pattern: /InputHTMLAttributes/,
    import: "import type { InputHTMLAttributes } from 'react'",
    check: /import.*InputHTMLAttributes.*from ['"]react['"]/
  },
  {
    pattern: /HTMLAttributes/,
    import: "import type { HTMLAttributes } from 'react'",
    check: /import.*HTMLAttributes.*from ['"]react['"]/
  },
  {
    pattern: /ComponentType/,
    import: "import type { ComponentType } from 'react'",
    check: /import.*ComponentType.*from ['"]react['"]/
  },
  {
    pattern: /NeonQueryFunction/,
    import: "import type { NeonQueryFunction } from '@neondatabase/serverless'",
    check: /import.*NeonQueryFunction.*from ['"]@neondatabase\/serverless['"]/
  }
];

/**
 * Get all TypeScript/JavaScript files
 */
function getSourceFiles(dir) {
  const files = [];
  
  function walkDir(currentDir) {
    const entries = fs.readdirSync(currentDir);
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        files.push(fullPath);
      }
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Fix type imports in a file
 */
function fixTypeImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modifiedContent = content;
  let changes = 0;
  
  for (const fix of typeImportFixes) {
    // Check if the type is used in the file
    if (fix.pattern.test(content)) {
      // Check if the import is already present
      if (!fix.check.test(content)) {
        // Find the best place to insert the import
        const lines = modifiedContent.split('\n');
        let insertIndex = 0;
        
        // Find the last import statement
        for (let i = 0; i < lines.length; i++) {
          if (/^import\s/.test(lines[i].trim())) {
            insertIndex = i + 1;
          }
        }
        
        // Insert the new import
        lines.splice(insertIndex, 0, fix.import);
        modifiedContent = lines.join('\n');
        changes++;
        
        console.log(`  ✅ Added: ${fix.import}`);
      }
    }
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, modifiedContent, 'utf-8');
    console.log(`  📝 ${changes} type import(s) added\n`);
  }
  
  return changes;
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Fixing Type Imports\n');
  console.log('======================\n');
  
  const sourceFiles = getSourceFiles('./src');
  let totalChanges = 0;
  let filesModified = 0;
  
  console.log(`📁 Processing ${sourceFiles.length} source files...\n`);
  
  for (const filePath of sourceFiles) {
    try {
      console.log(`🔍 Analyzing ${filePath}`);
      
      const changes = fixTypeImportsInFile(filePath);
      
      if (changes > 0) {
        totalChanges += changes;
        filesModified++;
      } else {
        console.log(`  ✅ No missing type imports found\n`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log('📊 Fix Summary\n');
  console.log('==============');
  console.log(`Files processed: ${sourceFiles.length}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Total changes: ${totalChanges}`);
  
  if (totalChanges > 0) {
    console.log('\n🎉 Type import fixes completed successfully!');
    console.log('\n⚠️  Please run type checking to verify:');
    console.log('   pnpm type-check');
  } else {
    console.log('\n✨ No missing type imports found!');
  }
}

// Run the fix
main();