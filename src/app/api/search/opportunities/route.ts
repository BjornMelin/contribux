/**
 * Search Opportunities API Route
 * Provides semantic search functionality for contribution opportunities
 * Phase 3: Migrated to Drizzle ORM with type-safe queries
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { OpportunityQueries } from '@/lib/db/queries/opportunities'

// Request validation schema
const SearchOpportunitiesQuerySchema = z
  .object({
    q: z.string().optional(),
    page: z.string().pipe(z.coerce.number().int().min(1)).default('1'),
    per_page: z.string().pipe(z.coerce.number().int().min(1).max(100)).default('20'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    min_difficulty_score: z.string().pipe(z.coerce.number().int().min(1).max(10)).optional(),
    max_difficulty_score: z.string().pipe(z.coerce.number().int().min(1).max(10)).optional(),
    min_impact_score: z.string().pipe(z.coerce.number().int().min(1).max(10)).optional(),
    max_impact_score: z.string().pipe(z.coerce.number().int().min(1).max(10)).optional(),
    repository_id: z.string().uuid().optional(),
    good_first_issue: z
      .string()
      .optional()
      .transform(str => str === 'true'),
    mentorship_available: z
      .string()
      .optional()
      .transform(str => str === 'true'),
    hacktoberfest: z
      .string()
      .optional()
      .transform(str => str === 'true'),
    labels: z
      .string()
      .optional()
      .transform(str => (str ? str.split(',').filter(Boolean) : [])),
    skills_required: z
      .string()
      .optional()
      .transform(str => (str ? str.split(',').filter(Boolean) : [])),
    sort_by: z
      .enum(['difficulty', 'impact', 'match', 'created', 'updated', 'relevance'])
      .optional()
      .default('match'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .transform(data => ({
    ...data,
    // Add computed pagination metadata
    offset: (data.page - 1) * data.per_page,
    limit: data.per_page,
    // Normalize search query
    normalizedQuery: data.q?.trim().toLowerCase(),
    // Parse difficulty range for easier processing
    difficultyRange:
      data.min_difficulty_score && data.max_difficulty_score
        ? ([data.min_difficulty_score, data.max_difficulty_score] as const)
        : undefined,
    // Parse impact range
    impactRange:
      data.min_impact_score && data.max_impact_score
        ? ([data.min_impact_score, data.max_impact_score] as const)
        : undefined,
  }))
  // Break down complex superRefine into focused validation functions
  .refine(
    data => {
      // Validate difficulty range consistency
      if (data.min_difficulty_score && data.max_difficulty_score) {
        return data.min_difficulty_score <= data.max_difficulty_score
      }
      return true
    },
    {
      message: 'Minimum difficulty score cannot be greater than maximum difficulty score',
      path: ['min_difficulty_score'],
    }
  )
  .refine(
    data => {
      // Validate impact range consistency
      if (data.min_impact_score && data.max_impact_score) {
        return data.min_impact_score <= data.max_impact_score
      }
      return true
    },
    {
      message: 'Minimum impact score cannot be greater than maximum impact score',
      path: ['min_impact_score'],
    }
  )
  .refine(
    data => {
      // Validate search query minimum length
      if (data.q && data.q.length > 0) {
        return data.q.trim().length >= 2
      }
      return true
    },
    {
      message: 'Search query must be at least 2 characters long',
      path: ['q'],
    }
  )
  .refine(
    data => {
      // Validate search query prohibited characters
      if (data.q && data.q.length > 0) {
        return !/[<>{}[\]\\]/.test(data.q)
      }
      return true
    },
    {
      message: 'Search query contains prohibited characters',
      path: ['q'],
    }
  )
  .refine(
    data => {
      // Validate labels format
      return !data.labels?.some(label => label.length > 50)
    },
    {
      message: 'Label names cannot exceed 50 characters',
      path: ['labels'],
    }
  )
  .refine(
    data => {
      // Validate skills format
      return !data.skills_required?.some(skill => skill.length > 30)
    },
    {
      message: 'Skill names cannot exceed 30 characters',
      path: ['skills_required'],
    }
  )
  .refine(
    data => {
      // Validate pagination constraints
      const maxAllowedOffset = 10000 // Prevent deep pagination performance issues
      return data.offset <= maxAllowedOffset
    },
    {
      message: 'Pagination offset cannot exceed 10000. Please use more specific search criteria.',
      path: ['page'],
    }
  )
  .refine(
    data => {
      // Business logic validation for beginner difficulty conflicts
      if (data.difficulty === 'beginner' && data.min_difficulty_score) {
        return data.min_difficulty_score <= 3
      }
      return true
    },
    {
      message: 'Beginner difficulty conflicts with minimum difficulty score greater than 3',
      path: ['difficulty'],
    }
  )
  .refine(
    data => {
      // Business logic validation for advanced difficulty conflicts
      if (data.difficulty === 'advanced' && data.max_difficulty_score) {
        return data.max_difficulty_score >= 7
      }
      return true
    },
    {
      message: 'Advanced difficulty conflicts with maximum difficulty score less than 7',
      path: ['difficulty'],
    }
  )
  .refine(
    data => {
      // Global validation: ensure at least one search criterion is provided for performance
      return !!(
        data.q ||
        data.difficulty ||
        data.min_difficulty_score ||
        data.max_difficulty_score ||
        data.min_impact_score ||
        data.max_impact_score ||
        data.repository_id ||
        data.good_first_issue ||
        data.mentorship_available ||
        data.hacktoberfest ||
        data.labels?.length ||
        data.skills_required?.length
      )
    },
    {
      message: 'At least one search criterion must be provided',
      path: [],
    }
  )

// Response schema - Updated to match new Drizzle schema structure
const OpportunitySchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid().nullable(),
  issueNumber: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  metadata: z
    .object({
      labels: z.array(z.string()).optional(),
      author: z
        .object({
          login: z.string().optional(),
          id: z.number().optional(),
          avatarUrl: z.string().optional(),
        })
        .optional(),
      assignees: z
        .array(
          z.object({
            login: z.string().optional(),
            id: z.number().optional(),
          })
        )
        .optional(),
      state: z.enum(['open', 'closed']).optional(),
      locked: z.boolean().optional(),
      comments: z.number().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      closedAt: z.string().optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      estimatedHours: z.number().optional(),
      skillsRequired: z.array(z.string()).optional(),
      mentorshipAvailable: z.boolean().optional(),
      goodFirstIssue: z.boolean().optional(),
      hacktoberfest: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      complexity: z.number().optional(),
      impactLevel: z.enum(['low', 'medium', 'high']).optional(),
      learningOpportunity: z.number().optional(),
      communitySupport: z.boolean().optional(),
      documentationNeeded: z.boolean().optional(),
      testingRequired: z.boolean().optional(),
    })
    .optional(),
  difficultyScore: z.number(),
  impactScore: z.number(),
  matchScore: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Import service functions
  const { OpportunitySearchService } = require('@/lib/business-logic/search-service')

  try {
    // Check authentication using service
    if (!(await OpportunitySearchService.checkAuthentication(request))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      )
    }

    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const validatedParams = SearchOpportunitiesQuerySchema.parse(queryParams)

    // Build search options using service
    const searchOptions = OpportunitySearchService.buildSearchOptions(validatedParams)
    const query = validatedParams.q || ''

    // Execute search using existing type-safe Drizzle queries
    const [opportunities, stats] = await Promise.all([
      OpportunityQueries.search(query, searchOptions),
      OpportunityQueries.getStats(),
    ])

    // Transform and build response using service
    const transformedOpportunities = OpportunitySearchService.transformOpportunities(opportunities)
    const response = OpportunitySearchService.buildApiResponse(
      transformedOpportunities,
      validatedParams,
      stats,
      query,
      startTime
    )

    // Validate response against schema
    const validatedOpportunities = z.array(OpportunitySchema).parse(response.data.opportunities)

    return NextResponse.json({
      ...response,
      data: {
        ...response.data,
        opportunities: validatedOpportunities,
      },
    })
  } catch (error) {
    return OpportunitySearchService.handleApiError(error)
  }
}
