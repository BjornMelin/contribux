/**
 * Search Opportunities API Route
 * Provides semantic search functionality for contribution opportunities
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sql } from '@/lib/db/config'

// Request validation schema
const SearchOpportunitiesQuerySchema = z.object({
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
const OpportunitySchema = z.object({
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

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())

    const validatedParams = SearchOpportunitiesQuerySchema.parse(queryParams)

    // Extract parameters
    const { q: query, page, per_page, difficulty, type, languages, min_score } = validatedParams

    // Calculate pagination
    const offset = (page - 1) * per_page

    // Execute main query using proper parameterized queries (SQL injection safe)
    type DatabaseOpportunity = {
      created_at: string
      technologies: string[] | null
      required_skills: string[] | null
      labels: unknown[]
      [key: string]: unknown
    }

    // Use safe parameterized query instead of sql.unsafe()
    const opportunities = (await sql`
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
      WHERE o.status = 'open'
      ${
        query
          ? sql`AND (
        o.title ILIKE ${`%${query}%`} OR 
        o.description ILIKE ${`%${query}%`} OR
        to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ plainto_tsquery('english', ${query})
      )`
          : sql``
      }
      ${difficulty ? sql`AND o.difficulty = ${difficulty}` : sql``}
      ${type ? sql`AND o.type = ${type}` : sql``}
      ${
        min_score
          ? sql`AND GREATEST(
        similarity(o.title, ${query || ''}),
        similarity(COALESCE(o.description, ''), ${query || ''})
      ) >= ${min_score}`
          : sql``
      }
      ORDER BY priority DESC, created_at DESC
      LIMIT ${per_page} OFFSET ${offset}
    `) as unknown as DatabaseOpportunity[]

    // Get total count for pagination using safe parameterized query
    const countResult = (await sql`
      SELECT COUNT(DISTINCT o.id) as total
      FROM opportunities o
      WHERE o.status = 'open'
      ${
        query
          ? sql`AND (
        o.title ILIKE ${`%${query}%`} OR 
        o.description ILIKE ${`%${query}%`} OR
        to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ plainto_tsquery('english', ${query})
      )`
          : sql``
      }
      ${difficulty ? sql`AND o.difficulty = ${difficulty}` : sql``}
      ${type ? sql`AND o.type = ${type}` : sql``}
      ${
        min_score
          ? sql`AND GREATEST(
        similarity(o.title, ${query || ''}),
        similarity(COALESCE(o.description, ''), ${query || ''})
      ) >= ${min_score}`
          : sql``
      }
    `) as unknown as [{ total: number }]
    const [{ total }] = countResult

    // Format response
    const response = {
      success: true,
      data: {
        opportunities: opportunities.map((opp: DatabaseOpportunity) => ({
          ...opp,
          created_at: new Date(opp.created_at as string).toISOString(),
          technologies: opp.technologies || [],
          required_skills: opp.required_skills || [],
        })),
        total_count: Number(total),
        page,
        per_page,
        has_more: offset + opportunities.length < Number(total),
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
    console.error('Search opportunities error:', error)

    // Handle validation errors
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

    // Handle database errors
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
}
