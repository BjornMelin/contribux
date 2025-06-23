/**
 * Opportunity Matching Business Logic Test Suite
 * Tests for AI-powered opportunity recommendation algorithms
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

// Business logic schemas
const UserProfileSchema = z.object({
  id: z.string().uuid(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  preferred_languages: z.array(z.string()),
  interests: z.array(z.string()),
  availability_hours: z.number().min(0),
  experience_months: z.number().min(0),
})

const OpportunitySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['bug_fix', 'feature', 'documentation', 'testing', 'refactoring', 'other']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  estimated_hours: z.number().nullable(),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  mentorship_available: z.boolean(),
  priority: z.number().min(1).max(5),
})

const MatchScoreSchema = z.object({
  opportunity_id: z.string().uuid(),
  total_score: z.number().min(0).max(1),
  skill_match_score: z.number().min(0).max(1),
  language_match_score: z.number().min(0).max(1),
  interest_match_score: z.number().min(0).max(1),
  difficulty_score: z.number().min(0).max(1),
  availability_score: z.number().min(0).max(1),
  experience_score: z.number().min(0).max(1),
  match_reasons: z.array(z.string()),
  warnings: z.array(z.string()),
})

type UserProfile = z.infer<typeof UserProfileSchema>
type Opportunity = z.infer<typeof OpportunitySchema>
type MatchScore = z.infer<typeof MatchScoreSchema>

// Business Logic Implementation
class OpportunityMatcher {
  private readonly WEIGHTS = {
    skill_match: 0.25,
    language_match: 0.2,
    interest_match: 0.15,
    difficulty: 0.15,
    availability: 0.15,
    experience: 0.1,
  }

  calculateMatchScore(user: UserProfile, opportunity: Opportunity): MatchScore {
    const skillScore = this.calculateSkillMatchScore(user, opportunity)
    const languageScore = this.calculateLanguageMatchScore(user, opportunity)
    const interestScore = this.calculateInterestMatchScore(user, opportunity)
    const difficultyScore = this.calculateDifficultyScore(user, opportunity)
    const availabilityScore = this.calculateAvailabilityScore(user, opportunity)
    const experienceScore = this.calculateExperienceScore(user, opportunity)

    const totalScore =
      skillScore * this.WEIGHTS.skill_match +
      languageScore * this.WEIGHTS.language_match +
      interestScore * this.WEIGHTS.interest_match +
      difficultyScore * this.WEIGHTS.difficulty +
      availabilityScore * this.WEIGHTS.availability +
      experienceScore * this.WEIGHTS.experience

    const matchReasons = this.generateMatchReasons(user, opportunity, {
      skillScore,
      languageScore,
      interestScore,
      difficultyScore,
      availabilityScore,
      experienceScore,
    })

    const warnings = this.generateWarnings(user, opportunity, {
      skillScore,
      languageScore,
      difficultyScore,
      availabilityScore,
    })

    return {
      opportunity_id: opportunity.id,
      total_score: Math.min(1, Math.max(0, totalScore)),
      skill_match_score: skillScore,
      language_match_score: languageScore,
      interest_match_score: interestScore,
      difficulty_score: difficultyScore,
      availability_score: availabilityScore,
      experience_score: experienceScore,
      match_reasons: matchReasons,
      warnings,
    }
  }

  private calculateSkillMatchScore(user: UserProfile, opportunity: Opportunity): number {
    const userSkills = user.preferred_languages
    const requiredSkills = opportunity.required_skills

    if (requiredSkills.length === 0) return 0.5

    const matchedSkills = requiredSkills.filter(skill =>
      userSkills.some(
        userSkill =>
          userSkill.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(userSkill.toLowerCase())
      )
    )

    const baseScore = matchedSkills.length / requiredSkills.length

    // Bonus for exact matches
    const exactMatches = requiredSkills.filter(skill =>
      userSkills.some(userSkill => userSkill.toLowerCase() === skill.toLowerCase())
    )
    const exactBonus = exactMatches.length * 0.1

    return Math.min(1, baseScore + exactBonus)
  }

  private calculateLanguageMatchScore(user: UserProfile, opportunity: Opportunity): number {
    const userLanguages = user.preferred_languages.map(lang => lang.toLowerCase())
    const oppTechnologies = opportunity.technologies.map(tech => tech.toLowerCase())

    if (oppTechnologies.length === 0) return 0.5

    const matchedTech = oppTechnologies.filter(tech =>
      userLanguages.some(lang => lang === tech || tech.includes(lang) || lang.includes(tech))
    )

    return matchedTech.length / oppTechnologies.length
  }

  private calculateInterestMatchScore(user: UserProfile, opportunity: Opportunity): number {
    const userInterests = user.interests?.map(interest => interest.toLowerCase()) ?? []
    const oppType = opportunity.type.toLowerCase()
    const oppDescription = opportunity.description.toLowerCase()

    if (userInterests.length === 0) return 0.5

    let score = 0

    // Check if opportunity type matches interests
    if (userInterests.includes(oppType) || userInterests.includes('general')) {
      score += 0.3
    }

    // Check if description contains interest keywords
    const descriptionMatches = userInterests.filter(
      interest =>
        oppDescription.includes(interest) || oppDescription.includes(interest.replace(/[-_]/g, ' '))
    )
    score += (descriptionMatches.length / userInterests.length) * 0.7

    return Math.min(1, score)
  }

  private calculateDifficultyScore(user: UserProfile, opportunity: Opportunity): number {
    const difficultyMap = {
      beginner: 1,
      intermediate: 2,
      advanced: 3,
      expert: 4,
    }

    const userLevel = difficultyMap[user.skill_level]
    const oppLevel = difficultyMap[opportunity.difficulty]

    // Perfect match
    if (userLevel === oppLevel) return 1.0

    // Slight stretch (good for growth)
    if (oppLevel === userLevel + 1) return 0.8

    // Within range but easier
    if (oppLevel === userLevel - 1) return 0.7

    // Too easy (might be boring)
    if (oppLevel < userLevel - 1) return 0.4

    // Too hard (might be overwhelming)
    if (oppLevel > userLevel + 1) return 0.2

    return 0.5
  }

  private calculateAvailabilityScore(user: UserProfile, opportunity: Opportunity): number {
    if (!opportunity.estimated_hours) return 0.8 // Assume reasonable if not specified

    const timeRatio = user.availability_hours / opportunity.estimated_hours

    if (timeRatio >= 2) return 1.0 // Plenty of time
    if (timeRatio >= 1.5) return 0.9 // Comfortable amount
    if (timeRatio >= 1) return 0.8 // Just enough
    if (timeRatio >= 0.7) return 0.6 // Tight but doable
    if (timeRatio >= 0.5) return 0.4 // Very tight
    return 0.2 // Not enough time
  }

  private calculateExperienceScore(user: UserProfile, opportunity: Opportunity): number {
    const months = user.experience_months

    // Beginner boost for good first issues
    if (opportunity.good_first_issue && months < 6) return 1.0

    // Experience appropriateness
    const difficultyMap = {
      beginner: { min: 0, ideal: 3, max: 12 },
      intermediate: { min: 3, ideal: 12, max: 36 },
      advanced: { min: 12, ideal: 36, max: 72 },
      expert: { min: 24, ideal: 60, max: 120 },
    }

    const range = difficultyMap[opportunity.difficulty]

    if (months >= range.min && months <= range.max) {
      // Within appropriate range
      const distanceFromIdeal = Math.abs(months - range.ideal)
      const maxDistance = Math.max(range.ideal - range.min, range.max - range.ideal)
      return 1 - (distanceFromIdeal / maxDistance) * 0.5
    }

    // Outside appropriate range
    if (months < range.min) return 0.3 // Under-experienced
    return 0.4 // Over-experienced (might be bored)
  }

  private generateMatchReasons(
    user: UserProfile,
    opportunity: Opportunity,
    scores: Record<string, number>
  ): string[] {
    const reasons: string[] = []

    if (scores.skillScore > 0.7) {
      reasons.push('Strong skill match')
    }

    if (scores.languageScore > 0.7) {
      reasons.push('Uses your preferred technologies')
    }

    if (scores.difficultyScore > 0.8) {
      reasons.push('Perfect difficulty level for your experience')
    }

    if (opportunity.good_first_issue && user.skill_level === 'beginner') {
      reasons.push('Great first issue for beginners')
    }

    if (opportunity.mentorship_available) {
      reasons.push('Mentorship available')
    }

    if (opportunity.help_wanted) {
      reasons.push('Project actively seeking help')
    }

    if (scores.availabilityScore > 0.8) {
      reasons.push('Fits well within your available time')
    }

    if (opportunity.priority <= 2) {
      reasons.push('High priority contribution')
    }

    return reasons
  }

  private generateWarnings(
    user: UserProfile,
    opportunity: Opportunity,
    scores: Record<string, number>
  ): string[] {
    const warnings: string[] = []

    if (scores.skillScore < 0.3) {
      warnings.push('Limited skill match - consider if this aligns with your learning goals')
    }

    if (scores.difficultyScore < 0.3) {
      const difficultyMap = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }
      const userLevel = difficultyMap[user.skill_level]
      const oppLevel = difficultyMap[opportunity.difficulty]

      if (oppLevel > userLevel + 1) {
        warnings.push('This task may be more challenging than your current skill level')
      } else if (oppLevel < userLevel - 1) {
        warnings.push('This task may be too simple for your experience level')
      }
    }

    if (scores.availabilityScore < 0.5 && opportunity.estimated_hours) {
      warnings.push(
        `Time commitment (${opportunity.estimated_hours}h) may exceed your availability`
      )
    }

    if (scores.languageScore < 0.2) {
      warnings.push('Uses technologies you may not be familiar with')
    }

    return warnings
  }

  rankOpportunities(user: UserProfile, opportunities: Opportunity[]): MatchScore[] {
    return opportunities
      .map(opp => this.calculateMatchScore(user, opp))
      .sort((a, b) => b.total_score - a.total_score)
  }

  filterByMinimumScore(matches: MatchScore[], minScore = 0.3): MatchScore[] {
    return matches.filter(match => match.total_score >= minScore)
  }

  getTopMatches(matches: MatchScore[], limit = 10): MatchScore[] {
    return matches.slice(0, limit)
  }
}

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
      expect(score.availability_score).toBeGreaterThan(0.8) // 8h fits in 10h

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
