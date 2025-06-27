#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to analyze and report on dependency usage
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
  const imports = new Set();
  
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
  ];
  
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const moduleName = match[1];
      
      // Only include external modules (not relative paths)
      if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
        imports.add(moduleName);
      }
    }
  }
  
  return Array.from(imports);
}

/**
 * Analyze dependency usage
 */
function analyzeDependencyUsage() {
  console.log('📦 Dependency Usage Analysis\n');
  console.log('============================\n');
  
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  const sourceFiles = getSourceFiles(SRC_DIR);
  const usedModules = new Set();
  
  // Collect all imported modules
  for (const filePath of sourceFiles) {
    try {
      const imports = extractImports(filePath);
      
      for (const moduleName of imports) {
        // Extract root package name
        if (moduleName.startsWith('@')) {
          // Scoped package: @scope/package
          const parts = moduleName.split('/');
          if (parts.length >= 2) {
            usedModules.add(`${parts[0]}/${parts[1]}`);
          }
        } else {
          // Regular package: package or package/submodule
          const rootPackage = moduleName.split('/')[0];
          usedModules.add(rootPackage);
        }
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${filePath}:`, error.message);
    }
  }
  
  // Categorize dependencies
  const categories = {
    used: [],
    unused: [],
    buildTools: [],
    typeDefinitions: []
  };
  
  // Known build tools and development dependencies
  const buildTools = new Set([
    '@biomejs/biome', '@vitejs/plugin-react', '@vitest/coverage-v8', '@vitest/ui',
    'autoprefixer', 'postcss', 'tailwindcss', 'typescript', 'vitest',
    '@next/bundle-analyzer', 'cross-env', 'dotenv', 'msw', 'tsx',
    '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event',
    'jsdom', 'commander', 'nock', 'undici', 'vite-tsconfig-paths', '@fast-check/vitest',
    '@peculiar/webcrypto', '@tailwindcss/postcss', 'tw-animate-css'
  ]);
  
  // Type definitions
  const typeDefinitions = new Set([
    '@types/node', '@types/pg', '@types/react', '@types/react-dom'
  ]);
  
  for (const [depName, version] of Object.entries(dependencies)) {
    if (usedModules.has(depName)) {
      categories.used.push({ name: depName, version });
    } else if (buildTools.has(depName)) {
      categories.buildTools.push({ name: depName, version });
    } else if (typeDefinitions.has(depName)) {
      categories.typeDefinitions.push({ name: depName, version });
    } else {
      categories.unused.push({ name: depName, version });
    }
  }
  
  // Report results
  console.log('✅ Used Dependencies:');
  for (const dep of categories.used.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`   📦 ${dep.name}@${dep.version}`);
  }
  console.log('');
  
  console.log('🔧 Build Tools & Dev Dependencies:');
  for (const dep of categories.buildTools.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`   🛠️  ${dep.name}@${dep.version}`);
  }
  console.log('');
  
  console.log('📝 Type Definitions:');
  for (const dep of categories.typeDefinitions.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`   📋 ${dep.name}@${dep.version}`);
  }
  console.log('');
  
  if (categories.unused.length > 0) {
    console.log('❓ Potentially Unused Dependencies:');
    for (const dep of categories.unused.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`   ❌ ${dep.name}@${dep.version}`);
    }
    console.log('');
    
    console.log('💡 Investigation Required:');
    console.log('   These dependencies may be:');
    console.log('   • Used by Next.js or other tooling');
    console.log('   • Required at runtime but not imported');
    console.log('   • Referenced in config files');
    console.log('   • Used by scripts in package.json');
    console.log('   • Actually unused and safe to remove');
    console.log('');
  }
  
  // Summary
  console.log('📊 Summary\n');
  console.log('==========');
  console.log(`Total dependencies: ${Object.keys(dependencies).length}`);
  console.log(`Used in source code: ${categories.used.length}`);
  console.log(`Build tools & dev deps: ${categories.buildTools.length}`);
  console.log(`Type definitions: ${categories.typeDefinitions.length}`);
  console.log(`Potentially unused: ${categories.unused.length}`);
  
  // Specific analysis for the unused dependencies found
  if (categories.unused.length > 0) {
    console.log('\n🔍 Specific Analysis:\n');
    
    const specificAnalysis = {
      '@octokit/types': 'Used for TypeScript types in GitHub API client',
      'ioredis': 'Used for Redis connections in rate limiting/caching',
      'next-pwa': 'Used for Progressive Web App features',
      'rate-limiter-flexible': 'Used for rate limiting in middleware',
      'react-dom': 'Required by React for DOM rendering',
    };
    
    for (const dep of categories.unused) {
      const analysis = specificAnalysis[dep.name];
      if (analysis) {
        console.log(`   📦 ${dep.name}: ${analysis}`);
      } else {
        console.log(`   ❓ ${dep.name}: Requires manual investigation`);
      }
    }
  }
  
  return categories;
}

/**
 * Check for import path optimization opportunities
 */
function analyzeImportPaths() {
  console.log('\n🔗 Import Path Analysis\n');
  console.log('=======================\n');
  
  const sourceFiles = getSourceFiles(SRC_DIR);
  const importStats = {
    relative: 0,
    absolute: 0,
    external: 0,
    aliased: 0
  };
  
  const nonOptimalImports = [];
  
  for (const filePath of sourceFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const importPattern = /import\s+[^'"`]*['"`]([^'"`]+)['"`]/g;
      
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1];
        
        if (importPath.startsWith('@/')) {
          importStats.aliased++;
        } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
          importStats.relative++;
          // Check if this could be optimized to use alias
          if (importPath.includes('../')) {
            nonOptimalImports.push({
              file: filePath,
              import: importPath,
              line: match[0]
            });
          }
        } else if (importPath.startsWith('/')) {
          importStats.absolute++;
        } else {
          importStats.external++;
        }
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${filePath}:`, error.message);
    }
  }
  
  console.log('📈 Import Path Statistics:');
  console.log(`   External packages: ${importStats.external}`);
  console.log(`   Aliased (@/) paths: ${importStats.aliased}`);
  console.log(`   Relative (./) paths: ${importStats.relative}`);
  console.log(`   Absolute (/) paths: ${importStats.absolute}`);
  console.log('');
  
  if (nonOptimalImports.length > 0) {
    console.log('🔧 Non-optimal Import Paths:');
    for (const item of nonOptimalImports.slice(0, 10)) { // Show first 10
      console.log(`   📁 ${item.file}`);
      console.log(`      ${item.line}`);
    }
    if (nonOptimalImports.length > 10) {
      console.log(`   ... and ${nonOptimalImports.length - 10} more`);
    }
    console.log('');
  }
  
  return { importStats, nonOptimalImports };
}

/**
 * Main analysis function
 */
function main() {
  const dependencyAnalysis = analyzeDependencyUsage();
  const importAnalysis = analyzeImportPaths();
  
  console.log('\n🎯 Recommendations\n');
  console.log('==================');
  
  if (dependencyAnalysis.unused.length > 0) {
    console.log('📦 Dependencies:');
    console.log('   • Review potentially unused dependencies');
    console.log('   • Check if they are used in config files or scripts');
    console.log('   • Remove confirmed unused dependencies');
    console.log('');
  }
  
  if (importAnalysis.nonOptimalImports.length > 0) {
    console.log('🔗 Import Paths:');
    console.log('   • Convert complex relative paths to @/ aliases');
    console.log('   • Ensure consistent import ordering');
    console.log('   • Use TypeScript path mapping for cleaner imports');
    console.log('');
  }
  
  const overallScore = 100 - (dependencyAnalysis.unused.length * 5) - (importAnalysis.nonOptimalImports.length * 2);
  console.log(`📊 Overall Import/Dependency Health Score: ${Math.max(0, overallScore)}/100`);
}

// Run the analysis
main();