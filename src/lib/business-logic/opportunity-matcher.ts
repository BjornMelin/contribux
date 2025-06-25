/**
 * Opportunity Matching Business Logic
 * AI-powered opportunity recommendation algorithms for contribux
 */

import type { DifficultyLevel } from '@/types/search'
import type { BusinessOpportunity, MatchScore, UserProfile } from './types'

export class OpportunityMatcher {
  private readonly WEIGHTS = {
    skillMatch: 0.25,
    languageMatch: 0.2,
    interestMatch: 0.15,
    difficulty: 0.15,
    availability: 0.15,
    experience: 0.1,
  }

  calculateMatchScore(user: UserProfile, opportunity: BusinessOpportunity): MatchScore {
    const skillScore = this.calculateSkillMatchScore(user, opportunity)
    const languageScore = this.calculateLanguageMatchScore(user, opportunity)
    const interestScore = this.calculateInterestMatchScore(user, opportunity)
    const difficultyScore = this.calculateDifficultyScore(user, opportunity)
    const availabilityScore = this.calculateAvailabilityScore(user, opportunity)
    const experienceScore = this.calculateExperienceScore(user, opportunity)

    const totalScore =
      skillScore * this.WEIGHTS.skillMatch +
      languageScore * this.WEIGHTS.languageMatch +
      interestScore * this.WEIGHTS.interestMatch +
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
      opportunityId: opportunity.id,
      totalScore: Math.min(1, Math.max(0, totalScore)),
      skillMatchScore: skillScore,
      languageMatchScore: languageScore,
      interestMatchScore: interestScore,
      difficultyScore: difficultyScore,
      availabilityScore: availabilityScore,
      experienceScore: experienceScore,
      matchReasons,
      warnings,
    }
  }

  private calculateSkillMatchScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    const userSkills = user.preferredLanguages
    const requiredSkills = opportunity.requiredSkills

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

  private calculateLanguageMatchScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    const userLanguages = user.preferredLanguages.map(lang => lang.toLowerCase())
    const oppTechnologies = opportunity.technologies.map(tech => tech.toLowerCase())

    if (oppTechnologies.length === 0) return 0.5
    if (userLanguages.length === 0) return 0.5 // Default when user has no preferences

    const matchedTech = oppTechnologies.filter(tech =>
      userLanguages.some(lang => lang === tech || tech.includes(lang) || lang.includes(tech))
    )

    return matchedTech.length / oppTechnologies.length
  }

  private calculateInterestMatchScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    const userInterests = user.interests?.map(interest => interest.toLowerCase()) ?? []
    const oppType = opportunity.type.toLowerCase()
    const oppDescription = (opportunity.description ?? '').toLowerCase()

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

  private calculateDifficultyScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    const difficultyMap: Record<DifficultyLevel, number> = {
      beginner: 1,
      intermediate: 2,
      advanced: 3,
      expert: 4,
    } as const

    const userLevel = difficultyMap[user.skillLevel]
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

  private calculateAvailabilityScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    if (!opportunity.estimatedHours) return 0.8 // Assume reasonable if not specified

    const timeRatio = user.availabilityHours / opportunity.estimatedHours

    if (timeRatio >= 2) return 1.0 // Plenty of time
    if (timeRatio >= 1.5) return 0.9 // Comfortable amount
    if (timeRatio >= 1) return 0.8 // Just enough
    if (timeRatio >= 0.7) return 0.6 // Tight but doable
    if (timeRatio >= 0.5) return 0.4 // Very tight
    return 0.2 // Not enough time
  }

  private calculateExperienceScore(user: UserProfile, opportunity: BusinessOpportunity): number {
    const months = user.experienceMonths

    // Beginner boost for good first issues
    if (opportunity.goodFirstIssue && months < 6) return 1.0

    // Experience appropriateness
    const difficultyMap: Record<DifficultyLevel, { min: number; ideal: number; max: number }> = {
      beginner: { min: 0, ideal: 3, max: 12 },
      intermediate: { min: 3, ideal: 12, max: 36 },
      advanced: { min: 12, ideal: 36, max: 72 },
      expert: { min: 24, ideal: 60, max: 120 },
    } as const

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
    opportunity: BusinessOpportunity,
    scores: Record<string, number>
  ): string[] {
    const reasons: string[] = []

    if (scores.skillScore && scores.skillScore > 0.7) {
      reasons.push('Strong skill match')
    }

    if (scores.languageScore && scores.languageScore > 0.6) {
      reasons.push('Uses your preferred technologies')
    }

    if (scores.difficultyScore && scores.difficultyScore > 0.8) {
      reasons.push('Perfect difficulty level for your experience')
    }

    if (opportunity.goodFirstIssue && user.skillLevel === 'beginner') {
      reasons.push('Great first issue for beginners')
    }

    if (opportunity.mentorshipAvailable) {
      reasons.push('Mentorship available')
    }

    if (opportunity.helpWanted) {
      reasons.push('Project actively seeking help')
    }

    if (scores.availabilityScore && scores.availabilityScore > 0.8) {
      reasons.push('Fits well within your available time')
    }

    if (opportunity.priority <= 2) {
      reasons.push('High priority contribution')
    }

    return reasons
  }

  private generateWarnings(
    user: UserProfile,
    opportunity: BusinessOpportunity,
    scores: Record<string, number>
  ): string[] {
    const warnings: string[] = []

    if (scores.skillScore != null && scores.skillScore < 0.3) {
      warnings.push('Limited skill match - consider if this aligns with your learning goals')
    }

    if (scores.difficultyScore != null && scores.difficultyScore < 0.3) {
      const difficultyMap: Record<DifficultyLevel, number> = {
        beginner: 1,
        intermediate: 2,
        advanced: 3,
        expert: 4,
      } as const
      const userLevel = difficultyMap[user.skillLevel]
      const oppLevel = difficultyMap[opportunity.difficulty]

      if (oppLevel > userLevel + 1) {
        warnings.push('This task may be more challenging than your current skill level')
      } else if (oppLevel < userLevel - 1) {
        warnings.push('This task may be too simple for your experience level')
      }
    }

    if (
      scores.availabilityScore != null &&
      scores.availabilityScore < 0.5 &&
      opportunity.estimatedHours
    ) {
      warnings.push(`Time commitment (${opportunity.estimatedHours}h) may exceed your availability`)
    }

    if (scores.languageScore != null && scores.languageScore < 0.2) {
      warnings.push('Uses technologies you may not be familiar with')
    }

    return warnings
  }

  rankOpportunities(user: UserProfile, opportunities: BusinessOpportunity[]): MatchScore[] {
    return opportunities
      .map(opp => this.calculateMatchScore(user, opp))
      .sort((a, b) => b.totalScore - a.totalScore)
  }

  filterByMinimumScore(matches: MatchScore[], minScore = 0.3): MatchScore[] {
    return matches.filter(match => match.totalScore >= minScore)
  }

  getTopMatches(matches: MatchScore[], limit = 10): MatchScore[] {
    return matches.slice(0, limit)
  }
}
