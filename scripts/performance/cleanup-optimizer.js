#!/usr/bin/env node

/**
 * Cleanup Optimizer
 * Removes temporary files, optimizes dependencies, and cleans up memory usage
 */

const fs = require('node:fs').promises
const path = require('node:path')
const { execSync } = require('node:child_process')

class CleanupOptimizer {
  constructor() {
    this.projectRoot = process.cwd()
    this.cleanupActions = []
    this.sizeBefore = 0
    this.sizeAfter = 0
  }

  // Get directory size
  async getDirectorySize(dirPath) {
    try {
      const stat = await fs.stat(dirPath)
      if (stat.isFile()) {
        return stat.size
      }

      if (stat.isDirectory()) {
        const files = await fs.readdir(dirPath)
        let totalSize = 0

        for (const file of files) {
          const filePath = path.join(dirPath, file)
          totalSize += await this.getDirectorySize(filePath)
        }

        return totalSize
      }
    } catch (_error) {
      return 0
    }
    return 0
  }

  // Format bytes to human readable
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024
      i++
    }
    return `${bytes.toFixed(2)} ${units[i]}`
  }

  // Clean Next.js build artifacts
  async cleanNextArtifacts() {
    const nextDirs = ['.next', 'out', '.vercel']
    let cleaned = 0

    for (const dir of nextDirs) {
      const dirPath = path.join(this.projectRoot, dir)
      try {
        const size = await this.getDirectorySize(dirPath)
        await fs.rm(dirPath, { recursive: true, force: true })
        cleaned += size
        this.cleanupActions.push(`Removed ${dir} (${this.formatBytes(size)})`)
      } catch (_error) {
        // Directory might not exist, that's fine
      }
    }

    return cleaned
  }

  // Clean test artifacts
  async cleanTestArtifacts() {
    const testDirs = ['coverage', 'test-results', '.nyc_output']
    const testFiles = ['*.heapsnapshot', '*.cpuprofile', 'memory-*.json']
    let cleaned = 0

    // Remove test directories
    for (const dir of testDirs) {
      const dirPath = path.join(this.projectRoot, dir)
      try {
        const size = await this.getDirectorySize(dirPath)
        await fs.rm(dirPath, { recursive: true, force: true })
        cleaned += size
        this.cleanupActions.push(`Removed ${dir} (${this.formatBytes(size)})`)
      } catch (_error) {
        // Directory might not exist
      }
    }

    // Remove test files
    for (const pattern of testFiles) {
      try {
        const files = await fs.readdir(this.projectRoot)
        for (const file of files) {
          if (file.includes(pattern.replace('*', ''))) {
            const filePath = path.join(this.projectRoot, file)
            const stat = await fs.stat(filePath)
            await fs.rm(filePath, { force: true })
            cleaned += stat.size
            this.cleanupActions.push(`Removed ${file} (${this.formatBytes(stat.size)})`)
          }
        }
      } catch (_error) {
        // Files might not exist
      }
    }

    return cleaned
  }

  // Clean node_modules if needed
  async optimizeNodeModules() {
    const nodeModulesPath = path.join(this.projectRoot, 'node_modules')
    let optimized = 0

    try {
      const sizeBefore = await this.getDirectorySize(nodeModulesPath)
      execSync('pnpm prune', { cwd: this.projectRoot, stdio: 'pipe' })

      const sizeAfter = await this.getDirectorySize(nodeModulesPath)
      optimized = sizeBefore - sizeAfter

      if (optimized > 0) {
        this.cleanupActions.push(`Optimized node_modules (saved ${this.formatBytes(optimized)})`)
      }
    } catch (_error) {}

    return optimized
  }

  // Clean log files
  async cleanLogFiles() {
    const logPatterns = ['*.log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*']
    let cleaned = 0

    try {
      const files = await fs.readdir(this.projectRoot)
      for (const file of files) {
        if (logPatterns.some(pattern => file.includes(pattern.replace('*', '')))) {
          const filePath = path.join(this.projectRoot, file)
          const stat = await fs.stat(filePath)
          await fs.rm(filePath, { force: true })
          cleaned += stat.size
          this.cleanupActions.push(`Removed ${file} (${this.formatBytes(stat.size)})`)
        }
      }
    } catch (_error) {
      // Files might not exist
    }

    return cleaned
  }

  // Clean temporary files
  async cleanTempFiles() {
    const tempDirs = ['tmp', 'temp', '.tmp']
    const tempFiles = ['*.tmp', '*.temp', '.DS_Store', 'Thumbs.db']
    let cleaned = 0

    // Remove temp directories
    for (const dir of tempDirs) {
      const dirPath = path.join(this.projectRoot, dir)
      try {
        const size = await this.getDirectorySize(dirPath)
        await fs.rm(dirPath, { recursive: true, force: true })
        cleaned += size
        this.cleanupActions.push(`Removed ${dir} (${this.formatBytes(size)})`)
      } catch (_error) {
        // Directory might not exist
      }
    }

    // Remove temp files
    for (const pattern of tempFiles) {
      try {
        const files = await fs.readdir(this.projectRoot)
        for (const file of files) {
          if (pattern.startsWith('*') ? file.endsWith(pattern.slice(1)) : file === pattern) {
            const filePath = path.join(this.projectRoot, file)
            const stat = await fs.stat(filePath)
            await fs.rm(filePath, { force: true })
            cleaned += stat.size
            this.cleanupActions.push(`Removed ${file} (${this.formatBytes(stat.size)})`)
          }
        }
      } catch (_error) {
        // Files might not exist
      }
    }

    return cleaned
  }

  // Clean package manager caches
  async cleanPackageManagerCaches() {
    let cleaned = 0

    try {
      // Get pnpm cache size before
      const cacheInfo = execSync('pnpm store path', { encoding: 'utf8' }).trim()
      const sizeBefore = await this.getDirectorySize(cacheInfo)
      execSync('pnpm store prune', { cwd: this.projectRoot, stdio: 'pipe' })

      const sizeAfter = await this.getDirectorySize(cacheInfo)
      cleaned = sizeBefore - sizeAfter

      if (cleaned > 0) {
        this.cleanupActions.push(`Cleaned pnpm cache (saved ${this.formatBytes(cleaned)})`)
      }
    } catch (_error) {}

    return cleaned
  }

  // Optimize package.json (remove unused scripts/deps if any)
  async optimizePackageJson() {
    try {
      const packagePath = path.join(this.projectRoot, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'))

      // Check for common optimization opportunities
      let optimized = false

      // Remove empty or unused fields
      const emptyFields = ['keywords', 'bugs', 'homepage']
      for (const field of emptyFields) {
        if (
          packageJson[field] &&
          ((Array.isArray(packageJson[field]) && packageJson[field].length === 0) ||
            (typeof packageJson[field] === 'string' && packageJson[field].trim() === ''))
        ) {
          delete packageJson[field]
          optimized = true
        }
      }

      if (optimized) {
        await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2))
        this.cleanupActions.push('Optimized package.json')
      }
    } catch (_error) {}
  }

  // Run full cleanup
  async runFullCleanup() {
    // Get initial project size
    this.sizeBefore = await this.getDirectorySize(this.projectRoot)

    let totalCleaned = 0
    totalCleaned += await this.cleanNextArtifacts()
    totalCleaned += await this.cleanTestArtifacts()
    totalCleaned += await this.cleanTempFiles()
    totalCleaned += await this.cleanLogFiles()
    await this.optimizePackageJson()

    if (process.argv.includes('--deep')) {
      totalCleaned += await this.optimizeNodeModules()
      totalCleaned += await this.cleanPackageManagerCaches()
    }

    // Get final project size
    this.sizeAfter = await this.getDirectorySize(this.projectRoot)
    const actualSaved = this.sizeBefore - this.sizeAfter

    if (this.cleanupActions.length > 0) {
      this.cleanupActions.forEach(_action => {
        // Process cleanup action
      })
    }

    return {
      sizeBefore: this.sizeBefore,
      sizeAfter: this.sizeAfter,
      totalCleaned: Math.max(totalCleaned, actualSaved),
      actions: this.cleanupActions,
    }
  }
}

// CLI interface
async function main() {
  const optimizer = new CleanupOptimizer()

  try {
    await optimizer.runFullCleanup()
  } catch (_error) {
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { CleanupOptimizer }
