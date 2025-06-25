/**
 * Simple Vector Test - Basic database connection and vector functionality
 */

import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL } from './db-client'

describe('Simple Vector Test', () => {
  let client: Client
  const databaseUrl = TEST_DATABASE_URL

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL_TEST or DATABASE_URL is required for vector tests')
    }

    client = new Client({ connectionString: databaseUrl })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  it('should connect to the test database', async () => {
    const result = await client.query('SELECT version()')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].version).toContain('PostgreSQL')
  })

  it('should have vector extension loaded', async () => {
    const result = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'")
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].extname).toBe('vector')
  })

  it('should have the users table with vector columns', async () => {
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'profile_embedding'
    `)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].column_name).toBe('profile_embedding')
    expect(result.rows[0].data_type).toBe('USER-DEFINED') // halfvec type
  })

  it('should create and query vector data', async () => {
    // Clean up any existing test data
    await client.query("DELETE FROM users WHERE github_username = 'test_simple_vector'")

    // Create a simple test embedding
    const testEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01))

    // Insert test user
    await client.query(
      'INSERT INTO users (github_id, github_username, github_name, profile_embedding) VALUES ($1, $2, $3, $4)',
      [999999, 'test_simple_vector', 'Test User', `[${testEmbedding.join(',')}]`]
    )

    // Query the user back
    const result = await client.query(
      "SELECT github_username, profile_embedding FROM users WHERE github_username = 'test_simple_vector'"
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].github_username).toBe('test_simple_vector')
    expect(result.rows[0].profile_embedding).toBeDefined()

    // Test vector similarity search
    const similarityResult = await client.query(
      `
      SELECT 
        github_username,
        profile_embedding <=> $1::halfvec as distance
      FROM users 
      WHERE github_username = 'test_simple_vector'
    `,
      [`[${testEmbedding.join(',')}]`]
    )

    expect(similarityResult.rows).toHaveLength(1)
    expect(similarityResult.rows[0].distance).toBeCloseTo(0, 3) // Should be very close to itself

    // Clean up
    await client.query("DELETE FROM users WHERE github_username = 'test_simple_vector'")
  })

  it('should have HNSW indexes created', async () => {
    const result = await client.query(`
      SELECT indexname, schemaname, tablename 
      FROM pg_indexes 
      WHERE indexname LIKE '%hnsw%' OR indexname LIKE '%profile_embedding%'
    `)

    // Should have at least one vector index
    expect(result.rows.length).toBeGreaterThan(0)
  })
})
