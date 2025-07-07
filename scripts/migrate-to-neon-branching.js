#!/usr/bin/env node

/**
 * Migration script from Docker-based testing to Neon branching
 *
 * This script helps transition your test infrastructure from Docker
 * to Neon's serverless database branching.
 */

const fs = require('node:fs')

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
  missingVars.forEach(_varInfo => {
    // Missing environment variable handling would go here
  })
  process.exit(1)
}

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
  existingDockerFiles.forEach(_file => {
    // File to be removed: _file
  })

  const readline = require('node:readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  readline.question('\nRemove these Docker files? (y/N): ', answer => {
    if (answer.toLowerCase() === 'y') {
      existingDockerFiles.forEach(file => {
        try {
          fs.unlinkSync(file)
        } catch (_error) {
          // Ignore errors during file removal
        }
      })
    } else {
      // Docker files kept
    }
    readline.close()
    updateTestConfiguration()
  })
} else {
  updateTestConfiguration()
}

function updateTestConfiguration() {
  // Check if old setup.ts exists
  const oldSetupPath = 'tests/database/setup.ts'
  const newSetupPath = 'tests/database/neon-setup.ts'

  if (fs.existsSync(oldSetupPath) && !fs.existsSync(newSetupPath)) {
    fs.renameSync(oldSetupPath, `${oldSetupPath}.docker-backup`)
  }

  // Update vitest config if needed
  const vitestConfigPath = 'vitest.database.config.ts'
  if (fs.existsSync(vitestConfigPath)) {
    let config = fs.readFileSync(vitestConfigPath, 'utf8')
    if (config.includes('./tests/database/setup.ts')) {
      config = config.replace('./tests/database/setup.ts', './tests/database/neon-setup.ts')
      fs.writeFileSync(vitestConfigPath, config)
    }
  }

  // Check package.json for Docker scripts
  const packageJsonPath = 'package.json'
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  const dockerScripts = Object.keys(packageJson.scripts || {}).filter(key => key.includes('docker'))

  if (dockerScripts.length > 0) {
    dockerScripts.forEach(_script => {
      // Docker script to be removed: _script
    })
  }

  createEnvTestExample()
}

function createEnvTestExample() {
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

  printNextSteps()
}

function printNextSteps() {
  // TODO: Add next steps information
}
