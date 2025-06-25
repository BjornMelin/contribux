/**
 * Modern Database Testing Examples
 *
 * Demonstrates the new PGlite + Neon branching testing infrastructure.
 * Shows automatic database strategy selection and modern testing patterns.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createTestFactories } from '../../src/lib/test-utils/database-factories'
import type { DatabaseConnection } from '../../src/lib/test-utils/test-database-manager'
import { getTestDatabase } from '../../src/lib/test-utils/test-database-manager'

describe('Modern Database Testing Infrastructure', () => {
  let db: DatabaseConnection
  let factories: ReturnType<typeof createTestFactories>

  beforeEach(async () => {
    // Automatically chooses PGlite for speed in CI, Neon branching locally
    db = await getTestDatabase('modern-db-test', {
      ...(process.env.CI ? { strategy: 'pglite' as const } : {}), // Force PGlite in CI
      cleanup: 'truncate',
      verbose: true,
    })

    factories = createTestFactories(db.sql)
  })

  describe('PGlite Ultra-Fast Testing', () => {
    it('should perform basic CRUD operations', async () => {
      const { sql } = db

      // Create test data
      const user = await factories.users.create({
        github_username: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
      })

      expect(user.id).toBeDefined()
      expect(user.github_username).toBe('test-user')

      // Query the data
      const [foundUser] = await sql`
        SELECT * FROM users WHERE id = ${user.id}
      `

      expect(foundUser).toBeDefined()
      expect(foundUser?.email).toBe('test@example.com')
    })

    it('should handle vector operations', async () => {
      const { sql } = db

      // Create repository and opportunities with embeddings
      const repo = await factories.repositories.create({
        name: 'vector-test-repo',
        language: 'TypeScript',
      })

      expect(repo.id).toBeDefined()
      const repoId = repo.id as string

      const _opportunities = await Promise.all([
        factories.opportunities.createForRepository(repoId, {
          title: 'Add TypeScript types',
          embedding: Array.from({ length: 1536 }, () => 0.5),
        }),
        factories.opportunities.createForRepository(repoId, {
          title: 'Fix TypeScript errors',
          embedding: Array.from({ length: 1536 }, () => 0.6),
        }),
        factories.opportunities.createForRepository(repoId, {
          title: 'Add Python script',
          embedding: Array.from({ length: 1536 }, () => -0.5),
        }),
      ])

      // Test vector similarity search
      const searchEmbedding = Array.from({ length: 1536 }, () => 0.55)
      const similarOpportunities = await sql`
        SELECT 
          title,
          embedding <=> ${JSON.stringify(searchEmbedding)} as distance
        FROM opportunities 
        WHERE repository_id = ${repoId}
        ORDER BY distance ASC
        LIMIT 2
      `

      expect(similarOpportunities).toHaveLength(2)
      expect(similarOpportunities[0]?.title).toContain('TypeScript')
      expect(similarOpportunities[0]?.distance).toBeLessThan(similarOpportunities[1]?.distance)
    })

    it('should support complex queries and joins', async () => {
      const { sql } = db

      // Create complete test scenario
      const scenario = await factories.createCompleteScenario()

      expect(scenario.users).toHaveLength(3)
      expect(scenario.repositories).toHaveLength(5)
      expect(scenario.opportunities.length).toBeGreaterThan(10)

      // Test complex query with joins
      const results = await sql`
        SELECT 
          o.title,
          o.difficulty,
          r.name as repo_name,
          r.language,
          r.stars
        FROM opportunities o
        JOIN repositories r ON o.repository_id = r.id
        WHERE r.language = 'TypeScript'
        ORDER BY r.stars DESC, o.score DESC
        LIMIT 5
      `

      expect(results.length).toBeGreaterThan(0)
      for (const result of results) {
        expect(result.repo_name).toBeDefined()
        expect(result.title).toBeDefined()
        expect(['beginner', 'intermediate', 'advanced']).toContain(result.difficulty)
      }
    })
  })

  describe('Performance Benchmarking', () => {
    it('should benchmark database operations', async () => {
      const { sql } = db

      // Create performance test data
      console.log('🔄 Creating performance test dataset...')
      const perfScenario = await factories.createPerformanceTestScenario()

      expect(perfScenario.repositories).toHaveLength(20)
      expect(perfScenario.opportunities.length).toBe(20 * 50) // 1000 opportunities

      // Benchmark queries
      const benchmarks = [
        {
          name: 'Simple SELECT',
          fn: async () => {
            const results = await sql`SELECT COUNT(*) FROM opportunities`
            expect(Number(results[0]?.count)).toBe(1000)
          },
        },
        {
          name: 'Complex JOIN with filtering',
          fn: async () => {
            const results = await sql`
              SELECT o.*, r.name as repo_name
              FROM opportunities o
              JOIN repositories r ON o.repository_id = r.id
              WHERE o.difficulty = 'intermediate'
              AND r.stars > 100
              ORDER BY o.score DESC
              LIMIT 10
            `
            expect(results.length).toBeLessThanOrEqual(10)
          },
        },
        {
          name: 'Vector similarity search',
          fn: async () => {
            const searchVector = Array.from({ length: 1536 }, () => Math.random())
            const results = await sql`
              SELECT id, title, embedding <=> ${JSON.stringify(searchVector)} as distance
              FROM opportunities
              ORDER BY distance ASC
              LIMIT 5
            `
            expect(results).toHaveLength(5)
            expect(results[0]?.distance).toBeDefined()
          },
        },
      ]

      // Run benchmarks
      for (const benchmark of benchmarks) {
        const start = performance.now()
        await benchmark.fn()
        const duration = performance.now() - start

        console.log(`⏱️  ${benchmark.name}: ${duration.toFixed(2)}ms`)

        // PGlite should be very fast
        if (db.strategy === 'pglite') {
          expect(duration).toBeLessThan(100) // Should complete in under 100ms
        }
      }
    })
  })

  describe('Transaction Rollback Testing', () => {
    it('should support transaction rollback for isolation', async () => {
      const { sql } = db

      // Create initial data
      const _user = await factories.users.create({
        github_username: 'transaction-user',
        email: 'transaction@example.com',
      })

      const initialCount = await sql`SELECT COUNT(*) FROM users`
      expect(Number(initialCount[0]?.count)).toBe(1)

      // Test transaction rollback (manual for demonstration)
      try {
        await sql`BEGIN`

        // Add more users in transaction
        await factories.users.create({ email: 'temp1@example.com' })
        await factories.users.create({ email: 'temp2@example.com' })

        const transactionCount = await sql`SELECT COUNT(*) FROM users`
        expect(Number(transactionCount[0]?.count)).toBe(3)

        // Rollback transaction
        await sql`ROLLBACK`

        // Should be back to original count
        const finalCount = await sql`SELECT COUNT(*) FROM users`
        expect(Number(finalCount[0]?.count)).toBe(1)
      } catch (error) {
        await sql`ROLLBACK`
        throw error
      }
    })
  })

  describe('Database Strategy Information', () => {
    it('should provide information about the database strategy used', () => {
      expect(db.strategy).toBeOneOf(['pglite', 'neon-branch', 'neon-transaction'])
      expect(db.info.performance).toBeOneOf(['ultra-fast', 'fast', 'production-like'])

      console.log(`🔗 Using ${db.strategy} strategy (${db.info.performance})`)

      if (db.strategy === 'pglite') {
        expect(db.info.performance).toBe('ultra-fast')
      } else if (db.strategy === 'neon-branch') {
        expect(db.info.performance).toBe('production-like')
        expect(db.info.branchId).toBeDefined()
        expect(db.info.connectionString).toContain('neon.tech')
      }
    })
  })

  describe('Real-world Data Patterns', () => {
    it('should handle realistic contribution opportunity scenarios', async () => {
      const { sql } = db

      // Create AI/ML testing scenario with vector similarity
      const vectorScenario = await factories.createVectorTestScenario()

      expect(vectorScenario.repository.language).toBe('Python')
      expect(vectorScenario.opportunities).toHaveLength(3)

      // Test semantic similarity search for ML opportunities
      const mlQuery = Array.from({ length: 1536 }, () => 0.5) // Similar to first two opportunities

      const semanticallyRelated = await sql`
        SELECT 
          title,
          skills_required,
          embedding <=> ${JSON.stringify(mlQuery)} as similarity
        FROM opportunities
        WHERE repository_id = ${vectorScenario.repository.id}
        ORDER BY similarity ASC
      `

      expect(semanticallyRelated).toHaveLength(3)

      // First two should be ML-related and closer
      expect(semanticallyRelated[0]?.title).toContain('neural network')
      expect(semanticallyRelated[1]?.title).toContain('preprocessing')
      expect(semanticallyRelated[2]?.title).toContain('visualization')

      // Similarity scores should make sense
      expect(semanticallyRelated[0]?.similarity).toBeLessThan(semanticallyRelated[2]?.similarity)
      expect(semanticallyRelated[1]?.similarity).toBeLessThan(semanticallyRelated[2]?.similarity)
    })

    it('should support user personalization patterns', async () => {
      const { sql } = db

      // Create user with specific skills
      const _user = await factories.users.createWithSkills(['TypeScript', 'React', 'Node.js'], {
        github_username: 'typescript-expert',
        preferences: {
          difficulty: 'advanced',
          languages: ['TypeScript', 'JavaScript'],
          timeCommitment: 'weekend',
        },
      })

      // Create opportunities that match user skills
      const repo = await factories.repositories.createWithLanguage('TypeScript')
      expect(repo.id).toBeDefined()
      const repoId = repo.id as string

      const _opportunities = await Promise.all([
        factories.opportunities.createForRepository(repoId, {
          title: 'Refactor TypeScript types',
          difficulty: 'advanced',
          skills_required: ['TypeScript', 'React'],
          estimated_hours: 8,
        }),
        factories.opportunities.createForRepository(repoId, {
          title: 'Add Python data processing',
          difficulty: 'intermediate',
          skills_required: ['Python', 'Pandas'],
          estimated_hours: 12,
        }),
      ])

      // Test personalized opportunity matching
      const personalizedOpportunities = await sql`
        SELECT 
          o.*,
          r.language,
          CASE 
            WHEN o.skills_required::jsonb ?& ARRAY['TypeScript', 'React', 'Node.js'] THEN 'high'
            WHEN o.skills_required::jsonb ?| ARRAY['TypeScript', 'React', 'Node.js'] THEN 'medium'
            ELSE 'low'
          END as skill_match
        FROM opportunities o
        JOIN repositories r ON o.repository_id = r.id
        WHERE r.id = ${repoId}
        ORDER BY 
          CASE 
            WHEN o.skills_required::jsonb ?& ARRAY['TypeScript', 'React', 'Node.js'] THEN 3
            WHEN o.skills_required::jsonb ?| ARRAY['TypeScript', 'React', 'Node.js'] THEN 2
            ELSE 1
          END DESC,
          o.score DESC
      `

      expect(personalizedOpportunities).toHaveLength(2)
      expect(personalizedOpportunities[0]?.skill_match).toBe('high') // TypeScript + React match
      expect(personalizedOpportunities[1]?.skill_match).toBe('low') // No skill match
      expect(personalizedOpportunities[0]?.title).toContain('TypeScript')
    })
  })
})
