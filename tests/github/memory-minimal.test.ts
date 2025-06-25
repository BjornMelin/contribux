/**
 * Minimal memory test without heavy dependencies
 */

// Skip global setup
import { describe, expect, it } from 'vitest'

describe('Minimal Memory Test', () => {
  const getMemoryUsage = () => {
    if (global.gc) {
      global.gc()
    }
    const usage = process.memoryUsage()
    return {
      heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100, // MB
    }
  }

  it('should show baseline memory usage', () => {
    const memory = getMemoryUsage()
    console.log('Baseline memory without dependencies:', memory)

    // Basic expectation
    expect(memory.heapUsed).toBeLessThan(100)
  })

  it('should show memory after loading GitHub client', async () => {
    const beforeImport = getMemoryUsage()
    console.log('Memory before import:', beforeImport)

    // Dynamic import to measure impact
    const { GitHubClient } = await import('../../src/lib/github')

    const afterImport = getMemoryUsage()
    console.log('Memory after import:', afterImport)
    console.log('Import added:', (afterImport.heapUsed - beforeImport.heapUsed).toFixed(2), 'MB')

    // Create a client
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
    })

    const afterCreate = getMemoryUsage()
    console.log('Memory after creating client:', afterCreate)
    console.log('Client added:', (afterCreate.heapUsed - afterImport.heapUsed).toFixed(2), 'MB')

    expect(client).toBeDefined()
  })
})
