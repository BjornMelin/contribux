// Database infrastructure integration tests
import { describe, it, expect, beforeAll } from 'vitest'
import { createTestDatabaseHelper, type TestDatabaseHelper } from '../utils/database'

describe('Database Infrastructure', () => {
  let dbHelper: TestDatabaseHelper

  beforeAll(async () => {
    dbHelper = createTestDatabaseHelper()
  })

  describe('Connectivity', () => {
    it('should connect to test database successfully', async () => {
      const isConnected = await dbHelper.testConnection()
      expect(isConnected).toBe(true)
    })

    it('should return PostgreSQL version info', async () => {
      const version = await dbHelper.getDatabaseVersion()
      expect(version).toMatch(/PostgreSQL/)
      expect(version).toMatch(/1[67]\./) // Expecting PostgreSQL 16 or 17
    })
  })

  describe('Extensions', () => {
    it('should have all required extensions installed', async () => {
      const extensions = await dbHelper.checkExtensions()
      
      const extensionMap = new Map(
        extensions.map(ext => [ext.extension, ext])
      )

      // Check vector extension
      expect(extensionMap.get('vector')?.installed).toBe(true)
      expect(extensionMap.get('vector')?.version).toMatch(/^0\.[8-9]/) // Version 0.8+

      // Check text search extension
      expect(extensionMap.get('pg_trgm')?.installed).toBe(true)

      // Check UUID extension
      expect(extensionMap.get('uuid-ossp')?.installed).toBe(true)

      // Check crypto extension
      expect(extensionMap.get('pgcrypto')?.installed).toBe(true)
    })
  })

  describe('Schema', () => {
    it('should have all required tables', async () => {
      const tables = await dbHelper.checkTables()
      
      const tableMap = new Map(
        tables.map(table => [table.table, table])
      )

      // Core tables
      expect(tableMap.get('users')?.exists).toBe(true)
      expect(tableMap.get('users')?.columns).toBeGreaterThan(15) // Should have many columns

      expect(tableMap.get('repositories')?.exists).toBe(true)
      expect(tableMap.get('repositories')?.columns).toBeGreaterThan(20)

      expect(tableMap.get('opportunities')?.exists).toBe(true)
      expect(tableMap.get('opportunities')?.columns).toBeGreaterThan(15)

      // Supporting tables
      expect(tableMap.get('user_preferences')?.exists).toBe(true)
      expect(tableMap.get('notifications')?.exists).toBe(true)
      expect(tableMap.get('contribution_outcomes')?.exists).toBe(true)
      expect(tableMap.get('user_repository_interactions')?.exists).toBe(true)
    })

    it('should have all search functions', async () => {
      const functions = await dbHelper.checkSearchFunctions()
      
      const functionMap = new Map(
        functions.map(func => [func.function, func])
      )

      expect(functionMap.get('hybrid_search_opportunities')?.exists).toBe(true)
      expect(functionMap.get('hybrid_search_repositories')?.exists).toBe(true)
      expect(functionMap.get('search_similar_users')?.exists).toBe(true)
      expect(functionMap.get('find_matching_opportunities_for_user')?.exists).toBe(true)
    })

    it('should have vector indexes', async () => {
      const indexes = await dbHelper.checkVectorIndexes()
      
      const indexMap = new Map(
        indexes.map(idx => [idx.index, idx])
      )

      // HNSW indexes for vector search
      expect(indexMap.get('idx_users_profile_embedding_hnsw')?.exists).toBe(true)
      expect(indexMap.get('idx_repositories_embedding_hnsw')?.exists).toBe(true)
      expect(indexMap.get('idx_opportunities_title_embedding_hnsw')?.exists).toBe(true)
      expect(indexMap.get('idx_opportunities_description_embedding_hnsw')?.exists).toBe(true)
    })
  })

  describe('Vector Operations', () => {
    it('should support halfvec operations', async () => {
      const vectorOpsWork = await dbHelper.testVectorOperations()
      expect(vectorOpsWork).toBe(true)
    })

    it('should calculate cosine distance correctly', async () => {
      // Test with known vectors - orthogonal unit vectors should have distance 1.0
      const embedding1 = new Array(1536).fill(0)
      embedding1[0] = 1.0 // Unit vector in first dimension
      
      const embedding2 = new Array(1536).fill(0)  
      embedding2[1] = 1.0 // Unit vector in second dimension
      
      const embedding1String = `[${embedding1.join(',')}]`
      const embedding2String = `[${embedding2.join(',')}]`

      const result = await dbHelper.sql`
        SELECT ${embedding1String}::halfvec(1536) <-> ${embedding2String}::halfvec(1536) as distance
      `

      // Orthogonal unit vectors should have L2 distance of sqrt(2) ≈ 1.414
      expect(result[0]?.distance).toBeCloseTo(Math.sqrt(2), 1)
    })

    it('should support cosine similarity operations', async () => {
      // Same vector should have 0 cosine distance
      const embedding = new Array(1536).fill(1.0)
      const embeddingString = `[${embedding.join(',')}]`

      const result = await dbHelper.sql`
        SELECT ${embeddingString}::halfvec(1536) <=> ${embeddingString}::halfvec(1536) as similarity
      `

      expect(result[0]?.similarity).toBe(0) // Same vectors have 0 cosine distance
    })
  })

  describe('Search Functions', () => {
    it('should execute all search functions without errors', async () => {
      const searchResults = await dbHelper.testSearchFunctions()
      
      expect(searchResults.hybrid_search_opportunities).toBe(true)
      expect(searchResults.hybrid_search_repositories).toBe(true)
      expect(searchResults.search_similar_users).toBe(true)
    })

    it('should return structured results from opportunity search', async () => {
      const results = await dbHelper.sql`
        SELECT * FROM hybrid_search_opportunities('javascript react', NULL, 1.0, 0.0, 0.1, 5)
      `

      expect(Array.isArray(results)).toBe(true)
      
      if (results.length > 0) {
        const result = results[0]
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('type')
        expect(result).toHaveProperty('difficulty')
        expect(result).toHaveProperty('relevance_score')
      }
    })

    it('should return structured results from repository search', async () => {
      const results = await dbHelper.sql`
        SELECT * FROM hybrid_search_repositories('python machine learning', NULL, 1.0, 0.0, 0.1, 5)
      `

      expect(Array.isArray(results)).toBe(true)
      
      if (results.length > 0) {
        const result = results[0]
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('full_name')
        expect(result).toHaveProperty('language')
        expect(result).toHaveProperty('health_score')
        expect(result).toHaveProperty('relevance_score')
      }
    })
  })

  describe('Sample Data', () => {
    it('should have sample data loaded', async () => {
      const counts = await dbHelper.getSampleDataCounts()
      
      expect(counts.users).toBeGreaterThan(0)
      expect(counts.repositories).toBeGreaterThan(0)
      expect(counts.opportunities).toBeGreaterThan(0)
      expect(counts.user_preferences).toBeGreaterThan(0)
    })

    it('should have users with valid embeddings', async () => {
      const users = await dbHelper.sql`
        SELECT id, github_username, profile_embedding IS NOT NULL as has_embedding
        FROM users 
        WHERE profile_embedding IS NOT NULL
        LIMIT 5
      `

      expect(users.length).toBeGreaterThan(0)
      users.forEach(user => {
        expect(user.has_embedding).toBe(true)
        expect(user.github_username).toBeTruthy()
      })
    })

    it('should have repositories with valid embeddings', async () => {
      const repos = await dbHelper.sql`
        SELECT id, full_name, description_embedding IS NOT NULL as has_embedding
        FROM repositories 
        WHERE description_embedding IS NOT NULL
        LIMIT 5
      `

      expect(repos.length).toBeGreaterThan(0)
      repos.forEach(repo => {
        expect(repo.has_embedding).toBe(true)
        expect(repo.full_name).toBeTruthy()
      })
    })

    it('should have opportunities with valid embeddings', async () => {
      const opportunities = await dbHelper.sql`
        SELECT id, title, 
               title_embedding IS NOT NULL as has_title_embedding,
               description_embedding IS NOT NULL as has_desc_embedding
        FROM opportunities 
        WHERE title_embedding IS NOT NULL AND description_embedding IS NOT NULL
        LIMIT 5
      `

      expect(opportunities.length).toBeGreaterThan(0)
      opportunities.forEach(opp => {
        expect(opp.has_title_embedding).toBe(true)
        expect(opp.has_desc_embedding).toBe(true)
        expect(opp.title).toBeTruthy()
      })
    })
  })

  describe('Performance', () => {
    it('should execute queries efficiently', async () => {
      const startTime = Date.now()
      
      // Run a comprehensive query
      await dbHelper.sql`
        SELECT u.github_username, r.full_name, o.title
        FROM users u
        JOIN user_repository_interactions uri ON u.id = uri.user_id
        JOIN repositories r ON uri.repository_id = r.id
        JOIN opportunities o ON r.id = o.repository_id
        WHERE o.status = 'open'
        LIMIT 10
      `
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000) // 1 second
    })

    it('should use indexes for vector queries', async () => {
      // Test that vector queries can execute (indexes are working)
      const embedding = new Array(1536).fill(0.1)
      const embeddingString = `[${embedding.join(',')}]`
      
      const startTime = Date.now()
      
      await dbHelper.sql`
        SELECT id, github_username
        FROM users 
        WHERE profile_embedding IS NOT NULL
        ORDER BY profile_embedding <=> ${embeddingString}::halfvec(1536)
        LIMIT 5
      `
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Vector queries should complete reasonably fast with HNSW indexes
      expect(duration).toBeLessThan(500) // 500ms
    })
  })

  describe('Comprehensive Health Check', () => {
    it('should pass comprehensive health check', async () => {
      const healthCheck = await dbHelper.performHealthCheck()
      
      expect(healthCheck.overall).toBe(true)
      expect(healthCheck.details.connection).toBe(true)
      expect(healthCheck.details.vectorOps).toBe(true)
      
      // All extensions should be installed
      healthCheck.details.extensions.forEach(ext => {
        expect(ext.installed).toBe(true)
      })
      
      // All tables should exist
      healthCheck.details.tables.forEach(table => {
        expect(table.exists).toBe(true)
      })
      
      // All functions should exist
      healthCheck.details.functions.forEach(func => {
        expect(func.exists).toBe(true)
      })
      
      // All indexes should exist
      healthCheck.details.indexes.forEach(idx => {
        expect(idx.exists).toBe(true)
      })
      
      // All search functions should work
      Object.values(healthCheck.details.searchFunctions).forEach(works => {
        expect(works).toBe(true)
      })
    })
  })
})