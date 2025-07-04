/**
 * Search Opportunities API Route Helpers
 * Extracted helper functions to reduce cognitive complexity
 */

import { sql } from '@/lib/db/config'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// Request validation schema
export const SearchOpportunitiesQuerySchema = z.object({
  q: z.string().optional(),
  page: z.string().pipe(z.coerce.number().int().min(1)).default('1'),
  per_page: z.string().pipe(z.coerce.number().int().min(1).max(100)).default('20'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  type: z.enum(['bug_fix', 'feature', 'documentation', 'test', 'refactor', 'security']).optional(),
  languages: z
    .string()
    .optional()
    .transform(val => val?.split(',').map(lang => lang.trim())),
  min_score: z.string().pipe(z.coerce.number().min(0).max(1)).optional(),
})

// Response schemas
export const OpportunitySchema = z.object({
  id: z.string().uuid(),
  repository_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  difficulty: z.string(),
  priority: z.number(),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  estimated_hours: z.number().nullable(),
  created_at: z.string(),
  relevance_score: z.number(),
})

// Database type definition
export type DatabaseOpportunity = {
  created_at: string
  technologies: string[] | null
  required_skills: string[] | null
  labels: unknown[]
  [key: string]: unknown
}

// Validated parameters type
export type ValidatedSearchParams = z.infer<typeof SearchOpportunitiesQuerySchema>

/**
 * Parse and validate query parameters from request URL
 */
export function parseAndValidateParams(request: NextRequest): ValidatedSearchParams {
  const url = new URL(request.url)
  const queryParams = Object.fromEntries(url.searchParams.entries())
  return SearchOpportunitiesQuerySchema.parse(queryParams)
}

/**
 * Calculate pagination offset
 */
export function calculatePaginationOffset(page: number, perPage: number): number {
  return (page - 1) * perPage
}

/**
 * Build where conditions for the main query
 */
function buildWhereConditions(params: ValidatedSearchParams) {
  const { q: query, difficulty, type, min_score } = params

  // Base condition - always include
  let whereClause = sql`o.status = 'open'`

  // Text search condition
  if (query) {
    whereClause = sql`${whereClause} AND (
      o.title ILIKE ${`%${query}%`} OR 
      o.description ILIKE ${`%${query}%`} OR
      to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ plainto_tsquery('english', ${query})
    )`
  }

  // Difficulty filter
  if (difficulty) {
    whereClause = sql`${whereClause} AND o.difficulty = ${difficulty}`
  }

  // Type filter
  if (type) {
    whereClause = sql`${whereClause} AND o.type = ${type}`
  }

  // Minimum score filter
  if (min_score) {
    whereClause = sql`${whereClause} AND GREATEST(
      similarity(o.title, ${query || ''}),
      similarity(COALESCE(o.description, ''), ${query || ''})
    ) >= ${min_score}`
  }

  return whereClause
}

/**
 * Execute the main opportunities search query
 */
export async function executeOpportunitiesQuery(
  params: ValidatedSearchParams,
  offset: number
): Promise<DatabaseOpportunity[]> {
  const { per_page } = params
  const whereConditions = buildWhereConditions(params)

  const query = sql`
    SELECT DISTINCT
      o.id,
      o.repository_id,
      o.title,
      o.description,
      o.type,
      o.difficulty,
      o.priority,
      o.required_skills,
      COALESCE(
        (SELECT array_agg(DISTINCT r.language) 
         FROM repositories r 
         WHERE r.id = o.repository_id AND r.language IS NOT NULL), 
        '{}'::text[]
      ) as technologies,
      o.good_first_issue,
      o.help_wanted,
      o.estimated_hours,
      o.created_at,
      0.5 AS relevance_score
    FROM opportunities o
    WHERE ${whereConditions}
    ORDER BY priority DESC, created_at DESC
    LIMIT ${per_page} OFFSET ${offset}
  `

  return (await query) as unknown as DatabaseOpportunity[]
}

/**
 * Execute the count query for pagination
 */
export async function executeCountQuery(params: ValidatedSearchParams): Promise<number> {
  const whereConditions = buildWhereConditions(params)

  const query = sql`
    SELECT COUNT(DISTINCT o.id) as total
    FROM opportunities o
    WHERE ${whereConditions}
  `

  const countResult = (await query) as unknown as [{ total: number }]
  const [{ total }] = countResult
  return Number(total)
}

/**
 * Format database opportunities for response
 */
export function formatOpportunities(opportunities: DatabaseOpportunity[]): unknown[] {
  return opportunities.map((opp: DatabaseOpportunity) => ({
    ...opp,
    created_at: new Date(opp.created_at as string).toISOString(),
    technologies: opp.technologies || [],
    required_skills: opp.required_skills || [],
  }))
}

/**
 * Build API response object
 */
export function buildApiResponse(
  opportunities: DatabaseOpportunity[],
  totalCount: number,
  params: ValidatedSearchParams,
  offset: number,
  startTime: number
) {
  const { q: query, page, per_page, difficulty, type, languages, min_score } = params

  return {
    success: true,
    data: {
      opportunities: formatOpportunities(opportunities),
      total_count: totalCount,
      page,
      per_page,
      has_more: offset + opportunities.length < totalCount,
    },
    metadata: {
      query: query || '',
      filters: {
        difficulty,
        type,
        languages,
        min_score,
      },
      execution_time_ms: Date.now() - startTime,
    },
  }
}

/**
 * Validate response opportunities against schema
 */
export function validateResponseData(responseData: unknown[]) {
  return z.array(OpportunitySchema).parse(responseData)
}

/**
 * Create error response for validation errors
 */
export function createValidationErrorResponse(error: z.ZodError) {
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

/**
 * Create error response for internal server errors
 */
export function createInternalErrorResponse() {
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
