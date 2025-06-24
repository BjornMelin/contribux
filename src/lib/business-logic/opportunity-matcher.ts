/**
 * Opportunity Matching Business Logic
 * AI-powered opportunity recommendation algorithms for contribux
 */

import type { MatchScore, Opportunity, UserProfile } from './types'

export class OpportunityMatcher {
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
    if (userLanguages.length === 0) return 0.5 // Default when user has no preferences

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

    if (scores.skillScore && scores.skillScore > 0.7) {
      reasons.push('Strong skill match')
    }

    if (scores.languageScore && scores.languageScore > 0.6) {
      reasons.push('Uses your preferred technologies')
    }

    if (scores.difficultyScore && scores.difficultyScore > 0.8) {
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
