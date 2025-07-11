// Hybrid search function tests
import { describe, expect, it } from 'vitest'

// Setup for database tests
import './setup'
import { getTestDatabase } from '@/lib/test-utils/test-database-manager'
import { sql } from './db-client'

describe('Hybrid Search Functions', () => {
  describe('hybrid_search_opportunities', () => {
    it('should exist and be callable', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Test function exists
      const functions = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = 'hybrid_search_opportunities'
      `

      expect(functions).toHaveLength(1)
    })

    it('should handle text-only search', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Call function with text search only (no vector)
      const results = await sql`
        SELECT * FROM hybrid_search_opportunities(
          'javascript development',
          NULL,
          1.0,
          0.0,
          60,
          5
        )
      `

      // Should return array (may be empty if no matching data)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle invalid parameters gracefully', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Test with invalid parameters
      const results = await sql`
        SELECT * FROM hybrid_search_opportunities(
          '',  -- empty search
          NULL,
          0.5,
          0.5,
          60,
          1
        )
      `

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('hybrid_search_repositories', () => {
    it('should exist and be callable', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      const functions = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = 'hybrid_search_repositories'
      `

      expect(functions).toHaveLength(1)
    })

    it('should handle text search', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      const results = await sql`
        SELECT * FROM hybrid_search_repositories(
          'react typescript',
          NULL,
          1.0,
          0.0,
          60,
          5
        )
      `

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('search_similar_users', () => {
    it('should exist and be callable', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      const functions = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = 'search_similar_users'
      `

      expect(functions).toHaveLength(1)
    })

    it('should handle vector search with test embedding', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Create a test halfvec embedding (1536 dimensions of zeros)
      const testEmbedding = new Array(1536).fill(0)
      const embeddingString = `[${testEmbedding.join(',')}]`

      const results = await sql`
        SELECT * FROM search_similar_users(
          ${embeddingString}::halfvec(1536),
          0.1,  -- low threshold for testing
          3
        )
      `

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('find_matching_opportunities_for_user', () => {
    it('should exist and be callable', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      const functions = await sql`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name = 'find_matching_opportunities_for_user'
      `

      expect(functions).toHaveLength(1)
    })

    it('should handle non-existent user gracefully', async () => {
      const db = getTestDatabase('search-function-test')

      // Skip PostgreSQL-specific search functions for PGlite compatibility
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping PostgreSQL search function test for PGlite (advanced functions not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Test with random UUID that doesn't exist
      const randomUuid = '00000000-0000-4000-8000-000000000000'

      try {
        const results = await sql`
          SELECT * FROM find_matching_opportunities_for_user(
            ${randomUuid}::uuid,
            0.5,
            5
          )
        `

        // Should either return empty array or throw expected error
        expect(Array.isArray(results)).toBe(true)
      } catch (error) {
        // Expected to fail with user not found error
        expect(error).toBeDefined()
      }
    })
  })

  describe('Vector Operations', () => {
    it('should support halfvec operations', async () => {
      const db = getTestDatabase('vector-operations-test')

      // Skip halfvec operations for PGlite compatibility (halfvec extension not available)
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping halfvec operations test for PGlite (halfvec extension not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Test basic halfvec operations
      const testEmbedding1 = new Array(1536).fill(0.1)
      const testEmbedding2 = new Array(1536).fill(0.2)

      const embedding1String = `[${testEmbedding1.join(',')}]`
      const embedding2String = `[${testEmbedding2.join(',')}]`

      const result = await sql`
        SELECT 
          ${embedding1String}::halfvec(1536) <-> ${embedding2String}::halfvec(1536) as distance
      `

      expect(result).toHaveLength(1)
      const typedResult = result as Array<{ distance: number }>
      expect(typeof typedResult[0]?.distance).toBe('number')
      expect(typedResult[0]?.distance).toBeGreaterThan(0)
    })

    it('should support vector similarity operations', async () => {
      const db = getTestDatabase('vector-similarity-test')

      // Skip halfvec operations for PGlite compatibility (halfvec extension not available)
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping halfvec operations test for PGlite (halfvec extension not available)'
        )
        expect(true).toBe(true)
        return
      }

      // Test cosine similarity
      const testEmbedding = new Array(1536).fill(1)
      const embeddingString = `[${testEmbedding.join(',')}]`

      const result = await sql`
        SELECT 
          ${embeddingString}::halfvec(1536) <=> ${embeddingString}::halfvec(1536) as cosine_similarity
      `

      expect(result).toHaveLength(1)
      expect((result as Array<{ cosine_similarity: number }>)[0]?.cosine_similarity).toBe(0) // Same vector should have 0 cosine distance
    })
  })

  describe('Text Search Functions', () => {
    it('should support trigram similarity', async () => {
      const db = getTestDatabase('trigram-similarity-test')

      // Skip trigram similarity for PGlite compatibility (pg_trgm extension not available)
      if ((await db).strategy === 'pglite') {
        console.log(
          '⚠️  Skipping trigram similarity test for PGlite (pg_trgm extension not available)'
        )
        expect(true).toBe(true)
        return
      }

      const result = await sql`
        SELECT similarity('javascript', 'javascript development') as sim
      `

      expect(result).toHaveLength(1)
      const simResult = result as Array<{ sim: number }>
      expect(typeof simResult[0]?.sim).toBe('number')
      expect(simResult[0]?.sim).toBeGreaterThan(0)
      expect(simResult[0]?.sim).toBeLessThanOrEqual(1)
    })

    it('should support full-text search', async () => {
      const result = await sql`
        SELECT 
          to_tsvector('english', 'JavaScript development with React') @@ 
          plainto_tsquery('javascript') as matches
      `

      expect(result).toHaveLength(1)
      expect((result as Array<{ matches: boolean }>)[0]?.matches).toBe(true)
    })
  })
})
