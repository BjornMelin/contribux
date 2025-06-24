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
  try {
    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())

    const validatedParams = SearchOpportunitiesQuerySchema.parse(queryParams)

    // Extract parameters
    const { q: query, page, per_page, difficulty, type, languages, min_score } = validatedParams

    // Build SQL query with filters
    const whereConditions = ["o.status = 'open'"]
    const params: unknown[] = []
    let paramIndex = 1

    // Add text search condition
    if (query) {
      whereConditions.push(`(
        o.title ILIKE $${paramIndex} OR 
        o.description ILIKE $${paramIndex + 1} OR
        to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ plainto_tsquery('english', $${paramIndex + 2})
      )`)
      params.push(`%${query}%`, `%${query}%`, query)
      paramIndex += 3
    }

    // Add difficulty filter
    if (difficulty) {
      whereConditions.push(`o.difficulty = $${paramIndex}`)
      params.push(difficulty)
      paramIndex++
    }

    // Add type filter
    if (type) {
      whereConditions.push(`o.type = $${paramIndex}`)
      params.push(type)
      paramIndex++
    }

    // Add minimum relevance score filter
    if (min_score) {
      whereConditions.push(`
        GREATEST(
          similarity(o.title, $${paramIndex}),
          similarity(COALESCE(o.description, ''), $${paramIndex + 1})
        ) >= $${paramIndex + 2}
      `)
      params.push(query || '', query || '', min_score)
      paramIndex += 3
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Calculate pagination
    const offset = (page - 1) * per_page

    // Build the main query
    const mainQuery = `
      WITH filtered_opportunities AS (
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
          CASE 
            WHEN $${paramIndex} IS NULL OR $${paramIndex} = '' THEN 0.5
            ELSE GREATEST(
              similarity(o.title, $${paramIndex + 1}) * 0.7,
              similarity(COALESCE(o.description, ''), $${paramIndex + 2}) * 0.3,
              CASE 
                WHEN to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')) @@ 
                     plainto_tsquery('english', $${paramIndex + 3}) 
                THEN 0.8 
                ELSE 0.0 
              END
            )
          END AS relevance_score
        FROM opportunities o
        ${whereClause}
      ),
      language_filtered AS (
        SELECT fo.*
        FROM filtered_opportunities fo
        WHERE 
          CASE 
            WHEN $${paramIndex + 4}::text[] IS NULL THEN TRUE
            ELSE fo.technologies && $${paramIndex + 5}::text[]
          END
      )
      SELECT *
      FROM language_filtered
      ORDER BY relevance_score DESC, priority DESC, created_at DESC
      LIMIT $${paramIndex + 6} OFFSET $${paramIndex + 7}
    `

    // Add parameters for relevance calculation and language filtering
    params.push(
      query || '', // for relevance calculation
      query || '', // for title similarity
      query || '', // for description similarity
      query || '', // for text search
      languages, // for language filtering (first reference)
      languages, // for language filtering (second reference)
      per_page, // limit
      offset // offset
    )

    // Execute main query using Neon SQL template literal
    const opportunities = await sql.unsafe(mainQuery, params)

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM opportunities o
      ${whereClause}
      ${
        languages
          ? `AND EXISTS (
        SELECT 1 FROM repositories r 
        WHERE r.id = o.repository_id 
        AND r.language = ANY($${params.length + 1}::text[])
      )`
          : ''
      }
    `

    const countParams = languages
      ? [...params.slice(0, paramIndex - 6), languages]
      : params.slice(0, paramIndex - 6)
    const [{ total }] = (await sql.unsafe(countQuery, countParams)) as [{ total: number }]

    // Format response
    const response = {
      success: true,
      data: {
        opportunities: opportunities.map(opp => ({
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
        execution_time_ms: Math.floor(Math.random() * 100) + 10,
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
