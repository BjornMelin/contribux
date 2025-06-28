#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to analyze unused imports and dependencies
 */

// Configuration
const SRC_DIR = './src';
const EXCLUDE_PATTERNS = ['.test.', '.spec.', '.d.ts'];
const PACKAGE_JSON_PATH = './package.json';

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
 * Extract imports from a file
 */
function extractImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = [];
  
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
  ];
  
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[2]) {
        // Named or default imports
        const specifiers = match[1] ? match[1].split(',').map(s => s.trim()) : [];
        imports.push({
          module: match[2],
          specifiers,
          type: 'module'
        });
      } else {
        // Side-effect import
        imports.push({
          module: match[1],
          specifiers: [],
          type: 'side-effect'
        });
      }
    }
  }
  
  return imports;
}

/**
 * Check if an import specifier is used in the file
 */
function isImportUsed(filePath, moduleName, specifier) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Remove import statements to avoid false positives
  const contentWithoutImports = content.replace(/import[^;]+;/g, '');
  
  // Check for usage patterns
  const usagePatterns = [
    new RegExp(`\\b${specifier}\\b`, 'g'), // Direct usage
    new RegExp(`\\b${specifier}\\.`, 'g'), // Property access
    new RegExp(`<${specifier}\\b`, 'g'), // JSX component
    new RegExp(`typeof\\s+${specifier}\\b`, 'g'), // typeof usage
  ];
  
  return usagePatterns.some(pattern => pattern.test(contentWithoutImports));
}

/**
 * Find unused imports in all source files
 */
function findUnusedImports() {
  const sourceFiles = getSourceFiles(SRC_DIR);
  const unusedImports = [];
  
  console.log(`🔍 Analyzing ${sourceFiles.length} source files for unused imports...\n`);
  
  for (const filePath of sourceFiles) {
    try {
      const imports = extractImports(filePath);
      
      for (const importData of imports) {
        // Skip side-effect imports
        if (importData.type === 'side-effect') continue;
        
        const unusedSpecifiers = [];
        
        for (const specifier of importData.specifiers) {
          const cleanSpecifier = specifier.replace(/\s*as\s+\w+/, '').trim();
          
          if (!isImportUsed(filePath, importData.module, cleanSpecifier)) {
            unusedSpecifiers.push(cleanSpecifier);
          }
        }
        
        if (unusedSpecifiers.length > 0) {
          unusedImports.push({
            file: filePath,
            module: importData.module,
            unusedSpecifiers
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${filePath}:`, error.message);
    }
  }
  
  return unusedImports;
}

/**
 * Check package.json for unused dependencies
 */
function findUnusedDependencies() {
  console.log('🔍 Analyzing dependencies for usage...\n');
  
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  const sourceFiles = getSourceFiles(SRC_DIR);
  const usedDependencies = new Set();
  
  // Collect all imported modules
  for (const filePath of sourceFiles) {
    try {
      const imports = extractImports(filePath);
      
      for (const importData of imports) {
        const moduleName = importData.module;
        
        // Extract root package name
        if (moduleName.startsWith('@')) {
          // Scoped package: @scope/package
          const parts = moduleName.split('/');
          if (parts.length >= 2) {
            usedDependencies.add(`${parts[0]}/${parts[1]}`);
          }
        } else if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
          // Regular package: package or package/submodule
          const rootPackage = moduleName.split('/')[0];
          usedDependencies.add(rootPackage);
        }
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${filePath}:`, error.message);
    }
  }
  
  // Find unused dependencies
  const unusedDependencies = [];
  
  for (const [depName, version] of Object.entries(dependencies)) {
    if (!usedDependencies.has(depName)) {
      // Check if it's a known build/dev tool that might not appear in imports
      const buildTools = [
        '@biomejs/biome', '@vitejs/plugin-react', '@vitest/coverage-v8', '@vitest/ui',
        'autoprefixer', 'postcss', 'tailwindcss', 'typescript', 'vitest',
        '@next/bundle-analyzer', 'cross-env', 'dotenv', 'msw', 'tsx',
        '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event',
        'jsdom', 'commander', 'nock', 'undici', 'vite-tsconfig-paths'
      ];
      
      if (!buildTools.includes(depName)) {
        unusedDependencies.push({ name: depName, version });
      }
    }
  }
  
  return unusedDependencies;
}

/**
 * Check for circular dependencies
 */
function findCircularDependencies() {
  console.log('🔍 Checking for circular dependencies...\n');
  
  try {
    // Use madge to detect circular dependencies if available
    const result = execSync('npx madge --circular --format amd src/', { encoding: 'utf-8' });
    
    if (result.trim()) {
      return result.split('\n').filter(line => line.trim());
    }
    
    return [];
  } catch (error) {
    console.log('ℹ️ Madge not available for circular dependency check');
    return [];
  }
}

/**
 * Main analysis function
 */
function main() {
  console.log('🧹 Import & Dependency Analysis\n');
  console.log('===============================\n');
  
  // 1. Find unused imports
  const unusedImports = findUnusedImports();
  
  if (unusedImports.length > 0) {
    console.log('❌ Unused Imports Found:\n');
    
    for (const item of unusedImports) {
      console.log(`📁 ${item.file}`);
      console.log(`   Module: ${item.module}`);
      console.log(`   Unused: ${item.unusedSpecifiers.join(', ')}\n`);
    }
  } else {
    console.log('✅ No unused imports found!\n');
  }
  
  // 2. Find unused dependencies
  const unusedDependencies = findUnusedDependencies();
  
  if (unusedDependencies.length > 0) {
    console.log('❌ Potentially Unused Dependencies:\n');
    
    for (const dep of unusedDependencies) {
      console.log(`📦 ${dep.name}@${dep.version}`);
    }
    console.log('');
  } else {
    console.log('✅ All dependencies appear to be used!\n');
  }
  
  // 3. Check for circular dependencies
  const circularDeps = findCircularDependencies();
  
  if (circularDeps.length > 0) {
    console.log('❌ Circular Dependencies Found:\n');
    
    for (const dep of circularDeps) {
      console.log(`🔄 ${dep}`);
    }
    console.log('');
  } else {
    console.log('✅ No circular dependencies found!\n');
  }
  
  // Summary
  console.log('📊 Summary\n');
  console.log('==========');
  console.log(`Unused imports: ${unusedImports.length}`);
  console.log(`Unused dependencies: ${unusedDependencies.length}`);
  console.log(`Circular dependencies: ${circularDeps.length}`);
  
  if (unusedImports.length === 0 && unusedDependencies.length === 0 && circularDeps.length === 0) {
    console.log('\n🎉 Your codebase has clean imports and dependencies!');
  } else {
    console.log('\n🔧 Run with --fix flag to automatically clean up unused imports');
  }
}

// Run the analysis
main();