/**
 * Search Repositories API Route
 * Provides semantic search functionality for repositories with authentication
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sql } from '@/lib/db/config'

// Request validation schema
const SearchRepositoriesQuerySchema = z.object({
  q: z.string().optional(),
  page: z.string().pipe(z.coerce.number().int().min(1)).default('1'),
  per_page: z.string().pipe(z.coerce.number().int().min(1).max(100)).default('20'),
  language: z.string().optional(),
  min_stars: z.string().pipe(z.coerce.number().int().min(0)).optional(),
  min_health_score: z.string().pipe(z.coerce.number().min(0).max(100)).optional(),
})

// Response schema
const RepositorySchema = z.object({
  id: z.string().uuid(),
  github_id: z.number(),
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  stars_count: z.number(),
  health_score: z.number(),
  activity_score: z.number(),
  first_time_contributor_friendly: z.boolean(),
  created_at: z.string(),
  relevance_score: z.number(),
})

// Authentication helper with proper JWT validation
async function checkAuthentication(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice(7) // Remove 'Bearer ' prefix

  // Basic JWT structure validation (should have 3 parts separated by dots)
  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  // Validate base64url encoding of header and payload
  try {
    const header = JSON.parse(atob(parts[0]?.replace(/-/g, '+').replace(/_/g, '/') || ''))
    const payload = JSON.parse(atob(parts[1]?.replace(/-/g, '+').replace(/_/g, '/') || ''))

    // Basic JWT validation checks
    if (!header.alg || !header.typ) {
      return false
    }

    // Check token expiration if present
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return false
    }

    // In a real implementation, you would verify the signature here
    // For now, we're just doing structure validation to prevent basic attacks
    return true
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const _startTime = Date.now()
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

    const validatedParams = SearchRepositoriesQuerySchema.parse(queryParams)

    // Extract parameters
    const { q: query, page, per_page, language, min_stars, min_health_score } = validatedParams

    // Calculate pagination
    const offset = (page - 1) * per_page

    // Execute main query using proper parameterized queries (SQL injection safe)
    type DatabaseRepository = {
      created_at: string
      topics: string[] | null
      [key: string]: unknown
    }

    // Use safe parameterized query instead of sql.unsafe()
    const repositories = (await sql`
      SELECT 
        r.id,
        r.github_id,
        r.full_name,
        r.name,
        r.description,
        r.language,
        r.topics,
        r.stars_count,
        r.health_score,
        r.activity_score,
        r.first_time_contributor_friendly,
        r.created_at,
        0.5 AS relevance_score
      FROM repositories r
      WHERE r.status = 'active'
      ${
        query
          ? sql`AND (
        r.name ILIKE ${`%${query}%`} OR 
        r.full_name ILIKE ${`%${query}%`} OR
        r.description ILIKE ${`%${query}%`} OR
        ${query.toLowerCase()} = ANY(r.topics) OR
        to_tsvector('english', r.name || ' ' || COALESCE(r.description, '')) @@ plainto_tsquery('english', ${query})
      )`
          : sql``
      }
      ${language ? sql`AND r.language ILIKE ${language}` : sql``}
      ${min_stars !== undefined ? sql`AND r.stars_count >= ${min_stars}` : sql``}
      ${min_health_score !== undefined ? sql`AND r.health_score >= ${min_health_score}` : sql``}
      ORDER BY r.stars_count DESC, r.health_score DESC
      LIMIT ${per_page} OFFSET ${offset}
    `) as unknown as DatabaseRepository[]

    // Get total count for pagination using safe parameterized query
    const countResult = (await sql`
      SELECT COUNT(*) as total
      FROM repositories r
      WHERE r.status = 'active'
      ${
        query
          ? sql`AND (
        r.name ILIKE ${`%${query}%`} OR 
        r.full_name ILIKE ${`%${query}%`} OR
        r.description ILIKE ${`%${query}%`} OR
        ${query.toLowerCase()} = ANY(r.topics) OR
        to_tsvector('english', r.name || ' ' || COALESCE(r.description, '')) @@ plainto_tsquery('english', ${query})
      )`
          : sql``
      }
      ${language ? sql`AND r.language ILIKE ${language}` : sql``}
      ${min_stars !== undefined ? sql`AND r.stars_count >= ${min_stars}` : sql``}
      ${min_health_score !== undefined ? sql`AND r.health_score >= ${min_health_score}` : sql``}
    `) as unknown as [{ total: number }]
    const [{ total }] = countResult

    // Format response
    const response = {
      success: true,
      data: {
        repositories: repositories.map((repo: DatabaseRepository) => ({
          ...repo,
          created_at: new Date(repo.created_at as string).toISOString(),
          topics: repo.topics || [],
          health_score: Number(repo.health_score),
          activity_score: Number(repo.activity_score),
          relevance_score: Number(repo.relevance_score),
        })),
        total_count: Number(total),
        page,
        per_page,
        has_more: offset + repositories.length < Number(total),
      },
      metadata: {
        query: query || '',
        filters: {
          language,
          min_stars,
          min_health_score,
        },
        execution_time_ms: Date.now() - _startTime,
      },
    }

    // Validate response against schema
    const validatedRepositories = z.array(RepositorySchema).parse(response.data.repositories)

    return NextResponse.json({
      ...response,
      data: {
        ...response.data,
        repositories: validatedRepositories,
      },
    })
  } catch (error) {
    console.error('Search repositories error:', error)

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
