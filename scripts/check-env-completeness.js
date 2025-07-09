#!/usr/bin/env node

/**
 * Secure Environment Variable Completeness Checker
 * Compares .env.local against .env.example without exposing actual values
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const variables = new Set();
  
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key] = trimmed.split('=');
      if (key) {
        variables.add(key.trim());
      }
    }
  });
  
  return variables;
}

function main() {
  const projectRoot = process.cwd();
  const envExample = path.join(projectRoot, '.env.example');
  const envLocal = path.join(projectRoot, '.env.local');
  
  console.log('🔍 Checking environment variable completeness...\n');
  
  if (!fs.existsSync(envLocal)) {
    console.log('❌ .env.local not found. Please copy .env.example to .env.local first.');
    process.exit(1);
  }
  
  const exampleVars = parseEnvFile(envExample);
  const localVars = parseEnvFile(envLocal);
  
  const missing = [...exampleVars].filter(x => !localVars.has(x));
  const extra = [...localVars].filter(x => !exampleVars.has(x));
  
  if (missing.length === 0) {
    console.log('✅ All required environment variables are present in .env.local');
  } else {
    console.log('⚠️  Missing environment variables in .env.local:');
    missing.forEach(variable => {
      console.log(`   - ${variable}`);
    });
  }
  
  if (extra.length > 0) {
    console.log('\n📝 Additional variables in .env.local (not in .env.example):');
    extra.forEach(variable => {
      console.log(`   + ${variable}`);
    });
  }
  
  // Security check for empty values (without revealing them)
  console.log('\n🔐 Checking for empty values...');
  const content = fs.readFileSync(envLocal, 'utf8');
  const emptyVars = [];
  
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, value] = trimmed.split('=');
      if (key && (!value || value.trim() === '' || value.trim() === '""' || value.trim() === "''")) {
        emptyVars.push(key.trim());
      }
    }
  });
  
  if (emptyVars.length > 0) {
    console.log('⚠️  Variables with empty values:');
    emptyVars.forEach(variable => {
      console.log(`   - ${variable}`);
    });
  } else {
    console.log('✅ No empty values found');
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Total in .env.example: ${exampleVars.size}`);
  console.log(`   Total in .env.local: ${localVars.size}`);
  console.log(`   Missing: ${missing.length}`);
  console.log(`   Empty values: ${emptyVars.length}`);
  
  if (missing.length === 0 && emptyVars.length === 0) {
    console.log('\n🎉 Your .env.local appears to be complete and properly configured!');
    process.exit(0);
  } else {
    console.log('\n📋 Please review the items above and update your .env.local file.');
    process.exit(1);
  }
}

main();