/**
 * Business Logic Types for contribux
 * Type definitions for AI-powered opportunity matching algorithms
 */

import { z } from 'zod'

// Business logic schemas
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  preferred_languages: z.array(z.string()),
  interests: z.array(z.string()),
  availability_hours: z.number().min(0),
  experience_months: z.number().min(0),
})

export const OpportunitySchema = z.object({
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

export const MatchScoreSchema = z.object({
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

export type UserProfile = z.infer<typeof UserProfileSchema>
export type Opportunity = z.infer<typeof OpportunitySchema>
export type MatchScore = z.infer<typeof MatchScoreSchema>
