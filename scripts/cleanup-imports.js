#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to automatically clean up unused imports
 */

// Configuration
const SRC_DIR = './src';
const EXCLUDE_PATTERNS = ['.test.', '.spec.', '.d.ts'];

/**
 * Get all TypeScript/JavaScript files in src directory
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
        // Skip test files
        if (!EXCLUDE_PATTERNS.some(pattern => entry.includes(pattern))) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walkDir(dir);
  return files;
}

/**
 * Check if an import specifier is used in the file content
 */
function isImportUsed(content, specifier, importLine) {
  // Remove the specific import line to avoid false positives
  const contentWithoutThisImport = content.replace(importLine, '');
  
  // Clean specifier name (remove 'as' renaming)
  const cleanSpecifier = specifier.replace(/\s*as\s+\w+/, '').trim();
  
  // Check for usage patterns
  const usagePatterns = [
    new RegExp(`\\b${cleanSpecifier}\\b(?!\\s*[,}])`, 'g'), // Direct usage
    new RegExp(`\\b${cleanSpecifier}\\.`, 'g'), // Property access
    new RegExp(`<${cleanSpecifier}\\b`, 'g'), // JSX component
    new RegExp(`typeof\\s+${cleanSpecifier}\\b`, 'g'), // typeof usage
    new RegExp(`extends\\s+${cleanSpecifier}\\b`, 'g'), // extends usage
    new RegExp(`implements\\s+${cleanSpecifier}\\b`, 'g'), // implements usage
  ];
  
  return usagePatterns.some(pattern => pattern.test(contentWithoutThisImport));
}

/**
 * Clean unused imports from a file
 */
function cleanUnusedImportsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const cleanedLines = [];
  let changes = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is an import line
    const importMatch = line.match(/^import\s*{\s*([^}]+)\s*}\s*from\s*['"`]([^'"`]+)['"`]/);
    
    if (importMatch) {
      const specifiers = importMatch[1].split(',').map(s => s.trim());
      const moduleName = importMatch[2];
      const usedSpecifiers = [];
      
      // Check each specifier
      for (const specifier of specifiers) {
        if (isImportUsed(content, specifier, line)) {
          usedSpecifiers.push(specifier);
        }
      }
      
      if (usedSpecifiers.length === 0) {
        // Remove entire import line
        console.log(`  ❌ Removing unused import: ${line.trim()}`);
        changes++;
        continue;
      } else if (usedSpecifiers.length < specifiers.length) {
        // Keep only used specifiers
        const newImportLine = `import { ${usedSpecifiers.join(', ')} } from '${moduleName}'`;
        console.log(`  🔧 Cleaning import: ${line.trim()}`);
        console.log(`     → ${newImportLine}`);
        cleanedLines.push(newImportLine);
        changes++;
        continue;
      }
    }
    
    // Check for default or namespace imports
    const defaultImportMatch = line.match(/^import\s+(\w+)\s*from\s*['"`]([^'"`]+)['"`]/);
    const namespaceImportMatch = line.match(/^import\s*\*\s*as\s+(\w+)\s*from\s*['"`]([^'"`]+)['"`]/);
    
    if (defaultImportMatch || namespaceImportMatch) {
      const importedName = defaultImportMatch ? defaultImportMatch[1] : namespaceImportMatch[1];
      
      if (!isImportUsed(content, importedName, line)) {
        console.log(`  ❌ Removing unused import: ${line.trim()}`);
        changes++;
        continue;
      }
    }
    
    cleanedLines.push(line);
  }
  
  if (changes > 0) {
    const cleanedContent = cleanedLines.join('\n');
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');
    console.log(`  ✅ ${changes} import(s) cleaned\n`);
  }
  
  return changes;
}

/**
 * Remove consecutive empty lines and clean up formatting
 */
function cleanFormatting(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Remove multiple consecutive empty lines (keep max 1)
  const cleanedContent = content
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\n+/, '') // Remove leading newlines
    .replace(/\n+$/, '\n'); // Ensure single trailing newline
  
  if (content !== cleanedContent) {
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');
    return true;
  }
  
  return false;
}

/**
 * Main cleanup function
 */
function main() {
  console.log('🧹 Cleaning Up Unused Imports\n');
  console.log('==============================\n');
  
  const sourceFiles = getSourceFiles(SRC_DIR);
  let totalChanges = 0;
  let filesModified = 0;
  
  console.log(`📁 Processing ${sourceFiles.length} source files...\n`);
  
  for (const filePath of sourceFiles) {
    try {
      console.log(`🔍 Analyzing ${filePath}`);
      
      const changes = cleanUnusedImportsFromFile(filePath);
      const formatCleaned = cleanFormatting(filePath);
      
      if (changes > 0 || formatCleaned) {
        totalChanges += changes;
        filesModified++;
      } else {
        console.log(`  ✅ No unused imports found\n`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log('📊 Cleanup Summary\n');
  console.log('==================');
  console.log(`Files processed: ${sourceFiles.length}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Total changes: ${totalChanges}`);
  
  if (totalChanges > 0) {
    console.log('\n🎉 Import cleanup completed successfully!');
    console.log('\n⚠️  Please run your linter and tests to ensure nothing was broken:');
    console.log('   pnpm lint:fix');
    console.log('   pnpm format');
    console.log('   pnpm type-check');
  } else {
    console.log('\n✨ No unused imports found - your code is already clean!');
  }
}

// Run the cleanup
main();