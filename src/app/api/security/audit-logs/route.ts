/**
 * Audit Logs API
 *
 * Provides secure access to audit logs with filtering and export capabilities.
 * Implements GDPR-compliant data access controls.
 */

import { authConfig } from '@/lib/auth'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { InputValidator } from '@/lib/security/input-validation'
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
// No audit config import needed - using hardcoded retention value

// Initialize services
const inputValidator = new InputValidator()

// Query parameter schema
const auditLogQuerySchema = z.object({
  type: z.nativeEnum(AuditEventType).optional(),
  severity: z.nativeEnum(AuditSeverity).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['timestamp', 'severity', 'type']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// TypeScript interfaces
type AuditLogQueryParams = z.infer<typeof auditLogQuerySchema>

interface QueryParams {
  [key: string]: string | number
}

interface AuditLogFilters {
  type?: AuditEventType
  severity?: AuditSeverity
  action?: { contains: string }
  timestamp?: { gte?: Date; lte?: Date }
  actor?: { id: string }
}

interface QueryOptions {
  limit: number
  offset: number
  orderBy: Record<string, 'asc' | 'desc'>
}

interface MockAuditLog {
  id: string
  type: AuditEventType
  severity: AuditSeverity
  timestamp: string
  actor: {
    type: string
    id: string
    ip: string
  }
  action: string
  result: string
  metadata: Record<string, unknown>
}

interface QueryResult {
  data: MockAuditLog[]
  total: number
}

// Helper function to check if user has admin privileges
async function isAdmin(userId: string): Promise<boolean> {
  // TODO: Implement proper admin check from database
  // For now, this is a placeholder
  return process.env.ADMIN_USER_IDS?.split(',').includes(userId) || false
}

/**
 * GET /api/security/audit-logs
 * Retrieve audit logs with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateUser()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isUserAdmin = await isAdmin(session.user.id)
    const params = await parseAndValidateQueryParams(request)
    if (!params) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
    }

    const filters = buildAuditLogFilters(params, session.user.id, isUserAdmin)
    const logs = await queryAuditLogs(filters, params)

    await logAuditAccess(session, filters, logs, isUserAdmin, request)

    return createAuditLogsResponse(logs, params)
  } catch (error) {
    await logAuditError('Audit log retrieval failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Authenticate user session
 */
async function authenticateUser() {
  const session = await getServerSession(authConfig)
  return session?.user?.id ? session : null
}

/**
 * Parse and validate query parameters
 */
async function parseAndValidateQueryParams(
  request: NextRequest
): Promise<AuditLogQueryParams | null> {
  const url = new URL(request.url)
  const queryParams: QueryParams = {}

  url.searchParams.forEach((value, key) => {
    if (key === 'limit' || key === 'offset') {
      queryParams[key] = Number.parseInt(value, 10)
    } else {
      queryParams[key] = value
    }
  })

  const validation = await inputValidator.validate(auditLogQuerySchema, queryParams)
  if (!validation.success || !validation.data) {
    return null
  }

  // Ensure required fields have default values
  const validatedData = {
    ...validation.data,
    limit: validation.data.limit ?? 100,
    offset: validation.data.offset ?? 0,
    sortBy: validation.data.sortBy ?? 'timestamp',
    sortOrder: validation.data.sortOrder ?? 'desc',
  }

  return validatedData
}

/**
 * Build filter criteria for audit log query
 */
function buildAuditLogFilters(
  params: AuditLogQueryParams,
  userId: string,
  isUserAdmin: boolean
): AuditLogFilters {
  const filters: AuditLogFilters = {
    ...(params.type && { type: params.type }),
    ...(params.severity && { severity: params.severity }),
    ...(params.action && { action: { contains: params.action } }),
  }

  // Add date filters
  if (params.startDate || params.endDate) {
    filters.timestamp = {
      ...(params.startDate && { gte: new Date(params.startDate) }),
      ...(params.endDate && { lte: new Date(params.endDate) }),
    }
  }

  // Add actor filters based on permissions
  if (!isUserAdmin) {
    filters.actor = { id: userId }
  } else if (params.actorId) {
    filters.actor = { id: params.actorId }
  }

  return filters
}

/**
 * Query audit logs with filters and options
 */
async function queryAuditLogs(
  filters: AuditLogFilters,
  params: AuditLogQueryParams
): Promise<QueryResult> {
  return await mockQueryAuditLogs(filters, {
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    orderBy: {
      [params.sortBy ?? 'timestamp']: params.sortOrder ?? 'desc',
    },
  })
}

/**
 * Log audit access for compliance
 */
async function logAuditAccess(
  session: { user: { id: string } },
  filters: AuditLogFilters,
  logs: QueryResult,
  isUserAdmin: boolean,
  request: NextRequest
): Promise<void> {
  await auditLogger.log({
    type: AuditEventType.DATA_ACCESS,
    severity: AuditSeverity.INFO,
    actor: {
      type: 'user',
      id: session.user.id,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    },
    action: 'Access audit logs',
    result: 'success',
    metadata: {
      filters,
      resultCount: logs.data.length,
      isAdminAccess: isUserAdmin,
    },
  })
}

/**
 * Create audit logs response
 */
function createAuditLogsResponse(logs: QueryResult, params: AuditLogQueryParams): NextResponse {
  return NextResponse.json({
    data: logs.data,
    pagination: {
      total: logs.total,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      hasMore: (params.offset ?? 0) + (params.limit ?? 100) < logs.total,
    },
  })
}

/**
 * Log audit errors
 */
async function logAuditError(action: string, error: unknown): Promise<void> {
  await auditLogger.log({
    type: AuditEventType.SYSTEM_ERROR,
    severity: AuditSeverity.ERROR,
    actor: { type: 'system' },
    action,
    result: 'failure',
    reason: error instanceof Error ? error.message : 'Unknown error',
  })
}

/**
 * POST /api/security/audit-logs/export
 * Export audit logs for compliance
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { format = 'json', scope = 'user' } = body

    // For GDPR compliance, users can export their own data
    // Admins can export broader data sets
    const isUserAdmin = await isAdmin(session.user.id)

    if (scope !== 'user' && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions for requested scope' },
        { status: 403 }
      )
    }

    // Build export filters
    const filters: AuditLogFilters = {}

    if (scope === 'user' || !isUserAdmin) {
      filters.actor = {
        id: session.user.id,
      }
    }

    // Query logs for export
    const logs = await mockQueryAuditLogs(filters, {
      limit: 10000, // Maximum export size
      offset: 0,
      orderBy: {
        timestamp: 'desc',
      },
    })

    // Format export data
    let exportData: string
    let contentType: string
    let filename: string

    switch (format) {
      case 'json':
        exportData = JSON.stringify(logs.data, null, 2)
        contentType = 'application/json'
        filename = `audit-logs-${session.user.id}-${new Date().toISOString().split('T')[0]}.json`
        break

      case 'csv': {
        // Convert to CSV
        const csvHeaders = [
          'Timestamp',
          'Type',
          'Severity',
          'Actor',
          'Action',
          'Result',
          'IP Address',
        ]
        const csvRows = [csvHeaders.join(',')]

        logs.data.forEach(log => {
          csvRows.push(
            [
              log.timestamp,
              log.type,
              log.severity,
              log.actor.id || log.actor.type,
              log.action,
              log.result,
              log.actor.ip || '',
            ]
              .map(field => `"${String(field).replace(/"/g, '""')}"`)
              .join(',')
          )
        })

        exportData = csvRows.join('\n')
        contentType = 'text/csv'
        filename = `audit-logs-${session.user.id}-${new Date().toISOString().split('T')[0]}.csv`
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
    }

    // Log export for compliance
    await auditLogger.log({
      type: AuditEventType.DATA_EXPORT,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'Export audit logs',
      result: 'success',
      metadata: {
        format,
        scope,
        recordCount: logs.data.length,
        exportReason: body.reason || 'User requested',
      },
    })

    // Return file download
    return new NextResponse(exportData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Export-Timestamp': new Date().toISOString(),
        'X-Export-Records': String(logs.data.length),
      },
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Audit log export failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/security/audit-logs
 * Delete old audit logs (admin only, respects retention policies)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    const isUserAdmin = await isAdmin(session.user.id)
    if (!isUserAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get retention policy from hardcoded value (90 days)
    const retentionDays = 90
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    // Log the cleanup action
    await auditLogger.log({
      type: AuditEventType.SYSTEM_CONFIG_CHANGE,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'Initiate audit log cleanup',
      result: 'success',
      metadata: {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays,
      },
    })

    // In production, this would delete old logs from the database
    // For now, return success
    return NextResponse.json({
      message: 'Audit log cleanup initiated',
      cutoffDate: cutoffDate.toISOString(),
      retentionDays,
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Audit log cleanup failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Mock function for querying audit logs
// In production, this would be replaced with actual database queries
async function mockQueryAuditLogs(
  filters: AuditLogFilters,
  options: QueryOptions
): Promise<QueryResult> {
  // Mock implementation
  const mockLogs = [
    {
      id: '1',
      type: AuditEventType.AUTH_SUCCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date().toISOString(),
      actor: {
        type: 'user',
        id: 'user123',
        ip: '192.168.1.1',
      },
      action: 'User login',
      result: 'success',
      metadata: {},
    },
    {
      id: '2',
      type: AuditEventType.API_ACCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      actor: {
        type: 'user',
        id: 'user123',
        ip: '192.168.1.1',
      },
      action: 'API key created',
      result: 'success',
      metadata: {
        keyId: 'key123',
      },
    },
  ]

  // Apply filters (simplified)
  let filtered = mockLogs
  if (filters.type) {
    filtered = filtered.filter(log => log.type === filters.type)
  }
  if (filters.actor?.id) {
    const actorId = filters.actor.id
    filtered = filtered.filter(log => log.actor.id === actorId)
  }

  // Apply pagination
  const paginated = filtered.slice(options.offset, options.offset + options.limit)

  return {
    data: paginated,
    total: filtered.length,
  }
}
