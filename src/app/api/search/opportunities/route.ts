/**
 * Search Opportunities API Route
 * Provides semantic search functionality for contribution opportunities
 * Phase 3: Migrated to Drizzle ORM with type-safe queries
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { OpportunityQueries, type OpportunitySearchOptions } from '@/lib/db/queries/opportunities'

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
  .superRefine((data, ctx) => {
    // Advanced validation rules using superRefine for complex business logic

    // Validate difficulty range consistency
    if (data.min_difficulty_score && data.max_difficulty_score) {
      if (data.min_difficulty_score > data.max_difficulty_score) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Minimum difficulty score cannot be greater than maximum difficulty score',
          path: ['min_difficulty_score'],
        })
      }
    }

    // Validate impact range consistency
    if (data.min_impact_score && data.max_impact_score) {
      if (data.min_impact_score > data.max_impact_score) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Minimum impact score cannot be greater than maximum impact score',
          path: ['min_impact_score'],
        })
      }
    }

    // Validate search query constraints
    if (data.q && data.q.length > 0) {
      // Check for minimum search length
      if (data.q.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Search query must be at least 2 characters long',
          path: ['q'],
        })
      }

      // Check for prohibited characters
      if (/[<>{}[\]\\]/.test(data.q)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Search query contains prohibited characters',
          path: ['q'],
        })
      }
    }

    // Validate labels format
    if (data.labels?.some(label => label.length > 50)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Label names cannot exceed 50 characters',
        path: ['labels'],
      })
    }

    // Validate skills format
    if (data.skills_required?.some(skill => skill.length > 30)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Skill names cannot exceed 30 characters',
        path: ['skills_required'],
      })
    }

    // Validate pagination constraints
    const maxAllowedOffset = 10000 // Prevent deep pagination performance issues
    if (data.offset > maxAllowedOffset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Pagination offset cannot exceed ${maxAllowedOffset}. Please use more specific search criteria.`,
        path: ['page'],
      })
    }

    // Business logic validation for conflicting filters
    if (
      data.difficulty === 'beginner' &&
      data.min_difficulty_score &&
      data.min_difficulty_score > 3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Beginner difficulty conflicts with minimum difficulty score greater than 3',
        path: ['difficulty'],
      })
    }

    if (
      data.difficulty === 'advanced' &&
      data.max_difficulty_score &&
      data.max_difficulty_score < 7
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Advanced difficulty conflicts with maximum difficulty score less than 7',
        path: ['difficulty'],
      })
    }
  })
  .refine(
    data => {
      // Global validation: ensure at least one search criterion is provided for performance
      const hasSearchCriteria = !!(
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

      return hasSearchCriteria
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

// Authentication helper with NextAuth.js
async function checkAuthentication(_request: NextRequest): Promise<boolean> {
  try {
    // Use NextAuth.js session instead of custom JWT
    const session = await auth()
    return !!session?.user
  } catch (_error) {
    return false
  }
}

// Helper to build search options from validated parameters
function buildSearchOptions(
  params: z.infer<typeof SearchOpportunitiesQuerySchema>
): OpportunitySearchOptions {
  const {
    page,
    per_page,
    difficulty,
    min_difficulty_score,
    max_difficulty_score,
    min_impact_score,
    max_impact_score,
    repository_id,
    good_first_issue,
    mentorship_available,
    hacktoberfest,
    labels,
    skills_required,
    sort_by,
    order,
  } = params

  const offset = (page - 1) * per_page

  return {
    limit: per_page,
    offset,
    sortBy: sort_by,
    order,
    ...(difficulty && { difficulty }),
    ...(min_difficulty_score !== undefined && { minDifficultyScore: min_difficulty_score }),
    ...(max_difficulty_score !== undefined && { maxDifficultyScore: max_difficulty_score }),
    ...(min_impact_score !== undefined && { minImpactScore: min_impact_score }),
    ...(max_impact_score !== undefined && { maxImpactScore: max_impact_score }),
    ...(repository_id && { repositoryId: repository_id }),
    ...(good_first_issue !== undefined && { goodFirstIssue: good_first_issue }),
    ...(mentorship_available !== undefined && { mentorshipAvailable: mentorship_available }),
    ...(hacktoberfest !== undefined && { hacktoberfest }),
    ...(labels && labels.length > 0 && { labels }),
    ...(skills_required && skills_required.length > 0 && { skillsRequired: skills_required }),
  }
}

// Helper to transform opportunities for API response
function transformOpportunities(opportunities: unknown[]) {
  return opportunities.map(opportunity => {
    const opp = opportunity as Record<string, unknown>
    return {
      id: opp.id,
      repositoryId: opp.repositoryId,
      issueNumber: opp.issueNumber,
      title: opp.title,
      description: opp.description,
      url: opp.url,
      metadata: opp.metadata || {},
      difficultyScore: opp.difficultyScore,
      impactScore: opp.impactScore,
      matchScore: opp.matchScore,
      createdAt: opp.createdAt
        ? new Date(opp.createdAt as string | number | Date).toISOString()
        : new Date().toISOString(),
      updatedAt: opp.updatedAt
        ? new Date(opp.updatedAt as string | number | Date).toISOString()
        : new Date().toISOString(),
    }
  })
}

// Helper to build API response object
function buildApiResponse(
  opportunities: unknown[],
  params: z.infer<typeof SearchOpportunitiesQuerySchema>,
  stats: unknown,
  query: string,
  startTime: number
) {
  const { page, per_page } = params
  const offset = (page - 1) * per_page
  const statsObj = stats as Record<string, unknown>
  const totalCount = Math.min(Number(statsObj.total) || 0, 10000) // Cap for performance

  return {
    success: true,
    data: {
      opportunities,
      total_count: totalCount,
      page,
      per_page,
      has_more: offset + opportunities.length < totalCount,
    },
    metadata: {
      query,
      filters: {
        difficulty: params.difficulty,
        min_difficulty_score: params.min_difficulty_score,
        max_difficulty_score: params.max_difficulty_score,
        min_impact_score: params.min_impact_score,
        max_impact_score: params.max_impact_score,
        repository_id: params.repository_id,
        good_first_issue: params.good_first_issue,
        mentorship_available: params.mentorship_available,
        hacktoberfest: params.hacktoberfest,
        labels: params.labels,
        skills_required: params.skills_required,
        sort_by: params.sort_by,
        order: params.order,
      },
      execution_time_ms: Date.now() - startTime,
      performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
      stats: {
        total: statsObj.total,
        beginnerFriendly: statsObj.beginnerFriendly,
        withMentorship: statsObj.withMentorship,
        embeddingCoverage: statsObj.embeddingCoverage,
      },
    },
  }
}

// Helper to handle and format errors
function handleApiError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: error.issues[0]?.message || 'Invalid parameters',
          details: error.issues,
        },
      },
      { status: 400 }
    )
  }

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Check authentication
    if (!(await checkAuthentication(request))) {
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

    // Build search options using helper
    const searchOptions = buildSearchOptions(validatedParams)
    const query = validatedParams.q || ''

    // Execute search using new type-safe Drizzle queries
    const [opportunities, stats] = await Promise.all([
      OpportunityQueries.search(query, searchOptions),
      OpportunityQueries.getStats(),
    ])

    // Transform and build response using helpers
    const transformedOpportunities = transformOpportunities(opportunities)
    const response = buildApiResponse(
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
    return handleApiError(error)
  }
}
