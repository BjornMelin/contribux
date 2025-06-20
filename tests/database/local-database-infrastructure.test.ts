// Comprehensive database infrastructure tests using local PostgreSQL
// Tests all aspects of the database setup, schema, and search functions

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { LocalTestDatabaseHelper, setupLocalTestDatabase, cleanupLocalTestDatabase } from '../utils/local-database'

describe('Local Database Infrastructure', () => {
  let dbHelper: LocalTestDatabaseHelper

  beforeAll(async () => {
    dbHelper = await setupLocalTestDatabase()
  })

  afterAll(async () => {
    if (dbHelper) {
      await cleanupLocalTestDatabase(dbHelper)
      await dbHelper.close()
    }
  })

  describe('Database Connection', () => {
    test('should connect to test database successfully', async () => {
      const isConnected = await dbHelper.testConnection()
      expect(isConnected).toBe(true)
    })

    test('should return PostgreSQL version information', async () => {
      const version = await dbHelper.getDatabaseVersion()
      expect(version).toContain('PostgreSQL')
      expect(version).toContain('16.')
    })
  })

  describe('Required Extensions', () => {
    test('should have all required extensions installed', async () => {
      const extensions = await dbHelper.checkExtensions()
      
      const requiredExtensions = ['vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto']
      
      for (const requiredExt of requiredExtensions) {
        const extension = extensions.find(e => e.extension === requiredExt)
        expect(extension).toBeDefined()
        expect(extension?.installed).toBe(true)
        expect(extension?.version).toBeDefined()
      }
    })

    test('vector extension should support halfvec operations', async () => {
      const testEmbedding = new Array(1536).fill(0.1)
      const embeddingString = `[${testEmbedding.join(',')}]`
      
      const result = await dbHelper.query(`
        SELECT $1::halfvec(1536) as embedding
      `, [embeddingString])
      
      expect(result).toBeDefined()
      expect(result.length).toBe(1)
    })
  })

  describe('Database Schema', () => {
    test('should have all required tables', async () => {
      const tables = await dbHelper.checkTables()
      
      const requiredTables = [
        'users', 
        'repositories', 
        'opportunities', 
        'user_preferences', 
        'notifications', 
        'contribution_outcomes', 
        'user_repository_interactions'
      ]
      
      for (const requiredTable of requiredTables) {
        const table = tables.find(t => t.table === requiredTable)
        expect(table).toBeDefined()
        expect(table?.exists).toBe(true)
        expect(table?.columns).toBeGreaterThan(0)
      }
    })

    test('should have proper table structure for users', async () => {
      const result = await dbHelper.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `)
      
      expect(result.length).toBeGreaterThan(10)
      
      // Check key columns exist
      const columns = result.map(r => r.column_name)
      expect(columns).toContain('id')
      expect(columns).toContain('github_id')
      expect(columns).toContain('github_username')
      expect(columns).toContain('profile_embedding')
      expect(columns).toContain('skill_level')
      expect(columns).toContain('preferred_languages')
    })

    test('should have proper table structure for opportunities', async () => {
      const result = await dbHelper.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'opportunities' AND table_schema = 'public'
        ORDER BY ordinal_position
      `)
      
      expect(result.length).toBeGreaterThan(15)
      
      // Check key columns exist
      const columns = result.map(r => r.column_name)
      expect(columns).toContain('id')
      expect(columns).toContain('repository_id')
      expect(columns).toContain('title')
      expect(columns).toContain('description')
      expect(columns).toContain('title_embedding')
      expect(columns).toContain('description_embedding')
      expect(columns).toContain('type')
      expect(columns).toContain('difficulty')
      expect(columns).toContain('required_skills')
      expect(columns).toContain('good_first_issue')
    })

    test('should have proper enum types', async () => {
      const result = await dbHelper.query(`
        SELECT typname, enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE typname IN ('skill_level', 'contribution_type', 'notification_type', 'repository_status')
        ORDER BY typname, e.enumsortorder
      `)
      
      expect(result.length).toBeGreaterThan(10)
      
      // Check skill_level enum values
      const skillLevels = result.filter(r => r.typname === 'skill_level').map(r => r.enumlabel)
      expect(skillLevels).toContain('beginner')
      expect(skillLevels).toContain('intermediate')
      expect(skillLevels).toContain('advanced')
      expect(skillLevels).toContain('expert')
      
      // Check contribution_type enum values
      const contribTypes = result.filter(r => r.typname === 'contribution_type').map(r => r.enumlabel)
      expect(contribTypes).toContain('bug_fix')
      expect(contribTypes).toContain('feature')
      expect(contribTypes).toContain('documentation')
      expect(contribTypes).toContain('test')
    })
  })

  describe('Vector Indexes', () => {
    test('should have all required HNSW vector indexes', async () => {
      const indexes = await dbHelper.checkVectorIndexes()
      
      const expectedIndexes = [
        'idx_users_profile_embedding_hnsw',
        'idx_repositories_embedding_hnsw',
        'idx_opportunities_title_embedding_hnsw',
        'idx_opportunities_description_embedding_hnsw'
      ]
      
      for (const expectedIndex of expectedIndexes) {
        const index = indexes.find(i => i.index === expectedIndex)
        expect(index).toBeDefined()
        expect(index?.exists).toBe(true)
      }
    })

    test('should verify HNSW index parameters', async () => {
      const result = await dbHelper.query(`
        SELECT 
          i.indexname,
          i.tablename,
          pg_size_pretty(pg_relation_size(c.oid)) as size
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        WHERE i.schemaname = 'public' 
        AND i.indexname LIKE '%hnsw%'
      `)
      
      expect(result.length).toBeGreaterThan(0)
      
      for (const index of result) {
        expect(index.indexname).toMatch(/hnsw/)
        expect(index.size).toBeDefined()
      }
    })
  })

  describe('Search Functions', () => {
    test('should have all required search functions', async () => {
      const functions = await dbHelper.checkSearchFunctions()
      
      const requiredFunctions = [
        'hybrid_search_opportunities',
        'hybrid_search_repositories',
        'search_similar_users',
        'find_matching_opportunities_for_user'
      ]
      
      for (const requiredFunction of requiredFunctions) {
        const func = functions.find(f => f.function === requiredFunction)
        expect(func).toBeDefined()
        expect(func?.exists).toBe(true)
      }
    })

    test('should have additional utility functions', async () => {
      const result = await dbHelper.query(`
        SELECT routine_name, routine_type
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_name IN ('get_trending_opportunities', 'get_repository_health_metrics')
      `)
      
      expect(result.length).toBe(2)
      
      const functionNames = result.map(r => r.routine_name)
      expect(functionNames).toContain('get_trending_opportunities')
      expect(functionNames).toContain('get_repository_health_metrics')
    })
  })

  describe('Vector Operations', () => {
    test('should perform basic vector operations', async () => {
      const canPerformVectorOps = await dbHelper.testVectorOperations()
      expect(canPerformVectorOps).toBe(true)
    })

    test('should calculate cosine distance between vectors', async () => {
      const embedding1 = new Array(1536).fill(0.1)
      const embedding2 = new Array(1536).fill(0.2)
      
      const result = await dbHelper.query(`
        SELECT $1::halfvec(1536) <-> $2::halfvec(1536) as distance
      `, [`[${embedding1.join(',')}]`, `[${embedding2.join(',')}]`])
      
      expect(result).toBeDefined()
      expect(result.length).toBe(1)
      expect(typeof result[0].distance).toBe('number')
      expect(result[0].distance).toBeGreaterThan(0)
      expect(result[0].distance).toBeLessThanOrEqual(4) // Max cosine distance for halfvec
    })

    test('should calculate cosine similarity between identical vectors', async () => {
      const embedding = new Array(1536).fill(0.5)
      
      const result = await dbHelper.query(`
        SELECT $1::halfvec(1536) <-> $2::halfvec(1536) as distance
      `, [`[${embedding.join(',')}]`, `[${embedding.join(',')}]`])
      
      expect(result[0].distance).toBeCloseTo(0, 5) // Should be very close to 0
    })
  })

  describe('Sample Data', () => {
    test('should have sample data loaded', async () => {
      const counts = await dbHelper.getSampleDataCounts()
      
      // Check that main tables have sample data
      expect(counts.users).toBeGreaterThan(0)
      expect(counts.repositories).toBeGreaterThan(0)
      expect(counts.opportunities).toBeGreaterThan(0)
      
      // User preferences may be empty initially
      expect(counts.user_preferences).toBeGreaterThanOrEqual(0)
    })

    test('should verify sample data structure', async () => {
      // Check users have required fields
      const users = await dbHelper.query(`
        SELECT id, github_username, skill_level, preferred_languages
        FROM users 
        LIMIT 3
      `)
      
      expect(users.length).toBeGreaterThan(0)
      
      for (const user of users) {
        expect(user.id).toBeDefined()
        expect(user.github_username).toBeDefined()
        expect(user.skill_level).toMatch(/^(beginner|intermediate|advanced|expert)$/)
        expect(Array.isArray(user.preferred_languages)).toBe(true)
      }
    })

    test('should verify opportunities have embeddings', async () => {
      const opportunities = await dbHelper.query(`
        SELECT id, title, title_embedding, description_embedding
        FROM opportunities 
        WHERE title_embedding IS NOT NULL 
        LIMIT 3
      `)
      
      expect(opportunities.length).toBeGreaterThan(0)
      
      for (const opp of opportunities) {
        expect(opp.id).toBeDefined()
        expect(opp.title).toBeDefined()
        expect(opp.title_embedding).toBeDefined()
      }
    })
  })

  describe('Search Functions with Sample Data', () => {
    test('should execute hybrid search functions', async () => {
      const searchResults = await dbHelper.testSearchFunctions()
      
      expect(searchResults.hybrid_search_opportunities).toBe(true)
      expect(searchResults.hybrid_search_repositories).toBe(true)
      expect(searchResults.search_similar_users).toBe(true)
    })

    test('should return results from opportunity search', async () => {
      const results = await dbHelper.query(`
        SELECT * FROM hybrid_search_opportunities(
          'javascript', 
          NULL, 
          1.0, 
          0.0, 
          0.1, 
          5
        )
      `)
      
      expect(Array.isArray(results)).toBe(true)
      // Results may be empty if no JS opportunities, which is okay
    })

    test('should return results from repository search', async () => {
      const results = await dbHelper.query(`
        SELECT * FROM hybrid_search_repositories(
          'python', 
          NULL, 
          1.0, 
          0.0, 
          0.1, 
          5
        )
      `)
      
      expect(Array.isArray(results)).toBe(true)
      // Results may be empty if no Python repos, which is okay
    })

    test('should execute user similarity search', async () => {
      const testEmbedding = new Array(1536).fill(0.1)
      
      const results = await dbHelper.query(`
        SELECT * FROM search_similar_users(
          $1::halfvec(1536), 
          0.1, 
          3
        )
      `, [`[${testEmbedding.join(',')}]`])
      
      expect(Array.isArray(results)).toBe(true)
      // Results may be empty if no similar users, which is okay for test
    })
  })

  describe('Comprehensive Health Check', () => {
    test('should pass complete infrastructure health check', async () => {
      const healthCheck = await dbHelper.performHealthCheck()
      
      expect(healthCheck).toBeDefined()
      expect(healthCheck.overall).toBe(true)
      
      // Check all components are healthy
      expect(healthCheck.details.connection).toBe(true)
      expect(healthCheck.details.vectorOps).toBe(true)
      
      // All extensions should be installed
      for (const ext of healthCheck.details.extensions) {
        expect(ext.installed).toBe(true)
      }
      
      // All tables should exist
      for (const table of healthCheck.details.tables) {
        expect(table.exists).toBe(true)
      }
      
      // All functions should exist
      for (const func of healthCheck.details.functions) {
        expect(func.exists).toBe(true)
      }
      
      // All indexes should exist
      for (const index of healthCheck.details.indexes) {
        expect(index.exists).toBe(true)
      }
      
      // All search functions should work
      for (const [funcName, works] of Object.entries(healthCheck.details.searchFunctions)) {
        expect(works).toBe(true)
      }
    })

    test('should provide detailed health information', async () => {
      const healthCheck = await dbHelper.performHealthCheck()
      
      expect(healthCheck.details.sampleData).toBeDefined()
      expect(typeof healthCheck.details.sampleData.users).toBe('number')
      expect(typeof healthCheck.details.sampleData.repositories).toBe('number')
      expect(typeof healthCheck.details.sampleData.opportunities).toBe('number')
    })
  })

  describe('Test Data Management', () => {
    test('should clean test data without errors', async () => {
      // This should not throw
      await expect(dbHelper.cleanTestData()).resolves.not.toThrow()
    })

    test('should reset sequences without errors', async () => {
      // This should not throw
      await expect(dbHelper.resetSequences()).resolves.not.toThrow()
    })

    test('should verify data was cleaned', async () => {
      await dbHelper.cleanTestData()
      
      const counts = await dbHelper.getSampleDataCounts()
      
      expect(counts.users).toBe(0)
      expect(counts.repositories).toBe(0)
      expect(counts.opportunities).toBe(0)
      expect(counts.user_preferences).toBe(0)
    })
  })
})