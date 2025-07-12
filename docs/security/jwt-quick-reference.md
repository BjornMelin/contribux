# JWT Token Rotation - Quick Reference

## Overview

This quick reference guide provides essential code snippets and usage patterns for the JWT token rotation system in the contribux project.

## Essential Imports

```typescript
import { 
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  createSession,
  refreshSession,
  cleanupExpiredTokens
} from '@/lib/auth/jwt'

import type { 
  AccessTokenPayload,
  RefreshTokenPayload,
  User,
  UserSession 
} from '@/types/auth'
```

## Token Configuration

```typescript
// Current token settings
const TOKEN_CONFIG = {
  ACCESS_TOKEN_EXPIRY: 15 * 60,        // 15 minutes
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days
  SESSION_EXPIRY: 7 * 24 * 60 * 60,    // 7 days
  ISSUER: 'contribux',
  AUDIENCE: ['contribux-api']
}
```

## Common Usage Patterns

### 1. Initial Authentication (OAuth Flow)

```typescript
// After successful OAuth callback
const authenticateUser = async (oauthUser: OAuthUser, context: SecurityContext) => {
  // Create or update user
  const user = await findOrCreateUser(oauthUser)
  
  // Create session and tokens
  const { session, accessToken, refreshToken } = await createSession(
    user,
    'oauth',
    {
      ip_address: context.ipAddress,
      user_agent: context.userAgent
    }
  )
  
  // Store tokens securely (HTTP-only cookies for web)
  return {
    user,
    session,
    accessToken,
    refreshToken,
    expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY
  }
}
```

### 2. API Route Protection

```typescript
// Middleware for protected routes
export const withAuth = (handler: ApiHandler) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '')
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' })
      }
      
      const payload = await verifyAccessToken(token)
      
      // Add user info to request
      req.user = payload
      
      // Refresh session activity
      await refreshSession(payload.sessionId)
      
      return handler(req, res)
    } catch (error) {
      if (error.message === 'Token expired') {
        return res.status(401).json({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        })
      }
      
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      })
    }
  }
}

// Usage in API route
export default withAuth(async (req, res) => {
  // Access user info via req.user
  const userId = req.user.sub
  
  // Your protected logic here
  const data = await getUserData(userId)
  res.json(data)
})
```

### 3. Token Refresh Endpoint

```typescript
// /api/auth/refresh
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  
  try {
    const { refreshToken } = req.body
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' })
    }
    
    // Rotate refresh token
    const result = await rotateRefreshToken(refreshToken)
    
    // Return new tokens
    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn
    })
  } catch (error) {
    console.error('Token refresh failed:', error)
    
    if (error.message === 'Token reuse detected') {
      return res.status(401).json({ 
        error: 'Security incident detected',
        code: 'TOKEN_REUSE_DETECTED'
      })
    }
    
    return res.status(401).json({ 
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    })
  }
}
```

### 4. Client-Side Token Management

```typescript
class AuthClient {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private refreshPromise: Promise<void> | null = null
  
  async login(credentials: LoginCredentials) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
    
    if (!response.ok) {
      throw new Error('Login failed')
    }
    
    const { accessToken, refreshToken } = await response.json()
    this.setTokens(accessToken, refreshToken)
  }
  
  async apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
    let response = await this.makeRequest(url, options)
    
    // Handle token expiration
    if (response.status === 401) {
      await this.refreshTokens()
      response = await this.makeRequest(url, options)
    }
    
    return response
  }
  
  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })
  }
  
  private async refreshTokens(): Promise<void> {
    // Prevent concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise
    }
    
    this.refreshPromise = this.performRefresh()
    
    try {
      await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }
  
  private async performRefresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available')
    }
    
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    })
    
    if (!response.ok) {
      this.clearTokens()
      throw new Error('Token refresh failed')
    }
    
    const { accessToken, refreshToken } = await response.json()
    this.setTokens(accessToken, refreshToken)
  }
  
  async logout(): Promise<void> {
    if (this.refreshToken) {
      await revokeRefreshToken(this.refreshToken)
    }
    this.clearTokens()
  }
  
  private setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    
    // Store in secure storage
    this.storeTokensSecurely({ accessToken, refreshToken })
  }
  
  private clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null
    this.clearSecureStorage()
  }
  
  private storeTokensSecurely(tokens: TokenPair): void {
    // Implementation depends on platform
    // Web: HTTP-only cookies or secure storage API
    // Mobile: Keychain/Keystore
  }
  
  private clearSecureStorage(): void {
    // Clear stored tokens
  }
}
```

### 5. React Hook for Authentication

```typescript
// useAuth hook
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    initializeAuth()
  }, [])
  
  const initializeAuth = async () => {
    try {
      const tokens = await getStoredTokens()
      if (tokens) {
        const payload = await verifyAccessToken(tokens.accessToken)
        setUser(payload)
      }
    } catch (error) {
      console.error('Auth initialization failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const login = async (credentials: LoginCredentials) => {
    const authClient = new AuthClient()
    await authClient.login(credentials)
    
    // Update user state
    const tokens = await getStoredTokens()
    if (tokens) {
      const payload = await verifyAccessToken(tokens.accessToken)
      setUser(payload)
    }
  }
  
  const logout = async () => {
    const authClient = new AuthClient()
    await authClient.logout()
    setUser(null)
  }
  
  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout
  }
}

// Usage in component
const ProtectedComponent = () => {
  const { user, isLoading, isAuthenticated } = useAuth()
  
  if (isLoading) return <div>Loading...</div>
  if (!isAuthenticated) return <div>Please login</div>
  
  return <div>Welcome, {user.email}</div>
}
```

### 6. Server-Side Session Management

```typescript
// Session utilities
export const getServerSession = async (req: NextApiRequest): Promise<UserSession | null> => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  
  if (!token) return null
  
  try {
    const payload = await verifyAccessToken(token)
    
    // Get full session data
    const session = await sql`
      SELECT * FROM user_sessions 
      WHERE id = ${payload.sessionId}
      AND expires_at > CURRENT_TIMESTAMP
    `
    
    return session[0] || null
  } catch (error) {
    return null
  }
}

// Session cleanup job
export const setupSessionCleanup = () => {
  // Clean up expired tokens every hour
  setInterval(async () => {
    try {
      const cleaned = await cleanupExpiredTokens()
      console.log(`Cleaned up ${cleaned} expired tokens`)
    } catch (error) {
      console.error('Session cleanup failed:', error)
    }
  }, 60 * 60 * 1000) // 1 hour
}
```

### 7. Admin Token Management

```typescript
// Admin utilities for token management
export const adminTokenUtils = {
  // Get user's active sessions
  async getUserSessions(userId: string): Promise<UserSession[]> {
    const sessions = await sql`
      SELECT * FROM user_sessions
      WHERE user_id = ${userId}
      AND expires_at > CURRENT_TIMESTAMP
      ORDER BY last_active_at DESC
    `
    
    return sessions as UserSession[]
  },
  
  // Get user's active refresh tokens
  async getUserRefreshTokens(userId: string): Promise<RefreshToken[]> {
    const tokens = await sql`
      SELECT id, user_id, session_id, expires_at, created_at, revoked_at
      FROM refresh_tokens
      WHERE user_id = ${userId}
      AND expires_at > CURRENT_TIMESTAMP
      AND revoked_at IS NULL
      ORDER BY created_at DESC
    `
    
    return tokens as RefreshToken[]
  },
  
  // Revoke all tokens for a user (admin action)
  async revokeAllUserTokens(userId: string): Promise<void> {
    await revokeAllUserTokens(userId, { terminateSessions: true })
    
    // Log admin action
    await logAdminAction({
      action: 'REVOKE_ALL_USER_TOKENS',
      targetUserId: userId,
      timestamp: new Date()
    })
  },
  
  // Get token statistics
  async getTokenStatistics(): Promise<TokenStatistics> {
    const stats = await sql`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE revoked_at IS NULL) as active_tokens,
        COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP) as expired_tokens,
        COUNT(*) FILTER (WHERE replaced_by IS NOT NULL) as rotated_tokens
      FROM refresh_tokens
    `
    
    return stats[0] as TokenStatistics
  }
}
```

## Common Error Handling

```typescript
// Error handling utility
export const handleTokenError = (error: Error): AuthErrorResponse => {
  const errorMap: Record<string, AuthErrorResponse> = {
    'Token expired': {
      code: 'TOKEN_EXPIRED',
      message: 'Access token has expired',
      action: 'REFRESH_TOKEN'
    },
    'Invalid token': {
      code: 'INVALID_TOKEN',
      message: 'Token is invalid or malformed',
      action: 'REAUTHENTICATE'
    },
    'Token reuse detected': {
      code: 'TOKEN_REUSE_DETECTED',
      message: 'Security incident detected',
      action: 'FORCE_LOGOUT'
    },
    'Refresh token expired': {
      code: 'REFRESH_TOKEN_EXPIRED',
      message: 'Refresh token has expired',
      action: 'REAUTHENTICATE'
    },
    'Session expired or not found': {
      code: 'SESSION_EXPIRED',
      message: 'User session has expired',
      action: 'REAUTHENTICATE'
    },
    'User not found': {
      code: 'USER_NOT_FOUND',
      message: 'User account not found',
      action: 'REAUTHENTICATE'
    }
  }
  
  return errorMap[error.message] || {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    action: 'REAUTHENTICATE'
  }
}

// Usage in error handler
const handleAuthError = (error: Error) => {
  const errorInfo = handleTokenError(error)
  
  switch (errorInfo.action) {
    case 'REFRESH_TOKEN':
      return refreshTokens()
    case 'FORCE_LOGOUT':
      return forceLogout()
    case 'REAUTHENTICATE':
      return redirectToLogin()
    default:
      return handleGenericError(error)
  }
}
```

## Security Best Practices Checklist

### ✅ Token Storage
- [ ] Use HTTP-only cookies for web applications
- [ ] Use secure storage (Keychain/Keystore) for mobile apps
- [ ] Never store tokens in localStorage or sessionStorage
- [ ] Implement token synchronization across tabs/windows

### ✅ Token Transmission
- [ ] Always use HTTPS in production
- [ ] Send tokens in Authorization header (Bearer format)
- [ ] Implement proper CORS configuration
- [ ] Use secure cookie attributes (Secure, SameSite)

### ✅ Token Validation
- [ ] Validate all JWT claims (exp, iss, aud, jti)
- [ ] Implement token signature verification
- [ ] Check token expiration with clock skew tolerance
- [ ] Validate session context and fingerprints

### ✅ Token Rotation
- [ ] Implement automatic refresh token rotation
- [ ] Use refresh tokens only once
- [ ] Implement token reuse detection
- [ ] Link old and new tokens for audit trail

### ✅ Error Handling
- [ ] Implement proper error responses
- [ ] Log security events and incidents
- [ ] Handle token refresh failures gracefully
- [ ] Implement retry logic with exponential backoff

### ✅ Monitoring
- [ ] Monitor token refresh rates
- [ ] Track token reuse detection events
- [ ] Set up alerts for security incidents
- [ ] Implement session duration monitoring

## Environment Variables

```bash
# Required for JWT token system
JWT_SECRET=your-secret-key-minimum-32-characters
NEXTAUTH_SECRET=your-nextauth-secret-key

# Database connections
DATABASE_URL=your-production-database-url
DATABASE_URL_DEV=your-development-database-url
DATABASE_URL_TEST=your-test-database-url

# Security headers
NEXTAUTH_URL=https://your-domain.com
```

## Testing Utilities

```typescript
// Test helpers
export const createTestUser = (): User => ({
  id: generateUUID(),
  email: 'test@example.com',
  displayName: 'Test User',
  username: 'testuser',
  githubUsername: 'testuser',
  emailVerified: true,
  twoFactorEnabled: false,
  failedLoginAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date()
})

export const createTestSession = (userId: string): UserSession => ({
  id: generateUUID(),
  userId,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  authMethod: 'oauth',
  lastActiveAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
})

export const createTestTokens = async (user: User, session: UserSession) => {
  const accessToken = await generateAccessToken(user, session)
  const refreshToken = await generateRefreshToken(user.id, session.id)
  
  return { accessToken, refreshToken }
}
```

## Performance Optimization

```typescript
// Token verification caching
const tokenCache = new Map<string, { payload: AccessTokenPayload; expiry: number }>()

export const verifyAccessTokenCached = async (token: string): Promise<AccessTokenPayload> => {
  const cacheKey = token.split('.')[2] // Use signature as key
  const cached = tokenCache.get(cacheKey)
  
  if (cached && cached.expiry > Date.now()) {
    return cached.payload
  }
  
  const payload = await verifyAccessToken(token)
  
  // Cache for 5 minutes
  tokenCache.set(cacheKey, {
    payload,
    expiry: Date.now() + 5 * 60 * 1000
  })
  
  return payload
}

// Batch token operations
export const batchTokenOperations = async (operations: TokenOperation[]): Promise<void> => {
  const grouped = groupOperationsByType(operations)
  
  await Promise.all([
    processBatchRevocations(grouped.revocations),
    processBatchGenerations(grouped.generations),
    processBatchVerifications(grouped.verifications)
  ])
}
```

This quick reference covers the essential patterns and utilities for working with the JWT token rotation system. For detailed explanations and advanced usage, refer to the complete [JWT Token Rotation Security Guide](./jwt-token-rotation.md).