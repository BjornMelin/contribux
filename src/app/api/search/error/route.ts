/**
 * Error Simulation API Route
 * Used for testing error handling in development and test environments
 * Should be disabled or removed in production
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { env } from '@/lib/validation/env'

// Error response schema
const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string(),
})

export async function GET() {
  // Only allow in non-production environments
  if (env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not available',
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      },
      { status: 404 }
    )
  }

  try {
    // Simulate different types of errors for testing
    const errorType = Math.random()

    if (errorType < 0.3) {
      // Database connection error
      const response = {
        success: false as const,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database connection failed',
          details: {
            retryAfter: 30,
            errorCode: 'CONN_TIMEOUT',
            service: 'postgresql',
          },
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      }

      const validatedResponse = ErrorResponseSchema.parse(response)
      return NextResponse.json(validatedResponse, { status: 503 })
    }
    if (errorType < 0.6) {
      // Rate limiting error
      const response = {
        success: false as const,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: {
            retryAfter: 60,
            limit: 100,
            remaining: 0,
            resetTime: new Date(Date.now() + 60000).toISOString(),
          },
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      }

      const validatedResponse = ErrorResponseSchema.parse(response)
      return NextResponse.json(validatedResponse, { status: 429 })
    }
    // Generic internal server error
    const response = {
      success: false as const,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {
          retryAfter: 30,
          errorId: `err_${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }

    const validatedResponse = ErrorResponseSchema.parse(response)
    return NextResponse.json(validatedResponse, { status: 500 })
  } catch (error) {
    // Fallback error response
    const fallbackResponse = {
      success: false as const,
      error: {
        code: 'SIMULATION_ERROR',
        message: 'Error simulation failed',
        details: {
          originalError: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }

    return NextResponse.json(fallbackResponse, { status: 500 })
  }
}
