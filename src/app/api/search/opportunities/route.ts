/**
 * Search Opportunities API Route
 * Provides semantic search functionality for contribution opportunities
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildApiResponse,
  calculatePaginationOffset,
  createInternalErrorResponse,
  createValidationErrorResponse,
  executeCountQuery,
  executeOpportunitiesQuery,
  parseAndValidateParams,
  validateResponseData,
} from './helpers'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Parse and validate query parameters
    const validatedParams = parseAndValidateParams(request)

    // Calculate pagination
    const offset = calculatePaginationOffset(validatedParams.page, validatedParams.per_page)

    // Execute database queries
    const [opportunities, totalCount] = await Promise.all([
      executeOpportunitiesQuery(validatedParams, offset),
      executeCountQuery(validatedParams),
    ])

    // Build response
    const response = buildApiResponse(opportunities, totalCount, validatedParams, offset, startTime)

    // Validate response data
    const validatedOpportunities = validateResponseData(response.data.opportunities)

    return NextResponse.json({
      ...response,
      data: {
        ...response.data,
        opportunities: validatedOpportunities,
      },
    })
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error)
    }

    // Handle database errors
    return createInternalErrorResponse()
  }
}
