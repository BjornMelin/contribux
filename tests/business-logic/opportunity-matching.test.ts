/**
 * Opportunity Matching Business Logic Test Suite
 * Tests for AI-powered opportunity recommendation algorithms
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { Opportunity, UserProfile } from '@/lib/business-logic'
import { MatchScoreSchema, OpportunityMatcher } from '@/lib/business-logic'

describe('Opportunity Matching Business Logic', () => {
  let matcher: OpportunityMatcher
  let testUser: UserProfile
  let testOpportunities: Opportunity[]

  beforeEach(() => {
    matcher = new OpportunityMatcher()

    testUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      skill_level: 'intermediate',
      preferred_languages: ['TypeScript', 'Python', 'React'],
      interests: ['web development', 'ai', 'testing'],
      availability_hours: 10,
      experience_months: 18,
    }

    testOpportunities = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Fix TypeScript type errors in React components',
        description: 'Several React components have TypeScript type errors that need fixing',
        type: 'bug_fix',
        difficulty: 'intermediate',
        required_skills: ['TypeScript', 'React', 'debugging'],
        technologies: ['TypeScript', 'React', 'Jest'],
        estimated_hours: 8,
        good_first_issue: false,
        help_wanted: true,
        mentorship_available: false,
        priority: 1,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Add AI-powered search feature',
        description: 'Implement machine learning based search with embeddings',
        type: 'feature',
        difficulty: 'advanced',
        required_skills: ['AI/ML', 'Python', 'vector search'],
        technologies: ['Python', 'TensorFlow', 'PostgreSQL'],
        estimated_hours: 25,
        good_first_issue: false,
        help_wanted: false,
        mentorship_available: true,
        priority: 2,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'Write unit tests for auth module',
        description: 'Add comprehensive unit tests for authentication functionality',
        type: 'testing',
        difficulty: 'beginner',
        required_skills: ['testing', 'JavaScript'],
        technologies: ['JavaScript', 'Jest', 'Node.js'],
        estimated_hours: 6,
        good_first_issue: true,
        help_wanted: true,
        mentorship_available: true,
        priority: 3,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        title: 'Implement advanced GraphQL subscriptions',
        description: 'Build real-time GraphQL subscription system',
        type: 'feature',
        difficulty: 'expert',
        required_skills: ['GraphQL', 'WebSockets', 'Node.js'],
        technologies: ['GraphQL', 'Apollo', 'Node.js'],
        estimated_hours: 40,
        good_first_issue: false,
        help_wanted: false,
        mentorship_available: false,
        priority: 4,
      },
    ]
  })

  describe('calculateMatchScore', () => {
    it('should calculate comprehensive match scores', () => {
      const opportunity = testOpportunities[0] // TypeScript React bug fix
      const score = matcher.calculateMatchScore(testUser, opportunity)

      // Validate schema
      expect(() => MatchScoreSchema.parse(score)).not.toThrow()

      // Should score highly due to skill and language match
      expect(score.total_score).toBeGreaterThan(0.7)
      expect(score.skill_match_score).toBeGreaterThan(0.6)
      expect(score.language_match_score).toBeGreaterThan(0.6)
      expect(score.difficulty_score).toBe(1.0) // Perfect match
      expect(score.availability_score).toBeGreaterThanOrEqual(0.8) // 8h fits in 10h

      expect(score.match_reasons).toContain('Strong skill match')
      expect(score.match_reasons).toContain('Uses your preferred technologies')
      expect(score.match_reasons).toContain('Perfect difficulty level for your experience')
    })

    it('should handle perfect skill matches with bonus', () => {
      const perfectMatchOpp: Opportunity = {
        ...testOpportunities[0],
        required_skills: ['TypeScript', 'React'], // Exact matches
        technologies: ['TypeScript', 'React'],
      }

      const score = matcher.calculateMatchScore(testUser, perfectMatchOpp)
      expect(score.skill_match_score).toBe(1.0)
      expect(score.language_match_score).toBe(1.0)
    })

    it('should penalize opportunities that are too difficult', () => {
      const expertOpp = testOpportunities[3] // Expert level GraphQL
      const score = matcher.calculateMatchScore(testUser, expertOpp)

      expect(score.difficulty_score).toBeLessThan(0.3) // Too hard for intermediate
      expect(score.warnings).toContain(
        'This task may be more challenging than your current skill level'
      )
    })

    it('should penalize opportunities that are too easy', () => {
      const beginnerOpp = testOpportunities[2] // Beginner testing
      const score = matcher.calculateMatchScore(testUser, beginnerOpp)

      expect(score.difficulty_score).toBeLessThan(0.8) // Too easy for intermediate
    })

    it('should warn about time commitment issues', () => {
      const longOpp = testOpportunities[1] // 25 hours
      const score = matcher.calculateMatchScore(testUser, longOpp)

      expect(score.availability_score).toBeLessThan(0.5)
      expect(score.warnings).toContain('Time commitment (25h) may exceed your availability')
    })

    it('should boost good first issues for beginners', () => {
      const beginnerUser: UserProfile = {
        ...testUser,
        skill_level: 'beginner',
        experience_months: 2,
      }

      const gfiOpp = testOpportunities[2] // Good first issue
      const score = matcher.calculateMatchScore(beginnerUser, gfiOpp)

      expect(score.experience_score).toBe(1.0)
      expect(score.match_reasons).toContain('Great first issue for beginners')
    })

    it('should handle missing estimated hours gracefully', () => {
      const noTimeOpp: Opportunity = {
        ...testOpportunities[0],
        estimated_hours: null,
      }

      const score = matcher.calculateMatchScore(testUser, noTimeOpp)
      expect(score.availability_score).toBe(0.8) // Default for unknown time
    })

    it('should consider mentorship availability', () => {
      const mentorshipOpp = testOpportunities[1] // Has mentorship
      const score = matcher.calculateMatchScore(testUser, mentorshipOpp)

      expect(score.match_reasons).toContain('Mentorship available')
    })

    it('should consider help wanted flag', () => {
      const helpWantedOpp = testOpportunities[0] // Help wanted
      const score = matcher.calculateMatchScore(testUser, helpWantedOpp)

      expect(score.match_reasons).toContain('Project actively seeking help')
    })

    it('should highlight high priority opportunities', () => {
      const highPriorityOpp = testOpportunities[0] // Priority 1
      const score = matcher.calculateMatchScore(testUser, highPriorityOpp)

      expect(score.match_reasons).toContain('High priority contribution')
    })
  })

  describe('rankOpportunities', () => {
    it('should rank opportunities by total score', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, testOpportunities)

      expect(rankedMatches).toHaveLength(4)

      // Should be sorted by total_score descending
      for (let i = 0; i < rankedMatches.length - 1; i++) {
        expect(rankedMatches[i].total_score).toBeGreaterThanOrEqual(
          rankedMatches[i + 1].total_score
        )
      }

      // TypeScript React opportunity should rank highest
      expect(rankedMatches[0].opportunity_id).toBe(testOpportunities[0].id)
    })

    it('should handle empty opportunities array', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, [])
      expect(rankedMatches).toHaveLength(0)
    })

    it('should maintain all opportunity data in results', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, testOpportunities)

      rankedMatches.forEach(match => {
        expect(match.opportunity_id).toBeDefined()
        expect(match.total_score).toBeGreaterThanOrEqual(0)
        expect(match.total_score).toBeLessThanOrEqual(1)
        expect(Array.isArray(match.match_reasons)).toBe(true)
        expect(Array.isArray(match.warnings)).toBe(true)
      })
    })
  })

  describe('filterByMinimumScore', () => {
    it('should filter matches by minimum score', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const filteredMatches = matcher.filterByMinimumScore(allMatches, 0.5)

      filteredMatches.forEach(match => {
        expect(match.total_score).toBeGreaterThanOrEqual(0.5)
      })

      expect(filteredMatches.length).toBeLessThanOrEqual(allMatches.length)
    })

    it('should use default minimum score of 0.3', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const filteredMatches = matcher.filterByMinimumScore(allMatches)

      filteredMatches.forEach(match => {
        expect(match.total_score).toBeGreaterThanOrEqual(0.3)
      })
    })

    it('should return empty array if no matches meet threshold', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const filteredMatches = matcher.filterByMinimumScore(allMatches, 0.99)

      expect(filteredMatches).toHaveLength(0)
    })
  })

  describe('getTopMatches', () => {
    it('should limit results to specified count', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const topMatches = matcher.getTopMatches(allMatches, 2)

      expect(topMatches).toHaveLength(2)
      expect(topMatches[0].total_score).toBeGreaterThanOrEqual(topMatches[1].total_score)
    })

    it('should use default limit of 10', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const topMatches = matcher.getTopMatches(allMatches)

      expect(topMatches.length).toBeLessThanOrEqual(10)
    })

    it('should return all matches if fewer than limit', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const topMatches = matcher.getTopMatches(allMatches, 20)

      expect(topMatches).toHaveLength(4) // All 4 opportunities
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle user with no preferred languages', () => {
      const noLangUser: UserProfile = {
        ...testUser,
        preferred_languages: [],
      }

      const score = matcher.calculateMatchScore(noLangUser, testOpportunities[0])
      expect(score.language_match_score).toBe(0.5) // Default score
    })

    it('should handle opportunity with no required skills', () => {
      const noSkillsOpp: Opportunity = {
        ...testOpportunities[0],
        required_skills: [],
        technologies: [],
      }

      const score = matcher.calculateMatchScore(testUser, noSkillsOpp)
      expect(score.skill_match_score).toBe(0.5) // Default score
      expect(score.language_match_score).toBe(0.5) // Default score
    })

    it('should handle user with zero availability', () => {
      const noTimeUser: UserProfile = {
        ...testUser,
        availability_hours: 0,
      }

      const score = matcher.calculateMatchScore(noTimeUser, testOpportunities[0])
      expect(score.availability_score).toBe(0.2) // Very low score for no time
    })

    it('should handle opportunity with very high time estimate', () => {
      const longOpp: Opportunity = {
        ...testOpportunities[0],
        estimated_hours: 100,
      }

      const score = matcher.calculateMatchScore(testUser, longOpp)
      expect(score.availability_score).toBe(0.2) // Very low score
      expect(score.warnings).toContain('Time commitment (100h) may exceed your availability')
    })

    it('should validate all schema constraints', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)

      allMatches.forEach(match => {
        expect(() => MatchScoreSchema.parse(match)).not.toThrow()

        // Additional constraints
        expect(match.total_score).toBeGreaterThanOrEqual(0)
        expect(match.total_score).toBeLessThanOrEqual(1)
        expect(match.skill_match_score).toBeGreaterThanOrEqual(0)
        expect(match.skill_match_score).toBeLessThanOrEqual(1)
        expect(match.language_match_score).toBeGreaterThanOrEqual(0)
        expect(match.language_match_score).toBeLessThanOrEqual(1)
      })
    })
  })
})
