#!/usr/bin/env node

/**
 * Secure Environment Variable Completeness Checker
 * Compares .env.local against .env.example without exposing actual values
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Set()
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const variables = new Set()

  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key] = trimmed.split('=')
      if (key) {
        variables.add(key.trim())
      }
    }
  })

  return variables
}

function main() {
  const projectRoot = process.cwd()
  const envExample = path.join(projectRoot, '.env.example')
  const envLocal = path.join(projectRoot, '.env.local')

  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log('🔍 Checking environment variable completeness...\n')

  if (!fs.existsSync(envLocal)) {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('❌ .env.local not found. Please copy .env.example to .env.local first.')
    process.exit(1)
  }

  const exampleVars = parseEnvFile(envExample)
  const localVars = parseEnvFile(envLocal)

  const missing = [...exampleVars].filter(x => !localVars.has(x))
  const extra = [...localVars].filter(x => !exampleVars.has(x))

  if (missing.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('✅ All required environment variables are present in .env.local')
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('⚠️  Missing environment variables in .env.local:')
    missing.forEach(variable => {
      // biome-ignore lint/suspicious/noConsole: CLI tool output
      console.log(`   - ${variable}`)
    })
  }

  if (extra.length > 0) {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('\n📝 Additional variables in .env.local (not in .env.example):')
    extra.forEach(variable => {
      // biome-ignore lint/suspicious/noConsole: CLI tool output
      console.log(`   + ${variable}`)
    })
  }

  // Security check for empty values (without revealing them)
  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log('\n🔐 Checking for empty values...')
  const content = fs.readFileSync(envLocal, 'utf8')
  const emptyVars = []

  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, value] = trimmed.split('=')
      if (
        key &&
        (!value || value.trim() === '' || value.trim() === '""' || value.trim() === "''")
      ) {
        emptyVars.push(key.trim())
      }
    }
  })

  if (emptyVars.length > 0) {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('⚠️  Variables with empty values:')
    emptyVars.forEach(variable => {
      // biome-ignore lint/suspicious/noConsole: CLI tool output
      console.log(`   - ${variable}`)
    })
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('✅ No empty values found')
  }

  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log('\n📊 Summary:')
  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log(`   Total in .env.example: ${exampleVars.size}`)
  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log(`   Total in .env.local: ${localVars.size}`)
  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log(`   Missing: ${missing.length}`)
  // biome-ignore lint/suspicious/noConsole: CLI tool output
  console.log(`   Empty values: ${emptyVars.length}`)

  if (missing.length === 0 && emptyVars.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('\n🎉 Your .env.local appears to be complete and properly configured!')
    process.exit(0)
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI tool output
    console.log('\n📋 Please review the items above and update your .env.local file.')
    process.exit(1)
  }
}

main()
