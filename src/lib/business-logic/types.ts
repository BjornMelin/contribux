/**
 * Business Logic Types for contribux
 * Type definitions for AI-powered opportunity matching algorithms
 */

import { type UUID, UUIDSchema } from '@/types/base'
import {
  type DifficultyLevel,
  DifficultyLevelSchema,
  type OpportunityType,
  OpportunityTypeSchema,
  type Opportunity as SearchOpportunity,
} from '@/types/search'
import { z } from 'zod'

// Business logic schemas aligned with foundation types
export const UserProfileSchema = z.object({
  id: UUIDSchema,
  skillLevel: DifficultyLevelSchema,
  preferredLanguages: z.array(z.string().min(1).max(50)),
  interests: z.array(z.string().min(1).max(100)),
  availabilityHours: z.number().min(0).max(168), // Max hours per week
  experienceMonths: z.number().min(0),
})

export const BusinessOpportunitySchema = z.object({
  id: UUIDSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  type: OpportunityTypeSchema,
  difficulty: DifficultyLevelSchema,
  requiredSkills: z.array(z.string().min(1).max(50)),
  technologies: z.array(z.string().min(1).max(50)),
  estimatedHours: z.number().min(0).optional(),
  goodFirstIssue: z.boolean(),
  helpWanted: z.boolean(),
  mentorshipAvailable: z.boolean(),
  priority: z.number().min(1).max(5),
})

export const MatchScoreSchema = z.object({
  opportunityId: UUIDSchema,
  totalScore: z.number().min(0).max(1),
  skillMatchScore: z.number().min(0).max(1),
  languageMatchScore: z.number().min(0).max(1),
  interestMatchScore: z.number().min(0).max(1),
  difficultyScore: z.number().min(0).max(1),
  availabilityScore: z.number().min(0).max(1),
  experienceScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string().min(1).max(200)),
  warnings: z.array(z.string().min(1).max(200)),
})

// Type definitions
export interface UserProfile {
  readonly id: UUID
  readonly skillLevel: DifficultyLevel
  readonly preferredLanguages: readonly string[]
  readonly interests: readonly string[]
  readonly availabilityHours: number
  readonly experienceMonths: number
}

export interface BusinessOpportunity {
  readonly id: UUID
  readonly title: string
  readonly description?: string
  readonly type: OpportunityType
  readonly difficulty: DifficultyLevel
  readonly requiredSkills: readonly string[]
  readonly technologies: readonly string[]
  readonly estimatedHours?: number
  readonly goodFirstIssue: boolean
  readonly helpWanted: boolean
  readonly mentorshipAvailable: boolean
  readonly priority: number
}

export interface MatchScore {
  readonly opportunityId: UUID
  readonly totalScore: number
  readonly skillMatchScore: number
  readonly languageMatchScore: number
  readonly interestMatchScore: number
  readonly difficultyScore: number
  readonly availabilityScore: number
  readonly experienceScore: number
  readonly matchReasons: readonly string[]
  readonly warnings: readonly string[]
}

// Adapter function to convert from search opportunity to business opportunity
export function adaptSearchOpportunityToBusiness(
  opportunity: SearchOpportunity
): BusinessOpportunity {
  const result: BusinessOpportunity = {
    id: opportunity.id,
    title: opportunity.title,
    type: opportunity.type,
    difficulty: opportunity.difficulty,
    requiredSkills: opportunity.requiredSkills,
    technologies: opportunity.technologies,
    goodFirstIssue: opportunity.goodFirstIssue,
    helpWanted: opportunity.helpWanted,
    mentorshipAvailable: false, // Default value, can be extended
    priority: 3, // Default priority, can be calculated from AI analysis
  }

  // Handle optional properties correctly with exactOptionalPropertyTypes
  if (opportunity.description !== undefined) {
    Object.assign(result, { description: opportunity.description })
  }
  if (opportunity.estimatedHours !== undefined) {
    Object.assign(result, { estimatedHours: opportunity.estimatedHours })
  }

  return result
}
