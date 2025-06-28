#!/usr/bin/env node

/**
 * Migration script from Docker-based testing to Neon branching
 * 
 * This script helps transition your test infrastructure from Docker
 * to Neon's serverless database branching.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

console.log('🚀 Migrating from Docker to Neon Branching for Test Isolation\n')

// Check for required environment variables
const requiredEnvVars = {
  NEON_API_KEY: 'Your Neon API key from https://console.neon.tech/account/keys',
  NEON_PROJECT_ID: 'Your Neon project ID from the console URL',
  DATABASE_URL: 'Your main Neon database connection string',
}

const missingVars = Object.entries(requiredEnvVars)
  .filter(([key]) => !process.env[key])
  .map(([key, desc]) => `  ${key}: ${desc}`)

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:\n')
  console.error(missingVars.join('\n'))
  console.error('\nAdd these to your .env.test file\n')
  process.exit(1)
}

console.log('✅ Environment variables configured\n')

// Check for Docker files to remove
const dockerFiles = [
  'docker-compose.yml',
  'docker-compose.test.yml',
  'Dockerfile',
  'Dockerfile.dev',
  '.dockerignore',
  'tests/integration/infrastructure/docker-compose.yml',
]

const existingDockerFiles = dockerFiles.filter(file => fs.existsSync(file))

if (existingDockerFiles.length > 0) {
  console.log('📦 Found Docker files to remove:')
  existingDockerFiles.forEach(file => console.log(`  - ${file}`))
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  readline.question('\nRemove these Docker files? (y/N): ', answer => {
    if (answer.toLowerCase() === 'y') {
      existingDockerFiles.forEach(file => {
        fs.unlinkSync(file)
        console.log(`  ✅ Removed ${file}`)
      })
    }
    readline.close()
    updateTestConfiguration()
  })
} else {
  console.log('✅ No Docker files found\n')
  updateTestConfiguration()
}

function updateTestConfiguration() {
  console.log('\n📝 Updating test configuration...\n')

  // Check if old setup.ts exists
  const oldSetupPath = 'tests/database/setup.ts'
  const newSetupPath = 'tests/database/neon-setup.ts'

  if (fs.existsSync(oldSetupPath) && !fs.existsSync(newSetupPath)) {
    console.log('  🔄 Backing up old setup.ts to setup.ts.docker-backup')
    fs.renameSync(oldSetupPath, `${oldSetupPath}.docker-backup`)
  }

  // Update vitest config if needed
  const vitestConfigPath = 'vitest.database.config.ts'
  if (fs.existsSync(vitestConfigPath)) {
    let config = fs.readFileSync(vitestConfigPath, 'utf8')
    if (config.includes('./tests/database/setup.ts')) {
      config = config.replace(
        './tests/database/setup.ts',
        './tests/database/neon-setup.ts'
      )
      fs.writeFileSync(vitestConfigPath, config)
      console.log('  ✅ Updated vitest.database.config.ts')
    }
  }

  // Check package.json for Docker scripts
  const packageJsonPath = 'package.json'
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  
  const dockerScripts = Object.keys(packageJson.scripts || {})
    .filter(key => key.includes('docker'))

  if (dockerScripts.length > 0) {
    console.log('\n  📦 Found Docker-related scripts in package.json:')
    dockerScripts.forEach(script => console.log(`    - ${script}`))
    console.log('\n  These should be removed or replaced with Neon scripts')
  }

  createEnvTestExample()
}

function createEnvTestExample() {
  console.log('\n📄 Creating .env.test.example...\n')

  const envExample = `# Neon Database Configuration for Testing
# Get these values from https://console.neon.tech

# Your Neon API key (create at https://console.neon.tech/account/keys)
NEON_API_KEY=

# Your Neon project ID (found in console URL or project settings)
NEON_PROJECT_ID=

# Main database URL (connection string from Neon console)
DATABASE_URL=

# Optional: Specific branch URLs if you want to use fixed branches
DATABASE_URL_TEST=
DATABASE_URL_DEV=

# Test environment
NODE_ENV=test
`

  fs.writeFileSync('.env.test.example', envExample)
  console.log('  ✅ Created .env.test.example')

  printNextSteps()
}

function printNextSteps() {
  console.log('\n✨ Migration completed!\n')
  console.log('Next steps:')
  console.log('1. Copy .env.test.example to .env.test and fill in your Neon credentials')
  console.log('2. Run "pnpm test:db" to test the new Neon-based setup')
  console.log('3. Use "pnpm neon:list-branches" to see your test branches')
  console.log('4. Use "pnpm neon:cleanup-test-branches" to clean up old test branches')
  console.log('\nBenefits of Neon branching:')
  console.log('  ✅ No Docker required')
  console.log('  ✅ Instant branch creation (seconds vs minutes)')
  console.log('  ✅ Automatic cleanup')
  console.log('  ✅ Zero maintenance')
  console.log('  ✅ Cost-effective (branches are paused when not in use)')
  console.log('\nHappy testing! 🚀')
}