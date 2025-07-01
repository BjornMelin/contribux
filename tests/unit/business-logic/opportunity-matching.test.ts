/**
 * Opportunity Matching Business Logic Test Suite
 * Tests for AI-powered opportunity recommendation algorithms
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { BusinessOpportunity, UserProfile } from '@/lib/business-logic'
import { MatchScoreSchema, OpportunityMatcher } from '@/lib/business-logic'
import type { UUID } from '@/types/base'

describe('Opportunity Matching Business Logic', () => {
  let matcher: OpportunityMatcher
  let testUser: UserProfile
  let testOpportunities: BusinessOpportunity[]

  beforeEach(() => {
    matcher = new OpportunityMatcher()

    testUser = {
      id: '550e8400-e29b-41d4-a716-446655440000' as UUID,
      skillLevel: 'intermediate',
      preferredLanguages: ['TypeScript', 'Python', 'React'],
      interests: ['web development', 'ai', 'testing'],
      availabilityHours: 10,
      experienceMonths: 18,
    }

    testOpportunities = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001' as UUID,
        title: 'Fix TypeScript type errors in React components',
        description: 'Several React components have TypeScript type errors that need fixing',
        type: 'bug_fix',
        difficulty: 'intermediate',
        requiredSkills: ['TypeScript', 'React', 'debugging'],
        technologies: ['TypeScript', 'React', 'Jest'],
        estimatedHours: 8,
        goodFirstIssue: false,
        helpWanted: true,
        mentorshipAvailable: false,
        priority: 1,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002' as UUID,
        title: 'Add AI-powered search feature',
        description: 'Implement machine learning based search with embeddings',
        type: 'feature',
        difficulty: 'advanced',
        requiredSkills: ['AI/ML', 'Python', 'vector search'],
        technologies: ['Python', 'TensorFlow', 'PostgreSQL'],
        estimatedHours: 25,
        goodFirstIssue: false,
        helpWanted: false,
        mentorshipAvailable: true,
        priority: 2,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003' as UUID,
        title: 'Write unit tests for auth module',
        description: 'Add comprehensive unit tests for authentication functionality',
        type: 'testing',
        difficulty: 'beginner',
        requiredSkills: ['testing', 'JavaScript'],
        technologies: ['JavaScript', 'Jest', 'Node.js'],
        estimatedHours: 6,
        goodFirstIssue: true,
        helpWanted: true,
        mentorshipAvailable: true,
        priority: 3,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004' as UUID,
        title: 'Implement advanced GraphQL subscriptions',
        description: 'Build real-time GraphQL subscription system',
        type: 'feature',
        difficulty: 'expert',
        requiredSkills: ['GraphQL', 'WebSockets', 'Node.js'],
        technologies: ['GraphQL', 'Apollo', 'Node.js'],
        estimatedHours: 40,
        goodFirstIssue: false,
        helpWanted: false,
        mentorshipAvailable: false,
        priority: 4,
      },
    ]
  })

  describe('calculateMatchScore', () => {
    it('should calculate comprehensive match scores', () => {
      const opportunity = testOpportunities[0] // TypeScript React bug fix
      expect(opportunity).toBeDefined()
      if (!opportunity) throw new Error('Opportunity not found')
      const score = matcher.calculateMatchScore(testUser, opportunity)

      // Validate schema
      expect(() => MatchScoreSchema.parse(score)).not.toThrow()

      // Should score highly due to skill and language match
      expect(score.totalScore).toBeGreaterThan(0.7)
      expect(score.skillMatchScore).toBeGreaterThan(0.6)
      expect(score.languageMatchScore).toBeGreaterThan(0.6)
      expect(score.difficultyScore).toBe(1.0) // Perfect match
      expect(score.availabilityScore).toBeGreaterThanOrEqual(0.8) // 8h fits in 10h

      expect(score.matchReasons).toContain('Strong skill match')
      expect(score.matchReasons).toContain('Uses your preferred technologies')
      expect(score.matchReasons).toContain('Perfect difficulty level for your experience')
    })

    it('should handle perfect skill matches with bonus', () => {
      const baseOpp = testOpportunities[0]
      expect(baseOpp).toBeDefined()
      if (!baseOpp) throw new Error('Base opportunity not found')
      const perfectMatchOpp: BusinessOpportunity = {
        ...baseOpp,
        requiredSkills: ['TypeScript', 'React'], // Exact matches
        technologies: ['TypeScript', 'React'],
      } as BusinessOpportunity

      const score = matcher.calculateMatchScore(testUser, perfectMatchOpp)
      expect(score.skillMatchScore).toBe(1.0)
      expect(score.languageMatchScore).toBe(1.0)
    })

    it('should penalize opportunities that are too difficult', () => {
      const expertOpp = testOpportunities[3] // Expert level GraphQL
      expect(expertOpp).toBeDefined()
      if (!expertOpp) throw new Error('Expert opportunity not found')
      const score = matcher.calculateMatchScore(testUser, expertOpp)

      expect(score.difficultyScore).toBeLessThan(0.3) // Too hard for intermediate
      expect(score.warnings).toContain(
        'This task may be more challenging than your current skill level'
      )
    })

    it('should penalize opportunities that are too easy', () => {
      const beginnerOpp = testOpportunities[2] // Beginner testing
      expect(beginnerOpp).toBeDefined()
      if (!beginnerOpp) throw new Error('Beginner opportunity not found')
      const score = matcher.calculateMatchScore(testUser, beginnerOpp)

      expect(score.difficultyScore).toBeLessThan(0.8) // Too easy for intermediate
    })

    it('should warn about time commitment issues', () => {
      const longOpp = testOpportunities[1] // 25 hours
      expect(longOpp).toBeDefined()
      if (!longOpp) throw new Error('Long opportunity not found')
      const score = matcher.calculateMatchScore(testUser, longOpp)

      expect(score.availabilityScore).toBeLessThan(0.5)
      expect(score.warnings).toContain('Time commitment (25h) may exceed your availability')
    })

    it('should boost good first issues for beginners', () => {
      const beginnerUser: UserProfile = {
        ...testUser,
        skillLevel: 'beginner',
        experienceMonths: 2,
      }

      const gfiOpp = testOpportunities[2] // Good first issue
      expect(gfiOpp).toBeDefined()
      if (!gfiOpp) throw new Error('Good first issue opportunity not found')
      const score = matcher.calculateMatchScore(beginnerUser, gfiOpp)

      expect(score.experienceScore).toBe(1.0)
      expect(score.matchReasons).toContain('Great first issue for beginners')
    })

    it('should handle missing estimated hours gracefully', () => {
      const baseOpp = testOpportunities[0]
      expect(baseOpp).toBeDefined()
      if (!baseOpp) throw new Error('Base opportunity not found')
      const noTimeOpp: BusinessOpportunity = {
        id: baseOpp.id,
        title: baseOpp.title,
        type: baseOpp.type,
        difficulty: baseOpp.difficulty,
        requiredSkills: baseOpp.requiredSkills,
        technologies: baseOpp.technologies,
        goodFirstIssue: baseOpp.goodFirstIssue,
        helpWanted: baseOpp.helpWanted,
        mentorshipAvailable: baseOpp.mentorshipAvailable,
        priority: baseOpp.priority,
        // Optional properties handled explicitly
        ...(baseOpp.description !== undefined ? { description: baseOpp.description } : {}),
        // estimatedHours is intentionally omitted
      }

      const score = matcher.calculateMatchScore(testUser, noTimeOpp)
      expect(score.availabilityScore).toBe(0.8) // Default for unknown time
    })

    it('should consider mentorship availability', () => {
      const mentorshipOpp = testOpportunities[1] // Has mentorship
      expect(mentorshipOpp).toBeDefined()
      if (!mentorshipOpp) throw new Error('Mentorship opportunity not found')
      const score = matcher.calculateMatchScore(testUser, mentorshipOpp)

      expect(score.matchReasons).toContain('Mentorship available')
    })

    it('should consider help wanted flag', () => {
      const helpWantedOpp = testOpportunities[0] // Help wanted
      expect(helpWantedOpp).toBeDefined()
      if (!helpWantedOpp) throw new Error('Help wanted opportunity not found')
      const score = matcher.calculateMatchScore(testUser, helpWantedOpp)

      expect(score.matchReasons).toContain('Project actively seeking help')
    })

    it('should highlight high priority opportunities', () => {
      const highPriorityOpp = testOpportunities[0] // Priority 1
      expect(highPriorityOpp).toBeDefined()
      if (!highPriorityOpp) throw new Error('High priority opportunity not found')
      const score = matcher.calculateMatchScore(testUser, highPriorityOpp)

      expect(score.matchReasons).toContain('High priority contribution')
    })
  })

  describe('rankOpportunities', () => {
    it('should rank opportunities by total score', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, testOpportunities)

      expect(rankedMatches).toHaveLength(4)

      // Should be sorted by totalScore descending
      for (let i = 0; i < rankedMatches.length - 1; i++) {
        expect(rankedMatches[i]?.totalScore ?? 0).toBeGreaterThanOrEqual(
          rankedMatches[i + 1]?.totalScore ?? 0
        )
      }

      // TypeScript React opportunity should rank highest
      const firstMatch = rankedMatches[0]
      const firstOpportunity = testOpportunities[0]
      expect(firstMatch).toBeDefined()
      expect(firstOpportunity).toBeDefined()
      if (!firstMatch) throw new Error('First match not found')
      if (!firstOpportunity) throw new Error('First opportunity not found')
      expect(firstMatch.opportunityId).toBe(firstOpportunity.id)
    })

    it('should handle empty opportunities array', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, [])
      expect(rankedMatches).toHaveLength(0)
    })

    it('should maintain all opportunity data in results', () => {
      const rankedMatches = matcher.rankOpportunities(testUser, testOpportunities)

      rankedMatches.forEach(match => {
        expect(match.opportunityId).toBeDefined()
        expect(match.totalScore).toBeGreaterThanOrEqual(0)
        expect(match.totalScore).toBeLessThanOrEqual(1)
        expect(Array.isArray(match.matchReasons)).toBe(true)
        expect(Array.isArray(match.warnings)).toBe(true)
      })
    })
  })

  describe('filterByMinimumScore', () => {
    it('should filter matches by minimum score', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const filteredMatches = matcher.filterByMinimumScore(allMatches, 0.5)

      filteredMatches.forEach(match => {
        expect(match.totalScore).toBeGreaterThanOrEqual(0.5)
      })

      expect(filteredMatches.length).toBeLessThanOrEqual(allMatches.length)
    })

    it('should use default minimum score of 0.3', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)
      const filteredMatches = matcher.filterByMinimumScore(allMatches)

      filteredMatches.forEach(match => {
        expect(match.totalScore).toBeGreaterThanOrEqual(0.3)
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
      expect(topMatches[0]?.totalScore ?? 0).toBeGreaterThanOrEqual(topMatches[1]?.totalScore ?? 0)
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
        preferredLanguages: [],
      }

      const opportunity = testOpportunities[0]
      expect(opportunity).toBeDefined()
      if (!opportunity) throw new Error('Opportunity not found')
      const score = matcher.calculateMatchScore(noLangUser, opportunity)
      expect(score.languageMatchScore).toBe(0.5) // Default score
    })

    it('should handle opportunity with no required skills', () => {
      const baseOpp = testOpportunities[0]
      expect(baseOpp).toBeDefined()
      if (!baseOpp) throw new Error('Base opportunity not found')
      const noSkillsOpp: BusinessOpportunity = {
        id: baseOpp.id,
        title: baseOpp.title,
        type: baseOpp.type,
        difficulty: baseOpp.difficulty,
        requiredSkills: [],
        technologies: [],
        goodFirstIssue: baseOpp.goodFirstIssue,
        helpWanted: baseOpp.helpWanted,
        mentorshipAvailable: baseOpp.mentorshipAvailable,
        priority: baseOpp.priority,
        ...(baseOpp.description !== undefined ? { description: baseOpp.description } : {}),
        ...(baseOpp.estimatedHours !== undefined ? { estimatedHours: baseOpp.estimatedHours } : {}),
      }

      const score = matcher.calculateMatchScore(testUser, noSkillsOpp)
      expect(score.skillMatchScore).toBe(0.5) // Default score
      expect(score.languageMatchScore).toBe(0.5) // Default score
    })

    it('should handle user with zero availability', () => {
      const noTimeUser: UserProfile = {
        ...testUser,
        availabilityHours: 0,
      }

      const opportunity = testOpportunities[0]
      expect(opportunity).toBeDefined()
      if (!opportunity) throw new Error('Opportunity not found')
      const score = matcher.calculateMatchScore(noTimeUser, opportunity)
      expect(score.availabilityScore).toBe(0.2) // Very low score for no time
    })

    it('should handle opportunity with very high time estimate', () => {
      const baseOpp = testOpportunities[0]
      expect(baseOpp).toBeDefined()
      if (!baseOpp) throw new Error('Base opportunity not found')
      const longOpp: BusinessOpportunity = {
        id: baseOpp.id,
        title: baseOpp.title,
        type: baseOpp.type,
        difficulty: baseOpp.difficulty,
        requiredSkills: baseOpp.requiredSkills,
        technologies: baseOpp.technologies,
        goodFirstIssue: baseOpp.goodFirstIssue,
        helpWanted: baseOpp.helpWanted,
        mentorshipAvailable: baseOpp.mentorshipAvailable,
        priority: baseOpp.priority,
        estimatedHours: 100,
        ...(baseOpp.description !== undefined ? { description: baseOpp.description } : {}),
      }

      const score = matcher.calculateMatchScore(testUser, longOpp)
      expect(score.availabilityScore).toBe(0.2) // Very low score
      expect(score.warnings).toContain('Time commitment (100h) may exceed your availability')
    })

    it('should validate all schema constraints', () => {
      const allMatches = matcher.rankOpportunities(testUser, testOpportunities)

      allMatches.forEach(match => {
        expect(() => MatchScoreSchema.parse(match)).not.toThrow()

        // Additional constraints
        expect(match.totalScore).toBeGreaterThanOrEqual(0)
        expect(match.totalScore).toBeLessThanOrEqual(1)
        expect(match.skillMatchScore).toBeGreaterThanOrEqual(0)
        expect(match.skillMatchScore).toBeLessThanOrEqual(1)
        expect(match.languageMatchScore).toBeGreaterThanOrEqual(0)
        expect(match.languageMatchScore).toBeLessThanOrEqual(1)
      })
    })
  })
})
