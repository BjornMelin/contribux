#!/usr/bin/env node

/**
 * Memory Configuration Management Script
 * Manages memory monitoring settings for different environments
 */

const fs = require('fs')
const path = require('path')

// Memory configuration profiles
const MEMORY_PROFILES = {
  development: {
    growthThresholdMB: 8,
    maxSnapshotsToKeep: 50,
    gcInvocationDelay: 50,
    enableHeapProfiler: true,
    logMemoryEvery: 5,
    forceGCBeforeSnapshot: true,
    cleanupAfterTest: true,
    strictMemoryChecks: false,
  },
  ci: {
    growthThresholdMB: 15,
    maxSnapshotsToKeep: 30,
    gcInvocationDelay: 100,
    enableHeapProfiler: false,
    logMemoryEvery: 10,
    forceGCBeforeSnapshot: true,
    cleanupAfterTest: true,
    strictMemoryChecks: true,
  },
  performance: {
    growthThresholdMB: 5,
    maxSnapshotsToKeep: 100,
    gcInvocationDelay: 25,
    enableHeapProfiler: true,
    logMemoryEvery: 1,
    forceGCBeforeSnapshot: true,
    cleanupAfterTest: true,
    strictMemoryChecks: true,
  },
  minimal: {
    growthThresholdMB: 20,
    maxSnapshotsToKeep: 20,
    gcInvocationDelay: 200,
    enableHeapProfiler: false,
    logMemoryEvery: 20,
    forceGCBeforeSnapshot: false,
    cleanupAfterTest: true,
    strictMemoryChecks: false,
  },
}

function getConfigPath() {
  return path.join(__dirname, '..', '.memory-config.json')
}

function loadCurrentConfig() {
  const configPath = getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    }
  } catch (error) {
    console.warn('Failed to load memory config:', error.message)
  }
  return null
}

function saveConfig(config) {
  const configPath = getConfigPath()
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`✅ Memory configuration saved to ${configPath}`)
  } catch (error) {
    console.error('Failed to save memory config:', error.message)
    process.exit(1)
  }
}

function showCurrentConfig() {
  const config = loadCurrentConfig()
  if (config) {
    console.log('📊 Current Memory Configuration:')
    console.log(JSON.stringify(config, null, 2))
  } else {
    console.log('📊 No custom memory configuration found (using defaults)')
  }
}

function setProfile(profileName) {
  if (!MEMORY_PROFILES[profileName]) {
    console.error(`❌ Unknown profile: ${profileName}`)
    console.log('Available profiles:', Object.keys(MEMORY_PROFILES).join(', '))
    process.exit(1)
  }

  const config = {
    profile: profileName,
    ...MEMORY_PROFILES[profileName],
    updatedAt: new Date().toISOString(),
  }

  saveConfig(config)
  console.log(`✅ Memory profile set to: ${profileName}`)
  
  // Show the configuration
  console.log('\n📋 Configuration Details:')
  Object.entries(MEMORY_PROFILES[profileName]).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`)
  })
}

function showProfiles() {
  console.log('📋 Available Memory Profiles:\n')
  
  Object.entries(MEMORY_PROFILES).forEach(([name, config]) => {
    console.log(`🎯 ${name.toUpperCase()}:`)
    console.log(`   Growth Threshold: ${config.growthThresholdMB}MB`)
    console.log(`   Snapshots Kept: ${config.maxSnapshotsToKeep}`)
    console.log(`   Heap Profiler: ${config.enableHeapProfiler ? 'Enabled' : 'Disabled'}`)
    console.log(`   Strict Checks: ${config.strictMemoryChecks ? 'Enabled' : 'Disabled'}`)
    console.log('')
  })
}

function generateTestScript() {
  const config = loadCurrentConfig()
  const profile = config?.profile || 'development'
  
  console.log('🧪 Memory Test Script:')
  console.log('')
  console.log('# Run tests with memory monitoring')
  console.log('pnpm test --reporter=verbose')
  console.log('')
  console.log('# Run tests with strict memory checks')
  console.log('STRICT_MEMORY_CHECKS=true pnpm test')
  console.log('')
  console.log('# Run specific test with memory profiling')
  console.log('pnpm test tests/path/to/test.test.ts --reporter=verbose')
  console.log('')
  console.log(`# Current profile: ${profile}`)
  
  if (config) {
    console.log(`# Leak threshold: ${config.growthThresholdMB}MB`)
    console.log(`# Heap profiler: ${config.enableHeapProfiler ? 'Enabled' : 'Disabled'}`)
  }
}

function main() {
  const command = process.argv[2]
  const arg = process.argv[3]

  switch (command) {
    case 'show':
    case 'current':
      showCurrentConfig()
      break
      
    case 'profiles':
    case 'list':
      showProfiles()
      break
      
    case 'set':
      if (!arg) {
        console.error('❌ Profile name required')
        console.log('Usage: node memory-config.js set <profile>')
        console.log('Available profiles:', Object.keys(MEMORY_PROFILES).join(', '))
        process.exit(1)
      }
      setProfile(arg)
      break
      
    case 'test':
    case 'script':
      generateTestScript()
      break
      
    case 'help':
    default:
      console.log('🧠 Memory Configuration Management')
      console.log('')
      console.log('Commands:')
      console.log('  show           Show current configuration')
      console.log('  profiles       List available profiles')
      console.log('  set <profile>  Set memory profile')
      console.log('  test           Generate test script')
      console.log('  help           Show this help')
      console.log('')
      console.log('Available profiles:', Object.keys(MEMORY_PROFILES).join(', '))
      break
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  MEMORY_PROFILES,
  loadCurrentConfig,
  saveConfig,
  setProfile,
}