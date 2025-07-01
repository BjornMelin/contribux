/**
 * Search Repositories API Route
 * Provides semantic search functionality for repositories with authentication
 * Phase 3: Migrated to Drizzle ORM with type-safe queries
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { RepositoryQueries, type RepositorySearchOptions } from '@/lib/db/queries/repositories'

// Request validation schema
const SearchRepositoriesQuerySchema = z.object({
  q: z.string().optional(),
  page: z.string().pipe(z.coerce.number().int().min(1)).default('1'),
  per_page: z.string().pipe(z.coerce.number().int().min(1).max(100)).default('20'),
  language: z.string().optional(),
  min_stars: z.string().pipe(z.coerce.number().int().min(0)).optional(),
  topics: z
    .string()
    .optional()
    .transform(str => str?.split(',').filter(Boolean) || []),
  sort_by: z.enum(['stars', 'updated', 'created', 'name', 'relevance']).optional().default('stars'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  has_issues: z
    .string()
    .optional()
    .transform(str => str === 'true'),
  is_archived: z
    .string()
    .optional()
    .transform(str => str === 'true'),
  license: z.string().optional(),
})

// Response schema - Updated to match new Drizzle schema structure
const RepositorySchema = z.object({
  id: z.string().uuid(),
  githubId: z.number(),
  fullName: z.string(),
  name: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  metadata: z
    .object({
      language: z.string().optional(),
      primaryLanguage: z.string().optional(),
      languages: z.record(z.number()).optional(),
      stars: z.number().optional(),
      forks: z.number().optional(),
      watchers: z.number().optional(),
      openIssues: z.number().optional(),
      license: z.string().optional(),
      topics: z.array(z.string()).optional(),
      defaultBranch: z.string().optional(),
      size: z.number().optional(),
      archived: z.boolean().optional(),
      disabled: z.boolean().optional(),
      private: z.boolean().optional(),
      fork: z.boolean().optional(),
      hasIssues: z.boolean().optional(),
      hasProjects: z.boolean().optional(),
      hasWiki: z.boolean().optional(),
      hasPages: z.boolean().optional(),
      hasDownloads: z.boolean().optional(),
      pushedAt: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      homepage: z.string().optional(),
      cloneUrl: z.string().optional(),
      sshUrl: z.string().optional(),
      gitUrl: z.string().optional(),
    })
    .optional(),
  healthMetrics: z
    .object({
      maintainerResponsiveness: z.number().optional(),
      activityLevel: z.number().optional(),
      codeQuality: z.number().optional(),
      communityEngagement: z.number().optional(),
      documentationQuality: z.number().optional(),
      testCoverage: z.number().optional(),
      securityScore: z.number().optional(),
      overallScore: z.number().optional(),
      lastCalculated: z.string().optional(),
      issueResolutionTime: z.number().optional(),
      prMergeTime: z.number().optional(),
      contributorCount: z.number().optional(),
      recentCommits: z.number().optional(),
      releaseFrequency: z.number().optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// Authentication helper with NextAuth.js
import { rateLimit } from '@/lib/auth/rate-limiter'

async function checkAuthentication(_request: NextRequest): Promise<boolean> {
  try {
    // Use NextAuth.js session instead of custom JWT
    const session = await auth()
    return !!session?.user
  } catch (_error) {
    return false
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Enhanced security: Rate limiting
    const rateLimitResult = await rateLimit(request, {
      limit: 100, // 100 requests per minute for search
      window: 60 * 1000,
    })

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many search requests. Please try again later.',
          },
          rateLimitInfo: {
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            resetTime: new Date(rateLimitResult.reset).toISOString(),
          },
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'Retry-After': '60',
          },
        }
      )
    }

    // Enhanced security: Authentication check
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

    // Enhanced security: Input validation and sanitization
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())

    // Sanitize inputs to prevent injection attacks
    const sanitizedParams = Object.fromEntries(
      Object.entries(queryParams).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.replace(/[<>"']/g, '') : value,
      ])
    )

    const validatedParams = SearchRepositoriesQuerySchema.parse(sanitizedParams)

    // Enhanced security: Request size validation
    const queryString = url.search
    if (queryString.length > 2048) {
      // 2KB limit for query parameters
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: 'Query parameters exceed maximum allowed size',
          },
        },
        { status: 413 }
      )
    }

    // Extract parameters with additional security checks
    const {
      q: query,
      page,
      per_page,
      language,
      min_stars,
      topics,
      sort_by,
      order,
      has_issues,
      is_archived,
      license,
    } = validatedParams

    // Security: Limit results to prevent resource exhaustion
    const safePage = Math.min(page, 100) // Max 100 pages
    const safePerPage = Math.min(per_page, 100) // Max 100 items per page
    const offset = (safePage - 1) * safePerPage

    // Build search options with security constraints
    const searchOptions: RepositorySearchOptions = {
      limit: safePerPage,
      offset,
      sortBy: sort_by,
      order,
      ...(min_stars !== undefined && { minStars: Math.min(min_stars, 1000000) }), // Reasonable upper limit
      languages: language ? [language] : [],
      topics,
      hasIssues: has_issues,
      isArchived: is_archived,
      ...(license && { license }),
    }

    // Execute search with timeout protection
    const searchPromise = RepositoryQueries.search(query || '', searchOptions)
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error('Search timeout')), 10000) // 10 second timeout
    )

    const repositories = (await Promise.race([searchPromise, timeoutPromise])) as Array<{
      id: string
      name: string
      owner: { login: string }
      description?: string
      stargazers_count: number
      language?: string
      topics?: string[]
      created_at: string
      updated_at: string
      [key: string]: unknown
    }>

    // Get repository statistics
    const stats = await RepositoryQueries.getStats()

    // Transform results with security considerations
    const transformedRepositories = repositories.map(repo => ({
      id: repo.id,
      githubId: repo.githubId,
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      description: repo.description ? repo.description.substring(0, 500) : null, // Limit description length
      metadata: repo.metadata || {},
      healthMetrics: repo.healthMetrics || {},
      createdAt:
        repo.createdAt instanceof Date ? repo.createdAt.toISOString() : new Date().toISOString(),
      updatedAt:
        repo.updatedAt instanceof Date ? repo.updatedAt.toISOString() : new Date().toISOString(),
    }))

    const totalCount = Math.min(stats.total, 10000) // Security: Cap total count

    // Enhanced response with security headers
    const response = {
      success: true,
      data: {
        repositories: transformedRepositories,
        total_count: totalCount,
        page: safePage,
        per_page: safePerPage,
        has_more: offset + repositories.length < totalCount,
      },
      metadata: {
        query: query || '',
        filters: {
          language,
          min_stars,
          topics,
          sort_by,
          order,
          has_issues,
          is_archived,
          license,
        },
        execution_time_ms: Date.now() - startTime,
        request_id: requestId,
        performance_note: 'Query optimized with security constraints and HNSW indexes',
      },
    }

    // Validate response data
    const validatedRepositories = z.array(RepositorySchema).parse(response.data.repositories)

    const finalResponse = NextResponse.json({
      ...response,
      data: {
        ...response.data,
        repositories: validatedRepositories,
      },
    })

    // Add comprehensive security headers
    finalResponse.headers.set('X-Content-Type-Options', 'nosniff')
    finalResponse.headers.set('X-Frame-Options', 'DENY')
    finalResponse.headers.set('X-XSS-Protection', '1; mode=block')
    finalResponse.headers.set('X-Request-ID', requestId)
    finalResponse.headers.set('X-Processing-Time', `${Date.now() - startTime}ms`)
    finalResponse.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString())
    finalResponse.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())

    return finalResponse
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Invalid request parameters',
            details: error.issues.map(issue => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    // Handle timeout errors
    if (error instanceof Error && error.message === 'Search timeout') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Search request timed out. Please try a more specific query.',
          },
          request_id: requestId,
        },
        { status: 408 }
      )
    }

    // Generic error response (don't leak internal details)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        request_id: requestId,
      },
      { status: 500 }
    )
  }
}
