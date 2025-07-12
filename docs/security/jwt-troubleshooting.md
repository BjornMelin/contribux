# JWT Token Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered when working with the JWT token rotation system in the contribux project. Use this as a quick reference for diagnosing and resolving authentication-related problems.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Error Messages](#common-error-messages)
3. [Token Lifecycle Issues](#token-lifecycle-issues)
4. [Database-Related Problems](#database-related-problems)
5. [Client-Side Issues](#client-side-issues)
6. [Performance Problems](#performance-problems)
7. [Security Incidents](#security-incidents)
8. [Development and Testing](#development-and-testing)

## Quick Diagnostics

### Health Check Commands

```bash
# Check database connection
pnpm db:test-connection

# Run database health check
pnpm db:health

# Check JWT configuration
node -e "console.log(process.env.JWT_SECRET ? 'JWT_SECRET is set' : 'JWT_SECRET is missing')"

# Verify token generation (development only)
curl -X POST http://localhost:3000/api/auth/debug/token-test
```

### Environment Variables Checklist

```bash
# Required environment variables
JWT_SECRET=your-secret-key-here
DATABASE_URL=your-database-connection-string
DATABASE_URL_DEV=your-dev-database-connection-string
DATABASE_URL_TEST=your-test-database-connection-string
```

### Token Validation Test

```typescript
// Quick token validation test (development only)
import { verifyAccessToken } from '@/lib/auth/jwt'

async function testTokenValidation() {
  try {
    const payload = await verifyAccessToken(testToken)
    console.log('Token is valid:', payload)
  } catch (error) {
    console.error('Token validation failed:', error.message)
  }
}
```

## Common Error Messages

### "Token expired"

**Symptoms:**
- Users getting 401 errors after 15 minutes
- Automatic token refresh not working
- Mobile app requires frequent re-authentication

**Causes:**
1. Access token past expiration time
2. Clock skew between client and server
3. Failed refresh token mechanism

**Solutions:**

```typescript
// 1. Implement proper token refresh logic
class AuthManager {
  private refreshInProgress = false
  
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}) {
    let response = await this.makeRequest(url, options)
    
    if (response.status === 401 && !this.refreshInProgress) {
      this.refreshInProgress = true
      
      try {
        await this.refreshTokens()
        response = await this.makeRequest(url, options)
      } catch (refreshError) {
        this.redirectToLogin()
      } finally {
        this.refreshInProgress = false
      }
    }
    
    return response
  }
}

// 2. Add clock skew tolerance
const CLOCK_SKEW_TOLERANCE = 300 // 5 minutes
const isTokenExpired = (exp: number) => {
  return (exp * 1000) < (Date.now() - CLOCK_SKEW_TOLERANCE * 1000)
}

// 3. Implement token preemptive refresh
const shouldRefreshToken = (exp: number) => {
  const timeToExpiry = (exp * 1000) - Date.now()
  return timeToExpiry < 5 * 60 * 1000 // Refresh if less than 5 minutes left
}
```

### "Invalid token"

**Symptoms:**
- Authentication fails with valid-looking tokens
- Tokens work in development but not production
- Intermittent authentication failures

**Causes:**
1. JWT secret mismatch between environments
2. Malformed token structure
3. Signature verification failure
4. Token tampering

**Solutions:**

```typescript
// 1. Verify JWT secret consistency
const validateJWTSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }
  return secret
}

// 2. Debug token structure
const debugToken = (token: string) => {
  if (process.env.NODE_ENV !== 'development') return

  const parts = token.split('.')
  if (parts.length !== 3) {
    console.error('Invalid token structure: expected 3 parts, got', parts.length)
    return
  }

  try {
    const header = JSON.parse(atob(parts[0]))
    const payload = JSON.parse(atob(parts[1]))
    
    console.log('Token Debug:', {
      header,
      payload,
      algorithm: header.alg,
      issuer: payload.iss,
      audience: payload.aud,
      expiresAt: new Date(payload.exp * 1000)
    })
  } catch (error) {
    console.error('Token decode error:', error)
  }
}

// 3. Implement token validation middleware
const validateTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  try {
    const payload = await verifyAccessToken(token)
    req.user = payload
    next()
  } catch (error) {
    console.error('Token validation failed:', {
      error: error.message,
      token: token.substring(0, 20) + '...',
      timestamp: new Date().toISOString()
    })
    
    res.status(401).json({ 
      error: 'Invalid token',
      code: 'INVALID_TOKEN' 
    })
  }
}
```

### "Token reuse detected"

**Symptoms:**
- Users suddenly logged out from all devices
- "Token reuse detected" errors in logs
- Frequent re-authentication required

**Causes:**
1. Actual token theft/compromise
2. Network issues causing duplicate requests
3. Concurrent refresh requests
4. Mobile app background/foreground transitions

**Solutions:**

```typescript
// 1. Implement request deduplication
class TokenService {
  private refreshPromises = new Map<string, Promise<TokenPair>>()
  
  async refreshToken(userId: string): Promise<TokenPair> {
    const existingPromise = this.refreshPromises.get(userId)
    if (existingPromise) {
      return existingPromise
    }
    
    const refreshPromise = this.performRefresh(userId)
    this.refreshPromises.set(userId, refreshPromise)
    
    try {
      const result = await refreshPromise
      return result
    } finally {
      this.refreshPromises.delete(userId)
    }
  }
}

// 2. Add retry logic with exponential backoff
const refreshWithRetry = async (refreshToken: string, maxRetries = 3): Promise<TokenPair> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await rotateRefreshToken(refreshToken)
    } catch (error) {
      if (error.message === 'Token reuse detected') {
        // Don't retry on reuse detection
        throw error
      }
      
      if (attempt === maxRetries) {
        throw error
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt - 1) * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// 3. Implement graceful degradation
const handleTokenReuse = async (error: Error, userId: string) => {
  if (error.message === 'Token reuse detected') {
    // Log security incident
    await logSecurityEvent({
      type: 'TOKEN_REUSE_DETECTED',
      userId,
      timestamp: new Date(),
      severity: 'HIGH'
    })
    
    // Notify user about security incident
    await sendSecurityNotification(userId, 'suspicious_activity')
    
    // Force re-authentication
    throw new Error('Security incident detected. Please log in again.')
  }
}
```

### "Session expired or not found"

**Symptoms:**
- Valid refresh token but session errors
- Users logged out unexpectedly
- Session-related API calls fail

**Causes:**
1. Session cleanup job too aggressive
2. Database connection issues
3. Session timeout configuration
4. Concurrent session limits

**Solutions:**

```typescript
// 1. Verify session configuration
const sessionConfig = {
  expiry: 7 * 24 * 60 * 60, // 7 days
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxConcurrentSessions: 5 // per user
}

// 2. Implement session validation
const validateSession = async (sessionId: string): Promise<UserSession> => {
  const session = await sql`
    SELECT *
    FROM user_sessions
    WHERE id = ${sessionId}
    AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `
  
  if (session.length === 0) {
    throw new Error('Session expired or not found')
  }
  
  return session[0] as UserSession
}

// 3. Add session refresh mechanism
const refreshSession = async (sessionId: string): Promise<void> => {
  await sql`
    UPDATE user_sessions
    SET 
      last_active_at = CURRENT_TIMESTAMP,
      expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
    WHERE id = ${sessionId}
    AND expires_at > CURRENT_TIMESTAMP
  `
}

// 4. Implement session monitoring
const monitorSessions = async (userId: string) => {
  const activeSessions = await sql`
    SELECT COUNT(*) as count
    FROM user_sessions
    WHERE user_id = ${userId}
    AND expires_at > CURRENT_TIMESTAMP
  `
  
  if (activeSessions[0].count > sessionConfig.maxConcurrentSessions) {
    // Clean up oldest sessions
    await sql`
      DELETE FROM user_sessions
      WHERE user_id = ${userId}
      AND id NOT IN (
        SELECT id
        FROM user_sessions
        WHERE user_id = ${userId}
        AND expires_at > CURRENT_TIMESTAMP
        ORDER BY last_active_at DESC
        LIMIT ${sessionConfig.maxConcurrentSessions}
      )
    `
  }
}
```

## Token Lifecycle Issues

### Tokens not being cleaned up

**Problem**: Database growing with expired tokens

**Solution**:

```typescript
// 1. Implement automated cleanup
const cleanupExpiredTokens = async (): Promise<number> => {
  const result = await sql`
    WITH deleted AS (
      DELETE FROM refresh_tokens
      WHERE expires_at < CURRENT_TIMESTAMP
      OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days')
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `
  
  return parseInt(result[0]?.count || '0')
}

// 2. Set up cleanup job
const setupCleanupJob = () => {
  // Run cleanup every hour
  setInterval(async () => {
    try {
      const cleaned = await cleanupExpiredTokens()
      console.log(`Cleaned up ${cleaned} expired tokens`)
    } catch (error) {
      console.error('Token cleanup failed:', error)
    }
  }, 60 * 60 * 1000) // 1 hour
}

// 3. Add database constraints
const addDatabaseConstraints = async () => {
  await sql`
    -- Add check constraint for token expiration
    ALTER TABLE refresh_tokens 
    ADD CONSTRAINT check_token_expiry 
    CHECK (expires_at > created_at);
    
    -- Add index for cleanup performance
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup 
    ON refresh_tokens(expires_at, revoked_at);
  `
}
```

### Token generation failures

**Problem**: Tokens not being generated correctly

**Solution**:

```typescript
// 1. Add token generation validation
const validateTokenGeneration = async (token: string): Promise<boolean> => {
  try {
    const payload = await verifyAccessToken(token)
    
    // Validate required fields
    const requiredFields = ['sub', 'email', 'sessionId', 'iat', 'exp', 'jti']
    for (const field of requiredFields) {
      if (!payload[field]) {
        throw new Error(`Missing required field: ${field}`)
      }
    }
    
    // Validate expiration
    if (payload.exp * 1000 <= Date.now()) {
      throw new Error('Token expired immediately after generation')
    }
    
    return true
  } catch (error) {
    console.error('Token generation validation failed:', error)
    return false
  }
}

// 2. Implement token generation with validation
const generateValidatedTokens = async (user: User, session: UserSession) => {
  const maxRetries = 3
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = await generateAccessToken(user, session)
      const refreshToken = await generateRefreshToken(user.id, session.id)
      
      // Validate generated tokens
      const isAccessTokenValid = await validateTokenGeneration(accessToken)
      if (!isAccessTokenValid) {
        throw new Error('Access token validation failed')
      }
      
      return { accessToken, refreshToken }
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Token generation failed after ${maxRetries} attempts: ${error.message}`)
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}
```

## Database-Related Problems

### Connection pool exhaustion

**Problem**: Database connections not being released

**Solution**:

```typescript
// 1. Monitor connection pool
const monitorConnectionPool = () => {
  const poolStats = sql.pool.getStats()
  
  console.log('Connection Pool Stats:', {
    total: poolStats.totalConnections,
    idle: poolStats.idleConnections,
    used: poolStats.usedConnections,
    pending: poolStats.pendingConnections
  })
  
  // Alert if pool is exhausted
  if (poolStats.usedConnections / poolStats.totalConnections > 0.8) {
    console.warn('Connection pool nearly exhausted')
  }
}

// 2. Implement connection cleanup
const withDatabaseConnection = async <T>(operation: () => Promise<T>): Promise<T> => {
  const startTime = Date.now()
  
  try {
    const result = await operation()
    return result
  } finally {
    const duration = Date.now() - startTime
    
    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow database operation: ${duration}ms`)
    }
  }
}

// 3. Add connection timeout handling
const executeWithTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Database operation timeout')), timeoutMs)
  })
  
  return Promise.race([operation(), timeoutPromise])
}
```

### Database migration issues

**Problem**: Token-related tables not properly migrated

**Solution**:

```sql
-- 1. Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'refresh_tokens'
ORDER BY ordinal_position;

-- 2. Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'refresh_tokens';

-- 3. Check constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'refresh_tokens'::regclass;
```

```typescript
// 4. Implement migration validation
const validateTokenTables = async (): Promise<void> => {
  const requiredTables = ['refresh_tokens', 'user_sessions', 'users']
  
  for (const table of requiredTables) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = ${table}
      )
    `
    
    if (!result[0].exists) {
      throw new Error(`Required table ${table} does not exist`)
    }
  }
  
  // Check for required indexes
  const requiredIndexes = [
    'idx_refresh_tokens_hash',
    'idx_refresh_tokens_user_id',
    'idx_refresh_tokens_expires_at'
  ]
  
  for (const index of requiredIndexes) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE indexname = ${index}
      )
    `
    
    if (!result[0].exists) {
      console.warn(`Recommended index ${index} does not exist`)
    }
  }
}
```

## Client-Side Issues

### Token storage problems

**Problem**: Tokens not persisting between app sessions

**Solution**:

```typescript
// 1. Implement secure token storage
class SecureTokenStorage {
  private static instance: SecureTokenStorage
  
  static getInstance(): SecureTokenStorage {
    if (!SecureTokenStorage.instance) {
      SecureTokenStorage.instance = new SecureTokenStorage()
    }
    return SecureTokenStorage.instance
  }
  
  async storeTokens(tokens: TokenPair): Promise<void> {
    if (typeof window === 'undefined') return // Server-side
    
    try {
      // For web: use secure httpOnly cookies via API
      await fetch('/api/auth/store-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens)
      })
    } catch (error) {
      console.error('Token storage failed:', error)
      // Fallback to memory storage
      this.memoryTokens = tokens
    }
  }
  
  async getTokens(): Promise<TokenPair | null> {
    if (typeof window === 'undefined') return null
    
    try {
      const response = await fetch('/api/auth/get-tokens')
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.error('Token retrieval failed:', error)
    }
    
    return this.memoryTokens || null
  }
  
  async clearTokens(): Promise<void> {
    this.memoryTokens = null
    
    try {
      await fetch('/api/auth/clear-tokens', { method: 'POST' })
    } catch (error) {
      console.error('Token clearing failed:', error)
    }
  }
  
  private memoryTokens: TokenPair | null = null
}

// 2. Handle storage failures gracefully
const handleStorageError = (error: Error): void => {
  console.error('Token storage error:', error)
  
  // Fallback to memory storage
  if (error.message.includes('localStorage')) {
    console.warn('localStorage unavailable, using memory storage')
  }
  
  // Notify user about storage limitations
  if (error.message.includes('quota')) {
    console.warn('Storage quota exceeded')
  }
}
```

### Token synchronization across tabs

**Problem**: Tokens getting out of sync between browser tabs

**Solution**:

```typescript
// 1. Implement cross-tab synchronization
class TokenSynchronizer {
  private static readonly STORAGE_KEY = 'auth_tokens'
  private static readonly SYNC_EVENT = 'token_sync'
  
  constructor() {
    this.setupStorageListener()
  }
  
  private setupStorageListener(): void {
    window.addEventListener('storage', (event) => {
      if (event.key === TokenSynchronizer.STORAGE_KEY) {
        this.handleTokenUpdate(event.newValue)
      }
    })
    
    // Custom event for same-tab updates
    window.addEventListener(TokenSynchronizer.SYNC_EVENT, (event: CustomEvent) => {
      this.handleTokenUpdate(event.detail)
    })
  }
  
  private handleTokenUpdate(tokensJson: string | null): void {
    if (!tokensJson) {
      // Tokens cleared - redirect to login
      window.location.href = '/login'
      return
    }
    
    try {
      const tokens = JSON.parse(tokensJson)
      this.updateLocalTokens(tokens)
    } catch (error) {
      console.error('Token sync error:', error)
    }
  }
  
  updateTokens(tokens: TokenPair): void {
    // Update local storage
    localStorage.setItem(TokenSynchronizer.STORAGE_KEY, JSON.stringify(tokens))
    
    // Notify other tabs
    window.dispatchEvent(new CustomEvent(TokenSynchronizer.SYNC_EVENT, {
      detail: JSON.stringify(tokens)
    }))
  }
  
  private updateLocalTokens(tokens: TokenPair): void {
    // Update in-memory tokens
    this.currentTokens = tokens
    
    // Update HTTP client defaults
    this.updateHttpClientDefaults(tokens.accessToken)
  }
}

// 2. Handle tab visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Tab became visible - check token validity
    checkTokenValidity()
  }
})

const checkTokenValidity = async (): Promise<void> => {
  const tokens = await SecureTokenStorage.getInstance().getTokens()
  if (!tokens) {
    window.location.href = '/login'
    return
  }
  
  // Check if access token is expired
  const payload = parseJWT(tokens.accessToken)
  if (payload.exp * 1000 <= Date.now()) {
    try {
      await refreshTokens()
    } catch (error) {
      window.location.href = '/login'
    }
  }
}
```

## Performance Problems

### Slow token verification

**Problem**: Token verification taking too long

**Solution**:

```typescript
// 1. Implement token verification caching
class TokenVerificationCache {
  private cache = new Map<string, CachedVerification>()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes
  
  async verifyToken(token: string): Promise<AccessTokenPayload> {
    const cacheKey = this.generateCacheKey(token)
    const cached = this.cache.get(cacheKey)
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload
    }
    
    const payload = await verifyAccessToken(token)
    
    // Cache the result
    this.cache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + this.TTL
    })
    
    return payload
  }
  
  private generateCacheKey(token: string): string {
    // Use token signature as cache key
    return token.split('.')[2] || token
  }
  
  clearCache(): void {
    this.cache.clear()
  }
}

// 2. Add performance monitoring
const monitorTokenVerification = async (token: string): Promise<AccessTokenPayload> => {
  const startTime = Date.now()
  
  try {
    const payload = await verifyAccessToken(token)
    const duration = Date.now() - startTime
    
    // Log slow verifications
    if (duration > 100) {
      console.warn(`Slow token verification: ${duration}ms`)
    }
    
    return payload
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`Token verification failed in ${duration}ms:`, error.message)
    throw error
  }
}

// 3. Implement token pre-validation
const preValidateToken = (token: string): boolean => {
  // Basic format check
  const parts = token.split('.')
  if (parts.length !== 3) return false
  
  try {
    // Check if payload is valid JSON
    const payload = JSON.parse(atob(parts[1]))
    
    // Check expiration without signature verification
    if (payload.exp * 1000 <= Date.now()) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}
```

### High memory usage

**Problem**: Token-related objects consuming too much memory

**Solution**:

```typescript
// 1. Implement memory-efficient token storage
class MemoryEfficientTokenManager {
  private tokens: WeakMap<User, TokenPair> = new WeakMap()
  
  storeTokens(user: User, tokens: TokenPair): void {
    this.tokens.set(user, tokens)
  }
  
  getTokens(user: User): TokenPair | undefined {
    return this.tokens.get(user)
  }
  
  // Tokens are automatically garbage collected when user object is released
}

// 2. Add memory usage monitoring
const monitorMemoryUsage = (): void => {
  if (typeof performance !== 'undefined' && performance.memory) {
    const memInfo = performance.memory
    
    console.log('Memory Usage:', {
      used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024),
      total: Math.round(memInfo.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)
    })
    
    // Alert if memory usage is high
    if (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit > 0.8) {
      console.warn('High memory usage detected')
    }
  }
}

// 3. Implement token cleanup
const cleanupTokenReferences = (): void => {
  // Clear any lingering token references
  TokenVerificationCache.getInstance().clearCache()
  
  // Force garbage collection in development
  if (process.env.NODE_ENV === 'development' && global.gc) {
    global.gc()
  }
}
```

## Security Incidents

### Handling suspected token theft

**Response Plan**:

```typescript
// 1. Immediate response to token reuse detection
const handleTokenTheft = async (userId: string, suspiciousActivity: SecurityEvent): Promise<void> => {
  console.error('SECURITY INCIDENT: Token theft detected', {
    userId,
    activity: suspiciousActivity,
    timestamp: new Date().toISOString()
  })
  
  // Immediate actions
  await Promise.all([
    // Revoke all user tokens
    revokeAllUserTokens(userId, { terminateSessions: true }),
    
    // Log security event
    logSecurityEvent({
      type: 'TOKEN_THEFT_DETECTED',
      userId,
      severity: 'CRITICAL',
      details: suspiciousActivity
    }),
    
    // Send security alert
    sendSecurityAlert(userId, {
      type: 'account_compromise',
      message: 'Suspicious activity detected on your account',
      recommendedAction: 'Change password and review recent activity'
    })
  ])
  
  // Additional investigation
  await investigateSecurityIncident(userId, suspiciousActivity)
}

// 2. Security incident investigation
const investigateSecurityIncident = async (userId: string, incident: SecurityEvent): Promise<void> => {
  // Gather related security events
  const relatedEvents = await sql`
    SELECT *
    FROM security_audit_log
    WHERE user_id = ${userId}
    AND timestamp > ${incident.timestamp} - INTERVAL '1 hour'
    ORDER BY timestamp DESC
  `
  
  // Analyze patterns
  const suspiciousPatterns = await analyzeSuspiciousPatterns(userId, relatedEvents)
  
  // Generate security report
  const securityReport = {
    userId,
    incidentType: incident.type,
    timestamp: incident.timestamp,
    relatedEvents: relatedEvents.length,
    suspiciousPatterns,
    riskLevel: calculateRiskLevel(suspiciousPatterns),
    recommendedActions: generateRecommendedActions(suspiciousPatterns)
  }
  
  // Store investigation results
  await storeSecurityInvestigation(securityReport)
}

// 3. Automated threat detection
const detectAnomalousActivity = async (userId: string, activity: UserActivity): Promise<boolean> => {
  const checks = [
    // Geographic anomaly
    checkGeographicAnomaly(userId, activity.ipAddress),
    
    // Time-based anomaly
    checkTimeBasedAnomaly(userId, activity.timestamp),
    
    // Device fingerprint changes
    checkDeviceFingerprint(userId, activity.deviceInfo),
    
    // Rapid token refresh
    checkRapidTokenRefresh(userId),
    
    // Unusual API usage patterns
    checkAPIUsagePatterns(userId, activity.apiCalls)
  ]
  
  const anomalies = await Promise.all(checks)
  return anomalies.some(isAnomalous => isAnomalous)
}
```

## Development and Testing

### Testing JWT implementation

**Test Cases**:

```typescript
// 1. Token generation tests
describe('JWT Token Generation', () => {
  it('should generate valid access tokens', async () => {
    const user = createTestUser()
    const session = createTestSession(user.id)
    
    const token = await generateAccessToken(user, session)
    
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
    
    // Verify token payload
    const payload = await verifyAccessToken(token)
    expect(payload.sub).toBe(user.id)
    expect(payload.email).toBe(user.email)
    expect(payload.sessionId).toBe(session.id)
  })
  
  it('should generate unique tokens', async () => {
    const user = createTestUser()
    const session = createTestSession(user.id)
    
    const token1 = await generateAccessToken(user, session)
    const token2 = await generateAccessToken(user, session)
    
    expect(token1).not.toBe(token2)
    
    // Verify JTI uniqueness
    const payload1 = await verifyAccessToken(token1)
    const payload2 = await verifyAccessToken(token2)
    expect(payload1.jti).not.toBe(payload2.jti)
  })
})

// 2. Token refresh tests
describe('Token Refresh', () => {
  it('should rotate refresh tokens', async () => {
    const user = createTestUser()
    const session = createTestSession(user.id)
    
    const oldRefreshToken = await generateRefreshToken(user.id, session.id)
    const result = await rotateRefreshToken(oldRefreshToken)
    
    expect(result.refreshToken).not.toBe(oldRefreshToken)
    
    // Old token should be revoked
    await expect(verifyRefreshToken(oldRefreshToken)).rejects.toThrow()
    
    // New token should be valid
    const newPayload = await verifyRefreshToken(result.refreshToken)
    expect(newPayload.sub).toBe(user.id)
  })
  
  it('should detect token reuse', async () => {
    const user = createTestUser()
    const session = createTestSession(user.id)
    
    const refreshToken = await generateRefreshToken(user.id, session.id)
    
    // First use should succeed
    await rotateRefreshToken(refreshToken)
    
    // Second use should fail with reuse detection
    await expect(rotateRefreshToken(refreshToken)).rejects.toThrow('Token reuse detected')
  })
})

// 3. Load testing
describe('JWT Performance', () => {
  it('should handle concurrent token operations', async () => {
    const user = createTestUser()
    const session = createTestSession(user.id)
    
    // Generate multiple tokens concurrently
    const promises = Array.from({ length: 100 }, () => 
      generateAccessToken(user, session)
    )
    
    const tokens = await Promise.all(promises)
    
    // All tokens should be unique
    const uniqueTokens = new Set(tokens)
    expect(uniqueTokens.size).toBe(tokens.length)
  })
})
```

### Debugging helpers

```typescript
// 1. Token inspection tool
const inspectToken = (token: string): void => {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('Token inspection only available in development')
    return
  }
  
  try {
    const [header, payload, signature] = token.split('.')
    
    console.log('Token Inspection:', {
      header: JSON.parse(atob(header)),
      payload: JSON.parse(atob(payload)),
      signature: signature.substring(0, 10) + '...',
      length: token.length
    })
  } catch (error) {
    console.error('Token inspection failed:', error)
  }
}

// 2. Security audit helper
const auditTokenSecurity = async (token: string): Promise<SecurityAuditResult> => {
  const issues: string[] = []
  
  try {
    const payload = await verifyAccessToken(token)
    
    // Check token lifetime
    const lifetime = (payload.exp - payload.iat) * 1000
    if (lifetime > 60 * 60 * 1000) { // 1 hour
      issues.push('Token lifetime exceeds recommended maximum')
    }
    
    // Check required claims
    const requiredClaims = ['sub', 'email', 'sessionId', 'jti']
    for (const claim of requiredClaims) {
      if (!payload[claim]) {
        issues.push(`Missing required claim: ${claim}`)
      }
    }
    
    // Check audience
    if (!payload.aud.includes('contribux-api')) {
      issues.push('Invalid audience')
    }
    
    return {
      isSecure: issues.length === 0,
      issues,
      payload
    }
  } catch (error) {
    return {
      isSecure: false,
      issues: ['Token validation failed'],
      error: error.message
    }
  }
}
```

## Conclusion

This troubleshooting guide covers the most common issues encountered with the JWT token rotation system. For issues not covered here:

1. Check the application logs for detailed error messages
2. Verify environment variables and configuration
3. Test with the provided debugging tools
4. Review the main [JWT Token Rotation Security Guide](./jwt-token-rotation.md)
5. Contact the development team for assistance

Remember to always test fixes in a development environment before applying them to production.