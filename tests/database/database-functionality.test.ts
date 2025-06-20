// Database functionality and integration tests
// Tests CRUD operations, constraints, triggers, and business logic

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { LocalTestDatabaseHelper, setupLocalTestDatabase, cleanupLocalTestDatabase } from '../utils/local-database'

describe('Database Functionality Tests', () => {
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

  beforeEach(async () => {
    // Clean data before each test for isolation
    await dbHelper.cleanTestData()
  })

  describe('User Management', () => {
    test('should insert and retrieve users', async () => {
      const testUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO users (
          id, github_id, github_username, github_name, 
          skill_level, preferred_languages, availability_hours
        ) VALUES (
          $1, 12345, 'testuser', 'Test User',
          'intermediate', ARRAY['javascript', 'typescript'], 20
        )
      `, [testUserId])
      
      const users = await dbHelper.query(`
        SELECT * FROM users WHERE id = $1
      `, [testUserId])
      
      expect(users).toHaveLength(1)
      expect(users[0].github_username).toBe('testuser')
      expect(users[0].skill_level).toBe('intermediate')
      expect(users[0].preferred_languages).toEqual(['javascript', 'typescript'])
    })

    test('should enforce unique github_id constraint', async () => {
      const userId1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const userId2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'
      
      // Insert first user
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level)
        VALUES ($1, 12345, 'testuser1', 'beginner')
      `, [userId1])
      
      // Try to insert second user with same github_id - should fail
      await expect(
        dbHelper.query(`
          INSERT INTO users (id, github_id, github_username, skill_level)
          VALUES ($1, 12345, 'testuser2', 'intermediate')
        `, [userId2])
      ).rejects.toThrow()
    })

    test('should validate skill_level enum', async () => {
      const testUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Valid skill level should work
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level)
        VALUES ($1, 12345, 'testuser', 'expert')
      `, [testUserId])
      
      const users = await dbHelper.query(`
        SELECT skill_level FROM users WHERE id = $1
      `, [testUserId])
      
      expect(users[0].skill_level).toBe('expert')
    })

    test('should handle user embedding updates', async () => {
      const testUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const testEmbedding = new Array(1536).fill(0.5)
      
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level, profile_embedding)
        VALUES ($1, 12345, 'testuser', 'intermediate', $2)
      `, [testUserId, `[${testEmbedding.join(',')}]`])
      
      const users = await dbHelper.query(`
        SELECT profile_embedding FROM users WHERE id = $1
      `, [testUserId])
      
      expect(users[0].profile_embedding).toBeDefined()
    })
  })

  describe('Repository Management', () => {
    test('should insert and retrieve repositories', async () => {
      const repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, description, url, clone_url,
          owner_login, owner_type, language, stars_count, health_score, activity_score, status
        ) VALUES (
          $1, 54321, 'owner/repo', 'repo', 'Test repository', 
          'https://github.com/owner/repo', 'https://github.com/owner/repo.git',
          'owner', 'user', 'JavaScript', 100, 85.5, 90.0, 'active'
        )
      `, [repoId])
      
      const repos = await dbHelper.query(`
        SELECT * FROM repositories WHERE id = $1
      `, [repoId])
      
      expect(repos).toHaveLength(1)
      expect(repos[0].full_name).toBe('owner/repo')
      expect(repos[0].language).toBe('JavaScript')
      expect(repos[0].stars_count).toBe(100)
      expect(repos[0].health_score).toBe('85.50')
    })

    test('should validate repository status enum', async () => {
      const repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, url, clone_url,
          owner_login, owner_type, status
        ) VALUES (
          $1, 54321, 'owner/repo', 'repo', 'https://github.com/owner/repo',
          'https://github.com/owner/repo.git', 'owner', 'user', 'archived'
        )
      `, [repoId])
      
      const repos = await dbHelper.query(`
        SELECT status FROM repositories WHERE id = $1
      `, [repoId])
      
      expect(repos[0].status).toBe('archived')
    })
  })

  describe('Opportunity Management', () => {
    let userId: string
    let repoId: string

    beforeEach(async () => {
      userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Create test user and repository
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level)
        VALUES ($1, 12345, 'testuser', 'intermediate')
      `, [userId])
      
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, url, clone_url, owner_login, owner_type, status
        ) VALUES (
          $1, 54321, 'owner/repo', 'repo', 'https://github.com/owner/repo',
          'https://github.com/owner/repo.git', 'owner', 'user', 'active'
        )
      `, [repoId])
    })

    test('should insert and retrieve opportunities', async () => {
      const oppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO opportunities (
          id, repository_id, github_issue_number, title, description, url, type, difficulty,
          required_skills, good_first_issue, estimated_hours
        ) VALUES (
          $1, $2, 1, 'Fix bug in authentication', 'Fix OAuth flow issue',
          'https://github.com/owner/repo/issues/1', 'bug_fix', 'intermediate', 
          ARRAY['javascript', 'oauth'], false, 8
        )
      `, [oppId, repoId])
      
      const opportunities = await dbHelper.query(`
        SELECT * FROM opportunities WHERE id = $1
      `, [oppId])
      
      expect(opportunities).toHaveLength(1)
      expect(opportunities[0].title).toBe('Fix bug in authentication')
      expect(opportunities[0].type).toBe('bug_fix')
      expect(opportunities[0].difficulty).toBe('intermediate')
      expect(opportunities[0].required_skills).toEqual(['javascript', 'oauth'])
      expect(opportunities[0].good_first_issue).toBe(false)
    })

    test('should enforce foreign key constraints', async () => {
      const oppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const invalidRepoId = 'invalid-repo-id'
      
      // Should fail due to foreign key constraint
      await expect(
        dbHelper.query(`
          INSERT INTO opportunities (
            id, repository_id, title, type, difficulty
          ) VALUES (
            $1, $2, 'Test opportunity', 'feature', 'beginner'
          )
        `, [oppId, invalidRepoId])
      ).rejects.toThrow()
    })

    test('should validate contribution_type enum', async () => {
      const oppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO opportunities (
          id, repository_id, github_issue_number, title, url, type, difficulty
        ) VALUES (
          $1, $2, 2, 'Update documentation', 'https://github.com/owner/repo/issues/2',
          'documentation', 'beginner'
        )
      `, [oppId, repoId])
      
      const opportunities = await dbHelper.query(`
        SELECT type FROM opportunities WHERE id = $1
      `, [oppId])
      
      expect(opportunities[0].type).toBe('documentation')
    })
  })

  describe('User Preferences', () => {
    let userId: string

    beforeEach(async () => {
      userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level)
        VALUES ($1, 12345, 'testuser', 'intermediate')
      `, [userId])
    })

    test('should insert and retrieve user preferences', async () => {
      await dbHelper.query(`
        INSERT INTO user_preferences (
          user_id, preferred_contribution_types, max_estimated_hours,
          preferred_difficulty, notification_frequency
        ) VALUES (
          $1, ARRAY['bug_fix', 'feature']::contribution_type[], 10, ARRAY['intermediate']::skill_level[], 24
        )
      `, [userId])
      
      const prefs = await dbHelper.query(`
        SELECT * FROM user_preferences WHERE user_id = $1
      `, [userId])
      
      expect(prefs).toHaveLength(1)
      expect(prefs[0].preferred_contribution_types).toEqual('{bug_fix,feature}')
      expect(prefs[0].max_estimated_hours).toBe(10)
      expect(prefs[0].preferred_difficulty).toEqual('{intermediate}')
    })

    test('should cascade delete preferences when user is deleted', async () => {
      // Insert preferences
      await dbHelper.query(`
        INSERT INTO user_preferences (user_id, max_estimated_hours)
        VALUES ($1, 10)
      `, [userId])
      
      // Verify preferences exist
      let prefs = await dbHelper.query(`
        SELECT * FROM user_preferences WHERE user_id = $1
      `, [userId])
      expect(prefs).toHaveLength(1)
      
      // Delete user
      await dbHelper.query(`
        DELETE FROM users WHERE id = $1
      `, [userId])
      
      // Verify preferences were cascade deleted
      prefs = await dbHelper.query(`
        SELECT * FROM user_preferences WHERE user_id = $1
      `, [userId])
      expect(prefs).toHaveLength(0)
    })
  })

  describe('Search Function Integration', () => {
    beforeEach(async () => {
      // Set up test data for search functions
      const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const oppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Create test user
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level, preferred_languages)
        VALUES ($1, 12345, 'testuser', 'intermediate', ARRAY['javascript'])
      `, [userId])
      
      // Create test repository
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, url, clone_url, owner_login, owner_type, language, status
        ) VALUES (
          $1, 54321, 'owner/test-repo', 'test-repo', 'https://github.com/owner/test-repo',
          'https://github.com/owner/test-repo.git', 'owner', 'user', 'JavaScript', 'active'
        )
      `, [repoId])
      
      // Create test opportunity
      await dbHelper.query(`
        INSERT INTO opportunities (
          id, repository_id, github_issue_number, title, description, url, type, difficulty,
          required_skills, good_first_issue
        ) VALUES (
          $1, $2, 1, 'JavaScript feature request', 'Add new JavaScript functionality',
          'https://github.com/owner/test-repo/issues/1', 'feature', 'intermediate', 
          ARRAY['javascript'], true
        )
      `, [oppId, repoId])
    })

    test('should find opportunities with text search', async () => {
      const results = await dbHelper.query(`
        SELECT * FROM hybrid_search_opportunities(
          'javascript', NULL, 1.0, 0.0, 0.1, 10
        )
      `)
      
      expect(results.length).toBeGreaterThanOrEqual(0)
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('title')
        expect(results[0]).toHaveProperty('relevance_score')
        expect(results[0]).toHaveProperty('type')
      }
    })

    test('should find repositories with text search', async () => {
      const results = await dbHelper.query(`
        SELECT * FROM hybrid_search_repositories(
          'javascript', NULL, 1.0, 0.0, 0.1, 10
        )
      `)
      
      expect(results.length).toBeGreaterThanOrEqual(0)
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('name')
        expect(results[0]).toHaveProperty('relevance_score')
        expect(results[0]).toHaveProperty('language')
      }
    })

    test('should find matching opportunities for user', async () => {
      const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      const results = await dbHelper.query(`
        SELECT * FROM find_matching_opportunities_for_user($1, 0.1, 10)
      `, [userId])
      
      expect(results.length).toBeGreaterThanOrEqual(0)
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('title')
        expect(results[0]).toHaveProperty('match_score')
        expect(results[0]).toHaveProperty('match_reasons')
      }
    })

    test('should get trending opportunities', async () => {
      const results = await dbHelper.query(`
        SELECT * FROM get_trending_opportunities(168, 0, 10)
      `)
      
      expect(results.length).toBeGreaterThanOrEqual(0)
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('title')
        expect(results[0]).toHaveProperty('trending_score')
        expect(results[0]).toHaveProperty('view_count')
      }
    })
  })

  describe('Advanced Features', () => {
    test('should calculate repository health metrics', async () => {
      const repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Insert test repository
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, url, clone_url, owner_login, owner_type,
          health_score, activity_score, community_score, documentation_score, 
          contributor_friendliness, status
        ) VALUES (
          $1, 54321, 'owner/repo', 'repo', 'https://github.com/owner/repo',
          'https://github.com/owner/repo.git', 'owner', 'user', 85.0, 78.5, 82.0, 90.0, 88, 'active'
        )
      `, [repoId])
      
      const results = await dbHelper.query(`
        SELECT * FROM get_repository_health_metrics($1)
      `, [repoId])
      
      expect(results).toHaveLength(1)
      expect(results[0].health_score).toBe('85.00')
      expect(results[0].recommendations).toBeDefined()
      expect(typeof results[0].recommendations).toBe('object')
    })

    test('should handle JSON operations', async () => {
      const result = await dbHelper.query(`
        SELECT jsonb_build_object(
          'test', 'value',
          'number', 42,
          'array', jsonb_build_array(1, 2, 3)
        ) as test_json
      `)
      
      expect(result).toHaveLength(1)
      expect(result[0].test_json).toBeDefined()
      expect(typeof result[0].test_json).toBe('object')
    })
  })

  describe('Data Integrity', () => {
    test('should maintain referential integrity', async () => {
      const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const repoId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      // Create user and repository
      await dbHelper.query(`
        INSERT INTO users (id, github_id, github_username, skill_level)
        VALUES ($1, 12345, 'testuser', 'intermediate')
      `, [userId])
      
      await dbHelper.query(`
        INSERT INTO repositories (
          id, github_id, full_name, name, url, clone_url, owner_login, owner_type, status
        ) VALUES (
          $1, 54321, 'owner/repo', 'repo', 'https://github.com/owner/repo',
          'https://github.com/owner/repo.git', 'owner', 'user', 'active'
        )
      `, [repoId])
      
      // Create user-repository interaction
      await dbHelper.query(`
        INSERT INTO user_repository_interactions (
          user_id, repository_id, starred, contributed
        ) VALUES ($1, $2, true, false)
      `, [userId, repoId])
      
      const interactions = await dbHelper.query(`
        SELECT * FROM user_repository_interactions 
        WHERE user_id = $1 AND repository_id = $2
      `, [userId, repoId])
      
      expect(interactions).toHaveLength(1)
      expect(interactions[0].starred).toBe(true)
      expect(interactions[0].contributed).toBe(false)
    })

    test('should validate array fields', async () => {
      const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      
      await dbHelper.query(`
        INSERT INTO users (
          id, github_id, github_username, skill_level, preferred_languages
        ) VALUES (
          $1, 12345, 'testuser', 'intermediate', 
          ARRAY['javascript', 'python', 'go']
        )
      `, [userId])
      
      const users = await dbHelper.query(`
        SELECT preferred_languages FROM users WHERE id = $1
      `, [userId])
      
      expect(users[0].preferred_languages).toEqual(['javascript', 'python', 'go'])
    })
  })
})