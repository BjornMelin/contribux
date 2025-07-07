/**
 * Audit Logs API
 * 
 * Provides secure access to audit logs with filtering and export capabilities.
 * Implements GDPR-compliant data access controls.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'
import { InputValidator } from '@/lib/security/input-validation'
import { z } from 'zod'
import { config } from '@/lib/config'

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
  sortOrder: z.enum(['asc', 'desc']).default('desc')
})

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
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check permissions - users can only see their own logs unless admin
    const isUserAdmin = await isAdmin(session.user.id)

    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams: any = {}
    
    url.searchParams.forEach((value, key) => {
      if (key === 'limit' || key === 'offset') {
        queryParams[key] = parseInt(value, 10)
      } else {
        queryParams[key] = value
      }
    })

    const validation = await inputValidator.validate(auditLogQuerySchema, queryParams)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.errors },
        { status: 400 }
      )
    }

    const params = validation.data

    // Build filter criteria
    const filters: any = {
      ...(params.type && { type: params.type }),
      ...(params.severity && { severity: params.severity }),
      ...(params.action && { action: { contains: params.action } }),
      ...(params.startDate && { timestamp: { gte: new Date(params.startDate) } }),
      ...(params.endDate && { timestamp: { lte: new Date(params.endDate) } })
    }

    // Non-admins can only see their own logs
    if (!isUserAdmin) {
      filters.actor = {
        userId: session.user.id
      }
    } else if (params.actorId) {
      // Admins can filter by specific actor
      filters.actor = {
        userId: params.actorId
      }
    }

    // Query audit logs (mock implementation)
    // In production, this would query the database
    const logs = await mockQueryAuditLogs(filters, {
      limit: params.limit,
      offset: params.offset,
      orderBy: {
        [params.sortBy]: params.sortOrder
      }
    })

    // Log access to audit logs
    await auditLogger.log({
      type: AuditEventType.DATA_ACCESS,
      severity: AuditSeverity.INFO,
      actor: {
        type: 'user',
        userId: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      action: 'Access audit logs',
      result: 'success',
      metadata: {
        filters,
        resultCount: logs.data.length,
        isAdminAccess: isUserAdmin
      }
    })

    return NextResponse.json({
      data: logs.data,
      pagination: {
        total: logs.total,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + params.limit < logs.total
      }
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Audit log retrieval failed',
      result: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/security/audit-logs/export
 * Export audit logs for compliance
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
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
    const filters: any = {}
    
    if (scope === 'user' || !isUserAdmin) {
      filters.actor = {
        userId: session.user.id
      }
    }

    // Query logs for export
    const logs = await mockQueryAuditLogs(filters, {
      limit: 10000, // Maximum export size
      offset: 0,
      orderBy: {
        timestamp: 'desc'
      }
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

      case 'csv':
        // Convert to CSV
        const csvHeaders = ['Timestamp', 'Type', 'Severity', 'Actor', 'Action', 'Result', 'IP Address']
        const csvRows = [csvHeaders.join(',')]
        
        logs.data.forEach(log => {
          csvRows.push([
            log.timestamp,
            log.type,
            log.severity,
            log.actor.userId || log.actor.type,
            log.action,
            log.result,
            log.actor.ip || ''
          ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        })
        
        exportData = csvRows.join('\n')
        contentType = 'text/csv'
        filename = `audit-logs-${session.user.id}-${new Date().toISOString().split('T')[0]}.csv`
        break

      default:
        return NextResponse.json(
          { error: 'Invalid format' },
          { status: 400 }
        )
    }

    // Log export for compliance
    await auditLogger.log({
      type: AuditEventType.DATA_EXPORT,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        userId: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      action: 'Export audit logs',
      result: 'success',
      metadata: {
        format,
        scope,
        recordCount: logs.data.length,
        exportReason: body.reason || 'User requested'
      }
    })

    // Return file download
    return new NextResponse(exportData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Export-Timestamp': new Date().toISOString(),
        'X-Export-Records': String(logs.data.length)
      }
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Audit log export failed',
      result: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/security/audit-logs
 * Delete old audit logs (admin only, respects retention policies)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Admin only
    const isUserAdmin = await isAdmin(session.user.id)
    if (!isUserAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get retention policy from config
    const retentionDays = config.audit.retention.standardLogs / (24 * 60 * 60 * 1000)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    // Log the cleanup action
    await auditLogger.log({
      type: AuditEventType.SYSTEM_EVENT,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        userId: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      action: 'Initiate audit log cleanup',
      result: 'success',
      metadata: {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays
      }
    })

    // In production, this would delete old logs from the database
    // For now, return success
    return NextResponse.json({
      message: 'Audit log cleanup initiated',
      cutoffDate: cutoffDate.toISOString(),
      retentionDays
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Audit log cleanup failed',
      result: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Mock function for querying audit logs
// In production, this would be replaced with actual database queries
async function mockQueryAuditLogs(
  filters: any,
  options: { limit: number; offset: number; orderBy: any }
): Promise<{ data: any[]; total: number }> {
  // Mock implementation
  const mockLogs = [
    {
      id: '1',
      type: AuditEventType.AUTHENTICATION_SUCCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date().toISOString(),
      actor: {
        type: 'user',
        userId: 'user123',
        ip: '192.168.1.1'
      },
      action: 'User login',
      result: 'success',
      metadata: {}
    },
    {
      id: '2',
      type: AuditEventType.API_ACCESS,
      severity: AuditSeverity.INFO,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      actor: {
        type: 'user',
        userId: 'user123',
        ip: '192.168.1.1'
      },
      action: 'API key created',
      result: 'success',
      metadata: {
        keyId: 'key123'
      }
    }
  ]

  // Apply filters (simplified)
  let filtered = mockLogs
  if (filters.type) {
    filtered = filtered.filter(log => log.type === filters.type)
  }
  if (filters.actor?.userId) {
    filtered = filtered.filter(log => log.actor.userId === filters.actor.userId)
  }

  // Apply pagination
  const paginated = filtered.slice(options.offset, options.offset + options.limit)

  return {
    data: paginated,
    total: filtered.length
  }
}