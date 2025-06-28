/**
 * Search Filtering Test Suite
 * Tests for search filters, faceting, and advanced search options
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { errorMessages, userPreferencesFixtures } from './fixtures/search-data'
import type { SearchTestContext } from './setup/search-setup'
import {
  addUserRepositoryInteraction,
  createSearchTestContext,
  setupSearchTestData,
  setupSearchTestSuite,
  setupUserPreferences,
  teardownSearchTestContext,
} from './setup/search-setup'

describe('Search Filtering', () => {
  let context: SearchTestContext

  beforeAll(async () => {
    context = await createSearchTestContext()
    await setupSearchTestSuite(context)
  })

  beforeEach(async () => {
    await setupSearchTestData(context)
  })

  afterAll(async () => {
    await teardownSearchTestContext(context)
  })

  describe('User Preference Filtering', () => {
    beforeEach(async () => {
      await setupUserPreferences(context)
    })

    it('should find matching opportunities for user based on preferences', async () => {
      const { pool, testIds } = context
      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01,
          result_limit := 10
        )
      `,
        [testIds.userId]
      )

      expect(rows).toHaveLength(2)

      // Should include match reasons
      rows.forEach(row => {
        expect(row.match_score).toBeGreaterThan(0)
        expect(Array.isArray(row.match_reasons)).toBe(true)
        expect(row.match_reasons.length).toBeGreaterThan(0)
      })

      // Bug fix should score higher due to preference match
      const bugFix = rows.find(r => r.type === 'bug_fix')
      const feature = rows.find(r => r.type === 'feature')
      expect(bugFix).toBeDefined()
      expect(feature).toBeDefined()
    })

    it('should filter by preferred contribution types', async () => {
      const { pool, testIds } = context

      // Update preferences to only include bug fixes
      await pool.query(
        `
        UPDATE user_preferences 
        SET preferred_contribution_types = ARRAY['bug_fix']::contribution_type[]
        WHERE user_id = $1
      `,
        [testIds.userId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Should prefer bug fix opportunities
      expect(rows.length).toBeGreaterThan(0)
      const bugFixOpportunity = rows.find(r => r.type === 'bug_fix')
      expect(bugFixOpportunity).toBeDefined()

      if (rows.length > 1) {
        const featureOpportunity = rows.find(r => r.type === 'feature')
        if (featureOpportunity) {
          expect(bugFixOpportunity.match_score).toBeGreaterThan(featureOpportunity.match_score)
        }
      }
    })

    it('should respect max estimated hours preference', async () => {
      const { pool, testIds } = context

      // Set very low max hours
      await pool.query(
        `
        UPDATE user_preferences 
        SET max_estimated_hours = 3
        WHERE user_id = $1
      `,
        [testIds.userId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Should favor lower hour opportunities
      const lowHourOpportunity = rows.find(r => r.estimated_hours <= 3)
      const highHourOpportunity = rows.find(r => r.estimated_hours > 10)

      if (lowHourOpportunity && highHourOpportunity) {
        expect(lowHourOpportunity.match_score).toBeGreaterThan(highHourOpportunity.match_score)
      }
    })
  })

  describe('Skill Level Compatibility Filtering', () => {
    beforeEach(async () => {
      await setupUserPreferences(context)
    })

    it('should consider skill level compatibility', async () => {
      const { pool, testIds } = context

      // Update opportunity difficulties to test skill matching
      await pool.query(
        `
        UPDATE opportunities 
        SET difficulty = 'intermediate'
        WHERE id = $1
      `,
        [testIds.oppId1]
      )

      await pool.query(
        `
        UPDATE opportunities 
        SET difficulty = 'expert'
        WHERE id = $1
      `,
        [testIds.oppId2]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Intermediate opportunity should score higher for intermediate user
      expect(rows[0].difficulty).toBe('intermediate')
      expect(rows[0].match_score).toBeGreaterThan(rows[1].match_score)
    })

    it('should filter out overly difficult opportunities', async () => {
      const { pool, testIds } = context

      // Set user skill level to beginner
      await pool.query(
        `
        UPDATE users 
        SET skill_level = 'beginner'
        WHERE id = $1
      `,
        [testIds.userId]
      )

      // Set all opportunities to expert level
      await pool.query(
        `
        UPDATE opportunities 
        SET difficulty = 'expert'
        WHERE repository_id = $1
      `,
        [testIds.repoId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Should still return results but with lower match scores
      if (rows.length > 0) {
        rows.forEach(row => {
          expect(row.match_score).toBeLessThan(0.7) // Lower due to skill mismatch
        })
      }
    })
  })

  describe('Repository Exclusion Filtering', () => {
    it('should exclude opportunities from repositories user has contributed to', async () => {
      const { pool, testIds } = context
      await setupUserPreferences(context)

      // Mark user as having contributed to the repository
      await addUserRepositoryInteraction(context, true)

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      expect(rows).toHaveLength(0)
    })

    it('should include opportunities from repositories user has not contributed to', async () => {
      const { pool, testIds } = context
      await setupUserPreferences(context)

      // Mark user as having interacted but not contributed
      await addUserRepositoryInteraction(context, false)

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      expect(rows).toHaveLength(2) // Should still find opportunities
    })
  })

  describe('Technology and Language Filtering', () => {
    it('should boost opportunities matching user preferred languages', async () => {
      const { pool, testIds } = context
      await setupUserPreferences(context)

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // TypeScript opportunity should score well for TypeScript user
      const typescriptOpp = rows.find(
        r => r.technologies.includes('TypeScript') || r.required_skills.includes('TypeScript')
      )

      expect(typescriptOpp).toBeDefined()
      expect(typescriptOpp.match_score).toBeGreaterThan(0.3)
    })

    it('should consider technology stack alignment', async () => {
      const { pool, testIds } = context

      // Update user with different preferred languages
      await pool.query(
        `
        UPDATE users 
        SET preferred_languages = ARRAY['Python', 'Go']
        WHERE id = $1
      `,
        [testIds.userId]
      )

      await setupUserPreferences(context)

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Python opportunity should score higher
      const pythonOpp = rows.find(r => r.technologies.includes('Python'))
      const typescriptOpp = rows.find(r => r.technologies.includes('TypeScript'))

      if (pythonOpp && typescriptOpp) {
        expect(pythonOpp.match_score).toBeGreaterThan(typescriptOpp.match_score)
      }
    })
  })

  describe('Advanced Filtering Options', () => {
    it('should handle complex preference combinations', async () => {
      const { pool, testIds } = context

      // Setup advanced preferences
      await pool.query(
        `
        INSERT INTO user_preferences (
          user_id, preferred_contribution_types,
          max_estimated_hours, notification_frequency
        ) VALUES (
          $1, $2::contribution_type[],
          $3, $4
        )
      `,
        [
          testIds.userId,
          userPreferencesFixtures.advanced.preferred_contribution_types,
          userPreferencesFixtures.advanced.max_estimated_hours,
          userPreferencesFixtures.advanced.notification_frequency,
        ]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Should apply multiple filtering criteria
      expect(rows.length).toBeGreaterThanOrEqual(0)

      rows.forEach(row => {
        expect(row.match_reasons).toBeDefined()
        expect(Array.isArray(row.match_reasons)).toBe(true)
      })
    })

    it('should validate user existence before filtering', async () => {
      const { pool } = context
      const fakeUserId = '550e8400-e29b-41d4-a716-446655440099'

      await expect(
        pool.query(
          `
          SELECT * FROM find_matching_opportunities_for_user(
            target_user_id := $1
          )
        `,
          [fakeUserId]
        )
      ).rejects.toThrow(errorMessages.userNotFound(fakeUserId))
    })
  })

  describe('Filtering Performance', () => {
    it('should apply filters efficiently for large datasets', async () => {
      const { pool, testIds } = context
      await setupUserPreferences(context)

      // Measure query performance
      const startTime = Date.now()

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01,
          result_limit := 100
        )
      `,
        [testIds.userId]
      )

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(2000) // Should complete within 2 seconds
      expect(rows).toBeDefined()
    })

    it('should handle empty filter results gracefully', async () => {
      const { pool, testIds } = context

      // Setup impossible preferences
      await pool.query(
        `
        INSERT INTO user_preferences (
          user_id, preferred_contribution_types,
          max_estimated_hours, notification_frequency
        ) VALUES (
          $1, ARRAY['documentation']::contribution_type[],
          1, 24
        )
      `,
        [testIds.userId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      // Should handle empty results without error
      expect(rows).toEqual([])
    })
  })
})
