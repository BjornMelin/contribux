/**
 * API Key Management Endpoints
 *
 * Provides REST API for managing API keys with automatic rotation capabilities.
 * All endpoints require authentication and enforce rate limiting.
 */

import { authConfig } from '@/lib/auth'
import { ApiKeyManager } from '@/lib/security/api-key-rotation'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { InputValidator } from '@/lib/security/input-validation'
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Initialize services
const apiKeyManager = new ApiKeyManager()
const inputValidator = new InputValidator()

// Validation schemas
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default(['read']),
  expiresIn: z.number().min(3600).max(31536000).optional(), // 1 hour to 1 year
})

const rotateKeySchema = z.object({
  keyId: z.string().min(1),
  reason: z.string().min(1).max(500),
})

/**
 * GET /api/security/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's API keys
    const keys = await apiKeyManager.listUserKeys(session.user.id)

    // Log access
    await auditLogger.log({
      type: AuditEventType.API_ACCESS,
      severity: AuditSeverity.INFO,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'List API keys',
      result: 'success',
      metadata: {
        keyCount: keys.length,
      },
    })

    return NextResponse.json({
      keys: keys.map(key => ({
        keyId: key.id,
        name: key.name,
        permissions: key.permissions,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        isActive: key.status === 'active',
      })),
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'List API keys failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/security/api-keys
 * Create a new API key
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = await inputValidator.validate(createKeySchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.errors },
        { status: 400 }
      )
    }

    // Create API key
    if (!validation.data) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    const { key, keyId, expiresAt } = await apiKeyManager.generateKey(
      session.user.id,
      validation.data.name,
      validation.data.permissions || ['read']
    )

    // Log creation
    await auditLogger.log({
      type: AuditEventType.API_KEY_CREATED,
      severity: AuditSeverity.INFO,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'Create API key',
      result: 'success',
      metadata: {
        keyId,
        name: validation.data.name,
        permissions: validation.data.permissions,
      },
    })

    return NextResponse.json({
      keyId,
      key, // Only returned once during creation
      expiresAt,
      message:
        'API key created successfully. Store this key securely - it will not be shown again.',
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Create API key failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/security/api-keys
 * Rotate an existing API key
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = await inputValidator.validate(rotateKeySchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.errors },
        { status: 400 }
      )
    }

    // Rotate API key
    if (!validation.data) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    const result = await apiKeyManager.rotateKey(
      validation.data.keyId,
      session.user.id,
      validation.data.reason
    )

    // Log rotation
    await auditLogger.log({
      type: AuditEventType.API_KEY_ROTATED,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'Rotate API key',
      result: 'success',
      metadata: {
        oldKeyId: result.oldKeyId,
        newKeyId: result.newKeyId,
        reason: validation.data.reason,
        gracePeriodEnd: result.gracePeriodEnd,
      },
    })

    return NextResponse.json({
      oldKeyId: result.oldKeyId,
      newKeyId: result.newKeyId,
      newKey: result.newKey, // Only returned once during rotation
      gracePeriodEnd: result.gracePeriodEnd,
      message:
        'API key rotated successfully. The old key will remain valid during the grace period.',
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Rotate API key failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/security/api-keys/:keyId
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract keyId from query parameters or URL
    const url = new URL(request.url)
    const keyId = url.searchParams.get('keyId')

    if (!keyId) {
      return NextResponse.json({ error: 'keyId parameter is required' }, { status: 400 })
    }

    // Revoke API key
    await apiKeyManager.revokeKey(keyId, session.user.id, 'User requested revocation')

    // Log revocation
    await auditLogger.log({
      type: AuditEventType.API_KEY_REVOKED,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: 'Revoke API key',
      result: 'success',
      metadata: {
        keyId,
        reason: 'User requested revocation',
      },
    })

    return NextResponse.json({
      message: 'API key revoked successfully',
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Revoke API key failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
