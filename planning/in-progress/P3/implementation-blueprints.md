# Contribux Phase 3: Implementation-Ready Blueprints

**Document**: Detailed Implementation Guidance  
**Phase**: 3 - Architecture Simplification Implementation  
**Target**: 85% complexity reduction, 90% portfolio value preservation  
**Status**: Ready for Development Execution  
**Date**: 2025-06-30

---

## Blueprint Overview

These implementation blueprints provide detailed, step-by-step guidance for executing the architectural simplification strategy. Each blueprint includes specific code examples, file structures, command sequences, and validation steps to ensure successful implementation.

### Implementation Sequence
1. **🚨 URGENT Security Remediation** (24-48 hours)
2. **📦 Component Elimination** (Week 1)
3. **🔄 Library Migrations** (Weeks 2-4)
4. **⚡ Performance Optimization** (Week 5)
5. **✅ Production Validation** (Week 6)

---

## URGENT Blueprint 1: Security Vulnerability Remediation (24-48 Hours)

### Priority 1: JWT Signature Bypass Fix

#### Step 1: Install Required Dependencies
```bash
cd /home/bjorn/repos/agents/contribux
pnpm add jose @types/jose
```

#### Step 2: Create Secure JWT Utility
```typescript
// src/lib/auth/jwt-secure.ts
import { jwtVerify, SignJWT } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function verifyJWT(token: string): Promise<{ valid: boolean; payload?: any }> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'contribux',
      audience: ['contribux-api'],
    })
    return { valid: true, payload }
  } catch (error) {
    console.error('JWT verification failed:', error)
    return { valid: false }
  }
}

export async function signJWT(payload: Record<string, any>): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('contribux')
    .setAudience(['contribux-api'])
    .setExpirationTime('15m')
    .sign(JWT_SECRET)
}

export async function checkAuthentication(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice(7)
  const { valid } = await verifyJWT(token)
  return valid
}
```

#### Step 3: Fix Repositories Route Vulnerability
```typescript
// src/app/api/search/repositories/route.ts - CRITICAL FIX
import { NextRequest, NextResponse } from 'next/server'
import { checkAuthentication } from '@/lib/auth/jwt-secure'

export async function GET(request: NextRequest) {
  // CRITICAL: Replace the vulnerable return true with actual verification
  const isAuthenticated = await checkAuthentication(request)
  
  if (!isAuthenticated) {
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'UNAUTHORIZED', 
          message: 'Valid authentication required' 
        } 
      },
      { status: 401 }
    )
  }

  // Existing search logic continues...
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  
  // Rest of implementation...
}
```

#### Step 4: Add Missing Authentication to Opportunities Route
```typescript
// src/app/api/search/opportunities/route.ts - ADD AUTHENTICATION
import { NextRequest, NextResponse } from 'next/server'
import { checkAuthentication } from '@/lib/auth/jwt-secure'

export async function GET(request: NextRequest) {
  // CRITICAL: Add missing authentication check
  const isAuthenticated = await checkAuthentication(request)
  
  if (!isAuthenticated) {
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'UNAUTHORIZED', 
          message: 'Authentication required for opportunities access' 
        } 
      },
      { status: 401 }
    )
  }

  // Existing opportunities logic...
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  
  // Rest of implementation...
}
```

#### Step 5: Security Validation Script
```bash
#!/bin/bash
# scripts/validate-security-fix.sh

echo "🔍 Validating security fixes..."

# Test 1: Verify JWT verification is working
echo "Testing JWT authentication..."
curl -H "Authorization: Bearer invalid-token" \
     http://localhost:3000/api/search/repositories?q=test

# Should return 401 Unauthorized

# Test 2: Verify opportunities endpoint has authentication
echo "Testing opportunities authentication..."
curl http://localhost:3000/api/search/opportunities?q=test

# Should return 401 Unauthorized

echo "✅ Security validation complete"
```

### Validation Checklist
- [ ] JWT signature verification implemented with `jose` library
- [ ] All API endpoints require valid authentication
- [ ] Invalid tokens return 401 Unauthorized responses
- [ ] Security tests pass validation
- [ ] Changes deployed to production within 24-48 hours

---

## Blueprint 2: Enterprise Component Elimination (Week 1)

### Day 1-2: SOAR Engine Removal

#### Step 1: Identify SOAR Components
```bash
# Find all SOAR-related files
find src/ -name "*soar*" -type f
find src/ -path "*security*" -name "*automation*" -type f
grep -r "SOAR\|SecurityOrchestration" src/ --include="*.ts" --include="*.tsx"
```

#### Step 2: Remove SOAR Engine Files
```bash
# Remove SOAR Engine entirely (614-934 lines eliminated)
rm -rf src/lib/security/soar/
rm -f src/lib/security/soar.ts
rm -f src/lib/security/automated-scanner.ts  # If SOAR-dependent
rm -f src/lib/security/incident-response.ts  # If SOAR-dependent
```

#### Step 3: Replace with Simplified Error Monitoring
```typescript
// src/lib/monitoring/simplified-monitoring.ts
import * as Sentry from '@sentry/nextjs'

export class SimplifiedMonitoring {
  static initialize() {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      debug: process.env.NODE_ENV === 'development',
    })
  }

  static captureError(error: Error, context?: Record<string, any>) {
    Sentry.captureException(error, {
      tags: { component: 'contribux' },
      extra: context
    })
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    Sentry.captureMessage(message, level)
  }
}
```

### Day 3-4: GDPR Compliance Suite Removal

#### Step 1: Remove GDPR Components
```bash
# Remove GDPR Compliance Suite (400+ lines eliminated)
rm -rf src/lib/compliance/gdpr/
rm -f src/lib/compliance/gdpr.ts
rm -f src/lib/privacy/data-protection.ts
rm -f src/lib/privacy/consent-management.ts
```

#### Step 2: Retain Basic Privacy Controls
```typescript
// src/lib/privacy/basic-privacy.ts
export const basicPrivacyControls = {
  // Essential privacy patterns only
  anonymizeUserData: (data: any) => {
    const { email, ...publicData } = data
    return { ...publicData, emailHash: hashEmail(email) }
  },

  validateDataRetention: (timestamp: Date) => {
    const retentionPeriod = 365 * 24 * 60 * 60 * 1000 // 1 year
    return Date.now() - timestamp.getTime() < retentionPeriod
  },

  sanitizeErrorLogs: (error: Error) => {
    // Remove potential PII from error messages
    return error.message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
  }
}
```

### Day 5: Environment Configuration Consolidation

#### Step 1: Audit Current Configuration Files
```bash
# Find all environment configuration files
find src/lib/validation/ -name "*.ts" | wc -l  # Should show 27+ files
ls -la src/lib/validation/
```

#### Step 2: Create Unified Environment Schema
```typescript
// src/lib/env.ts - Unified configuration
import { z } from 'zod'
import { createEnv } from '@t3-oss/env-nextjs'

export const env = createEnv({
  server: {
    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_URL_DEV: z.string().url().optional(),
    DATABASE_URL_TEST: z.string().url().optional(),
    
    // Authentication
    JWT_SECRET: z.string().min(32),
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url().optional(),
    
    // GitHub Integration
    GITHUB_TOKEN: z.string().min(40),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    
    // External Services
    OPENAI_API_KEY: z.string().min(20),
    SENTRY_DSN: z.string().url().optional(),
    
    // Feature Flags
    DEMO_ZERO_TRUST: z.enum(['true', 'false']).default('false'),
    DEMO_ENTERPRISE: z.enum(['true', 'false']).default('false'),
  },
  
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_DEV: process.env.DATABASE_URL_DEV,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    JWT_SECRET: process.env.JWT_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    DEMO_ZERO_TRUST: process.env.DEMO_ZERO_TRUST,
    DEMO_ENTERPRISE: process.env.DEMO_ENTERPRISE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
})
```

#### Step 3: Remove Old Configuration Files
```bash
# Remove 25+ configuration files, keep only 2
rm src/lib/validation/env-original.ts
rm src/lib/validation/env-simplified.ts
rm src/lib/validation/database.ts
rm src/lib/validation/shared.ts
rm src/lib/validation/index.ts
# Keep only src/lib/env.ts and src/lib/config.ts
```

#### Step 4: Create Application Configuration
```typescript
// src/lib/config.ts - Application settings
import { env } from './env'

export const appConfig = {
  database: {
    url: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production',
    poolSize: 10,
  },
  
  auth: {
    jwtSecret: env.JWT_SECRET,
    sessionMaxAge: 15 * 60, // 15 minutes
  },
  
  github: {
    token: env.GITHUB_TOKEN,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    userAgent: 'contribux/1.0.0',
  },
  
  features: {
    zeroTrust: env.DEMO_ZERO_TRUST === 'true',
    enterprise: env.DEMO_ENTERPRISE === 'true',
  },
  
  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    enableAnalytics: env.NODE_ENV === 'production',
  },
} as const
```

---

## Blueprint 3: NextAuth.js v5 Migration (Week 2)

### Day 1: NextAuth.js Installation and Setup

#### Step 1: Install Dependencies
```bash
pnpm add next-auth@beta @auth/neon-adapter
pnpm add -D @types/next-auth
```

#### Step 2: Create Auth Configuration
```typescript
// src/lib/auth/config.ts
import { NextAuthConfig } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { NeonAdapter } from '@auth/neon-adapter'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'

const sql = neon(env.DATABASE_URL)

export const authConfig = {
  adapter: NeonAdapter(sql),
  
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'read:user user:email public_repo'
        }
      }
    })
  ],
  
  session: { 
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    maxAge: 15 * 60, // 15 minutes
  },
  
  callbacks: {
    jwt({ token, user, account }) {
      if (user && account) {
        token.githubId = user.id
        token.githubUsername = (user as any).login || user.name
        token.githubToken = account.access_token
      }
      return token
    },
    
    session({ session, token }) {
      if (token) {
        session.user.id = token.githubId as string
        session.user.githubUsername = token.githubUsername as string
        // Don't expose GitHub token to client
      }
      return session
    },
  },
  
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
} satisfies NextAuthConfig
```

#### Step 3: Setup Auth Handlers
```typescript
// src/lib/auth/index.ts
import NextAuth from 'next-auth'
import { authConfig } from './config'

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

// Export auth check for API routes
export async function checkAuthentication(): Promise<boolean> {
  const session = await auth()
  return !!session?.user
}

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Authentication required')
  }
  return session
}
```

#### Step 4: Create API Route Handlers
```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

### Day 2: Database Schema Migration

#### Step 1: Create NextAuth Database Tables
```sql
-- Database schema for NextAuth.js (run via migration)
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE verification_tokens (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Indexes for performance
CREATE INDEX accounts_user_id_idx ON accounts(user_id);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_token_idx ON sessions(session_token);
```

### Day 3-4: API Route Migration

#### Step 1: Update All API Routes
```typescript
// src/app/api/search/repositories/route.ts - Updated with NextAuth
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // Replace custom JWT with NextAuth session check
  const session = await auth()
  
  if (!session?.user) {
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'UNAUTHORIZED', 
          message: 'Please sign in to access repositories' 
        } 
      },
      { status: 401 }
    )
  }

  // Access user info from session
  const { user } = session
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  
  // Rest of implementation with user context...
}
```

#### Step 2: Create Middleware for Route Protection
```typescript
// src/middleware.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  
  // Protect API routes
  if (pathname.startsWith('/api/search')) {
    if (!req.auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
  }
  
  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!req.auth) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }
  }
})

export const config = {
  matcher: ['/api/search/:path*', '/dashboard/:path*']
}
```

### Day 5: Remove Custom JWT Implementation

#### Step 1: Remove Custom Auth Files
```bash
# Remove 784 lines of custom JWT implementation
rm -f src/lib/auth/jwt.ts
rm -f src/lib/auth/custom-jwt.ts
rm -f src/lib/auth/token-management.ts
rm -f src/lib/auth/session-manager.ts
```

#### Step 2: Update All Import References
```bash
# Find and replace all custom JWT imports
grep -r "from.*auth/jwt" src/ --include="*.ts" --include="*.tsx"
# Replace with: import { auth } from '@/lib/auth'
```

---

## Blueprint 4: GitHub Client Migration (Week 3)

### Day 1: @octokit/rest Installation

#### Step 1: Install Octokit Dependencies
```bash
pnpm add @octokit/rest @octokit/plugin-retry @octokit/plugin-throttling
pnpm remove @octokit/auth-app  # Remove if custom implementation exists
```

#### Step 2: Create GitHub Service Wrapper
```typescript
// src/lib/github/service.ts
import { Octokit } from '@octokit/rest'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { env } from '@/lib/env'

const MyOctokit = Octokit.plugin(retry, throttling)

export class GitHubService {
  private octokit: InstanceType<typeof MyOctokit>

  constructor(auth?: string) {
    this.octokit = new MyOctokit({
      auth: auth || env.GITHUB_TOKEN,
      userAgent: 'contribux/1.0.0',
      
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          console.warn(`Rate limit hit, retrying after ${retryAfter}s`)
          return true
        },
        onSecondaryRateLimit: (retryAfter: number, options: any) => {
          console.warn(`Secondary rate limit, retrying after ${retryAfter}s`)
          return true
        },
      },
      
      retry: {
        doNotRetry: ['400', '401', '403', '404', '422', '451']
      }
    })
  }

  // Repository operations
  async getRepository(owner: string, repo: string) {
    return this.octokit.rest.repos.get({ owner, repo })
  }

  async searchRepositories(query: string, options: {
    sort?: 'stars' | 'forks' | 'updated'
    order?: 'asc' | 'desc'
    per_page?: number
    page?: number
  } = {}) {
    return this.octokit.rest.search.repos({
      q: query,
      sort: options.sort || 'stars',
      order: options.order || 'desc',
      per_page: options.per_page || 30,
      page: options.page || 1
    })
  }

  async getRepositoryContributors(owner: string, repo: string) {
    return this.octokit.rest.repos.listContributors({ owner, repo })
  }

  async getRepositoryLanguages(owner: string, repo: string) {
    return this.octokit.rest.repos.listLanguages({ owner, repo })
  }

  // Issue operations  
  async getRepositoryIssues(owner: string, repo: string, options: {
    state?: 'open' | 'closed' | 'all'
    labels?: string
    sort?: 'created' | 'updated' | 'comments'
    per_page?: number
  } = {}) {
    return this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: options.state || 'open',
      labels: options.labels,
      sort: options.sort || 'created',
      per_page: options.per_page || 30
    })
  }

  // User operations
  async getUser(username: string) {
    return this.octokit.rest.users.getByUsername({ username })
  }

  async getUserRepositories(username: string) {
    return this.octokit.rest.repos.listForUser({ username })
  }
}

// Create singleton instance
export const githubService = new GitHubService()
```

### Day 2-3: Replace Custom GitHub Client

#### Step 1: Remove Custom Implementation
```bash
# Remove 1,132 lines of custom GitHub client
rm -rf src/lib/github/client/
rm -f src/lib/github/client.ts
rm -f src/lib/github/api-wrapper.ts
rm -f src/lib/github/rate-limiter.ts
rm -f src/lib/github/response-transformer.ts
```

#### Step 2: Update API Routes
```typescript
// src/app/api/search/repositories/route.ts - Updated with Octokit
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { githubService } from '@/lib/github/service'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const sort = (searchParams.get('sort') as 'stars' | 'forks' | 'updated') || 'stars'
    const order = (searchParams.get('order') as 'asc' | 'desc') || 'desc'
    
    // Use simplified Octokit service
    const response = await githubService.searchRepositories(query, {
      sort,
      order,
      per_page: 30
    })

    return NextResponse.json({
      success: true,
      data: {
        items: response.data.items,
        total_count: response.data.total_count
      }
    })
  } catch (error) {
    console.error('Repository search failed:', error)
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    )
  }
}
```

### Day 4: Type Definitions Update

#### Step 1: Simplify Type Definitions
```typescript
// src/lib/github/types.ts - Simplified types
import { components } from '@octokit/openapi-types'

// Use Octokit's official types instead of custom ones
export type GitHubRepository = components['schemas']['repository']
export type GitHubUser = components['schemas']['simple-user']
export type GitHubIssue = components['schemas']['issue']

// Custom types only for application-specific data
export interface RepositoryWithOpportunities extends GitHubRepository {
  opportunities?: ContributionOpportunity[]
  healthScore?: number
}

export interface ContributionOpportunity {
  id: string
  title: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  impact: 'low' | 'medium' | 'high'
  labels: string[]
  url: string
  createdAt: Date
}
```

#### Step 2: Remove Custom Type Mappings
```bash
# Remove complex type transformation files
rm -f src/lib/github/type-mappers.ts
rm -f src/lib/github/response-types.ts
rm -f src/lib/github/custom-schemas.ts
```

---

## Blueprint 5: Drizzle ORM Migration (Week 4)

### Day 1: Drizzle Installation and Schema Setup

#### Step 1: Install Drizzle Dependencies
```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

#### Step 2: Configure Drizzle
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit'
import { env } from './src/lib/env'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config
```

#### Step 3: Define Database Schema
```typescript
// src/lib/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  username: text('username').notNull(),
  email: text('email').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  profile: jsonb('profile').$type<{
    bio?: string
    location?: string
    company?: string
    website?: string
  }>(),
  preferences: jsonb('preferences').$type<{
    emailNotifications?: boolean
    theme?: 'light' | 'dark'
    language?: string
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Repositories table
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  fullName: text('full_name').notNull(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  description: text('description'),
  
  metadata: jsonb('metadata').$type<{
    language?: string
    stars?: number
    forks?: number
    openIssues?: number
    license?: string
    topics?: string[]
    defaultBranch?: string
    size?: number
    archived?: boolean
    disabled?: boolean
    private?: boolean
  }>(),
  
  healthMetrics: jsonb('health_metrics').$type<{
    maintainerResponsiveness?: number
    activityLevel?: number
    codeQuality?: number
    communityEngagement?: number
    documentationQuality?: number
    overallScore?: number
  }>(),
  
  // Vector embedding for semantic search
  embedding: text('embedding'), // Store as text, parse as needed
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Opportunities table
export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  issueNumber: integer('issue_number'),
  title: text('title').notNull(),
  description: text('description'),
  
  metadata: jsonb('metadata').$type<{
    labels?: string[]
    author?: string
    createdAt?: string
    updatedAt?: string
    commentCount?: number
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    estimatedHours?: number
    mentorshipAvailable?: boolean
    goodFirstIssue?: boolean
  }>(),
  
  difficultyScore: integer('difficulty_score').default(5), // 1-10 scale
  impactScore: integer('impact_score').default(5), // 1-10 scale
  
  // Vector embedding for opportunity matching
  embedding: text('embedding'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// Relations
export const userRelations = relations(users, ({ many }) => ({
  bookmarks: many(bookmarks),
}))

export const repositoryRelations = relations(repositories, ({ many }) => ({
  opportunities: many(opportunities),
  bookmarks: many(bookmarks),
}))

export const opportunityRelations = relations(opportunities, ({ one }) => ({
  repository: one(repositories, {
    fields: [opportunities.repositoryId],
    references: [repositories.id],
  }),
}))

// Bookmarks table (user favorites)
export const bookmarks = pgTable('bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  repositoryId: uuid('repository_id').references(() => repositories.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const bookmarkRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [bookmarks.repositoryId],
    references: [repositories.id],
  }),
}))
```

### Day 2: Database Connection Setup

#### Step 1: Create Database Client
```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'
import * as schema from './schema'

// Create connection
const sql = neon(env.DATABASE_URL)

// Create Drizzle instance
export const db = drizzle(sql, { schema })

// Export schema for use in queries
export { schema }

// Helper types
export type Database = typeof db
export type Schema = typeof schema
```

### Day 3-4: Query Migration

#### Step 1: Migrate Repository Queries
```typescript
// src/lib/db/queries/repositories.ts
import { db, schema } from '@/lib/db'
import { eq, ilike, desc, and, or, sql } from 'drizzle-orm'

export class RepositoryQueries {
  // Search repositories with text and metadata
  static async search(query: string, options: {
    limit?: number
    offset?: number
    sortBy?: 'stars' | 'updated' | 'created'
    minStars?: number
  } = {}) {
    const { limit = 30, offset = 0, sortBy = 'stars', minStars = 0 } = options
    
    return await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          or(
            ilike(schema.repositories.name, `%${query}%`),
            ilike(schema.repositories.description, `%${query}%`),
            sql`${schema.repositories.metadata}->>'language' ILIKE ${`%${query}%`}`
          ),
          sql`CAST(${schema.repositories.metadata}->>'stars' AS INTEGER) >= ${minStars}`
        )
      )
      .orderBy(
        sortBy === 'stars' ? desc(sql`CAST(${schema.repositories.metadata}->>'stars' AS INTEGER)`) :
        sortBy === 'updated' ? desc(schema.repositories.updatedAt) :
        desc(schema.repositories.createdAt)
      )
      .limit(limit)
      .offset(offset)
  }

  // Get repository by GitHub ID
  static async getByGithubId(githubId: number) {
    return await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.githubId, githubId))
      .limit(1)
  }

  // Get repository with opportunities
  static async getWithOpportunities(repositoryId: string) {
    return await db
      .select({
        repository: schema.repositories,
        opportunities: schema.opportunities,
      })
      .from(schema.repositories)
      .leftJoin(
        schema.opportunities,
        eq(schema.repositories.id, schema.opportunities.repositoryId)
      )
      .where(eq(schema.repositories.id, repositoryId))
  }

  // Upsert repository data
  static async upsert(data: {
    githubId: number
    fullName: string
    name: string
    owner: string
    description?: string
    metadata?: any
    healthMetrics?: any
    embedding?: string
  }) {
    return await db
      .insert(schema.repositories)
      .values(data)
      .onConflictDoUpdate({
        target: schema.repositories.githubId,
        set: {
          fullName: data.fullName,
          name: data.name,
          owner: data.owner,
          description: data.description,
          metadata: data.metadata,
          healthMetrics: data.healthMetrics,
          embedding: data.embedding,
          updatedAt: sql`now()`,
        },
      })
      .returning()
  }
}
```

#### Step 2: Migrate User Queries
```typescript
// src/lib/db/queries/users.ts
import { db, schema } from '@/lib/db'
import { eq, sql } from 'drizzle-orm'

export class UserQueries {
  // Get user by GitHub ID
  static async getByGithubId(githubId: number) {
    return await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .limit(1)
  }

  // Create or update user
  static async upsert(data: {
    githubId: number
    username: string
    email?: string
    name?: string
    avatarUrl?: string
    profile?: any
  }) {
    return await db
      .insert(schema.users)
      .values(data)
      .onConflictDoUpdate({
        target: schema.users.githubId,
        set: {
          username: data.username,
          email: data.email,
          name: data.name,
          avatarUrl: data.avatarUrl,
          profile: data.profile,
          updatedAt: sql`now()`,
        },
      })
      .returning()
  }

  // Update user preferences
  static async updatePreferences(userId: string, preferences: any) {
    return await db
      .update(schema.users)
      .set({
        preferences,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.users.id, userId))
      .returning()
  }
}
```

### Day 5: Remove Raw SQL Implementation

#### Step 1: Remove Raw SQL Files
```bash
# Remove 2,000+ lines of raw SQL patterns
find src/ -name "*sql*" -not -path "*/node_modules/*" -type f
rm -rf src/lib/database/sql/
rm -f src/lib/database/queries.ts
rm -f src/lib/database/raw-queries.ts
```

#### Step 2: Update API Routes to Use Drizzle
```typescript
// src/app/api/search/repositories/route.ts - Final Drizzle version
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { RepositoryQueries } from '@/lib/db/queries/repositories'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const sortBy = (searchParams.get('sort') as 'stars' | 'updated' | 'created') || 'stars'
    const limit = Number(searchParams.get('limit')) || 30
    const offset = Number(searchParams.get('offset')) || 0
    const minStars = Number(searchParams.get('min_stars')) || 0
    
    // Use type-safe Drizzle queries
    const repositories = await RepositoryQueries.search(query, {
      sortBy,
      limit,
      offset,
      minStars,
    })

    return NextResponse.json({
      success: true,
      data: {
        repositories,
        count: repositories.length,
      }
    })
  } catch (error) {
    console.error('Repository search failed:', error)
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    )
  }
}
```

---

## Blueprint 6: Performance Optimization & Validation (Week 5)

### Day 1-2: Vector Search Optimization

#### Step 1: Optimize HNSW Parameters
```sql
-- Update vector indexes with optimized parameters
-- src/lib/db/migrations/optimize-vector-search.sql

-- Drop existing indexes
DROP INDEX IF EXISTS repositories_embedding_idx;
DROP INDEX IF EXISTS opportunities_embedding_idx;

-- Create optimized indexes
CREATE INDEX repositories_embedding_idx ON repositories 
  USING hnsw (embedding vector_cosine_ops) 
  WITH (m = 16, ef_construction = 200);

CREATE INDEX opportunities_embedding_idx ON opportunities 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Update runtime search parameters
ALTER SYSTEM SET hnsw.ef_search = 40;
SELECT pg_reload_conf();
```

#### Step 2: Implement Caching Layer
```typescript
// src/lib/cache/strategy.ts
import { kv } from '@vercel/kv'

export class CacheStrategy {
  // Level 1: Edge Cache (Vercel) - handled by Next.js
  // Level 2: Redis Cache (Vercel KV) - 5 minutes
  // Level 3: Database - source of truth

  static async get<T>(
    key: string,
    fallback: () => Promise<T>,
    ttlSeconds: number = 300 // 5 minutes default
  ): Promise<T> {
    try {
      // Try Redis cache first
      const cached = await kv.get<T>(key)
      if (cached !== null) {
        return cached
      }
    } catch (error) {
      console.warn('Cache read failed:', error)
    }

    // Fallback to database
    const data = await fallback()

    // Store in cache for next time
    try {
      await kv.setex(key, ttlSeconds, data)
    } catch (error) {
      console.warn('Cache write failed:', error)
    }

    return data
  }

  static async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await kv.keys(pattern)
      if (keys.length > 0) {
        await kv.del(...keys)
      }
    } catch (error) {
      console.warn('Cache invalidation failed:', error)
    }
  }

  // Specific cache methods
  static repositorySearch(query: string, options: any) {
    const key = `search:repos:${query}:${JSON.stringify(options)}`
    return this.get(key, () => RepositoryQueries.search(query, options), 300)
  }

  static repositoryDetails(id: string) {
    const key = `repo:${id}`
    return this.get(key, () => RepositoryQueries.getWithOpportunities(id), 600)
  }
}
```

#### Step 3: Performance Monitoring
```typescript
// src/lib/monitoring/performance.ts
import { performance } from 'perf_hooks'

export class PerformanceMonitor {
  private static metrics = new Map<string, number[]>()

  static startTimer(label: string): () => number {
    const start = performance.now()
    
    return () => {
      const duration = performance.now() - start
      this.recordMetric(label, duration)
      return duration
    }
  }

  private static recordMetric(label: string, duration: number) {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, [])
    }
    
    const measurements = this.metrics.get(label)!
    measurements.push(duration)
    
    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift()
    }
  }

  static getStats(label: string) {
    const measurements = this.metrics.get(label) || []
    if (measurements.length === 0) return null

    const sorted = [...measurements].sort((a, b) => a - b)
    const len = sorted.length
    
    return {
      count: len,
      min: sorted[0],
      max: sorted[len - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    }
  }

  // Middleware for API routes
  static middleware(handler: Function) {
    return async (...args: any[]) => {
      const timer = this.startTimer('api_request')
      try {
        const result = await handler(...args)
        const duration = timer()
        
        if (duration > 1000) {
          console.warn(`Slow API request: ${duration}ms`)
        }
        
        return result
      } catch (error) {
        timer()
        throw error
      }
    }
  }
}
```

### Day 3-4: Bundle Size Optimization

#### Step 1: Analyze Current Bundle
```bash
# Install bundle analyzer
pnpm add -D @next/bundle-analyzer

# Create analysis script
echo 'const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
})

module.exports = withBundleAnalyzer({})
' > analyze-bundle.js

# Run analysis
ANALYZE=true pnpm build
```

#### Step 2: Optimize Imports
```typescript
// src/lib/utils/optimized-imports.ts

// Replace heavy imports with specific ones
export const optimizedImports = {
  // Instead of: import _ from 'lodash'
  // Use: import { debounce, throttle } from 'lodash-es'
  
  // Instead of: import * as Icons from 'lucide-react'  
  // Use: import { Search, Star, GitFork } from 'lucide-react'
  
  // Instead of: import { Octokit } from '@octokit/rest'
  // Use: Dynamic import when needed
  getOctokit: () => import('@octokit/rest').then(m => m.Octokit),
  
  // Instead of: import { OpenAI } from 'openai'
  // Use: Dynamic import for AI features
  getOpenAI: () => import('openai').then(m => m.OpenAI),
}
```

#### Step 3: Implement Dynamic Imports
```typescript
// src/components/search/advanced-search.tsx
import { lazy, Suspense } from 'react'

// Dynamically import heavy components
const VectorSearchPanel = lazy(() => import('./vector-search-panel'))
const AIAnalysisPanel = lazy(() => import('./ai-analysis-panel'))

export function AdvancedSearch() {
  return (
    <div>
      <Suspense fallback={<div>Loading vector search...</div>}>
        <VectorSearchPanel />
      </Suspense>
      
      <Suspense fallback={<div>Loading AI analysis...</div>}>
        <AIAnalysisPanel />
      </Suspense>
    </div>
  )
}
```

### Day 5: Comprehensive Testing

#### Step 1: Performance Testing Script
```typescript
// scripts/performance-test.ts
import { performance } from 'perf_hooks'

async function testAPIPerformance() {
  const baseUrl = process.env.TEST_URL || 'http://localhost:3000'
  const authToken = process.env.TEST_TOKEN
  
  const tests = [
    { name: 'Repository Search', path: '/api/search/repositories?q=react' },
    { name: 'Opportunities Search', path: '/api/search/opportunities?q=good-first-issue' },
    { name: 'Repository Details', path: '/api/repositories/facebook/react' },
  ]

  for (const test of tests) {
    const times: number[] = []
    
    // Run each test 10 times
    for (let i = 0; i < 10; i++) {
      const start = performance.now()
      
      const response = await fetch(`${baseUrl}${test.path}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      })
      
      const end = performance.now()
      
      if (response.ok) {
        times.push(end - start)
      } else {
        console.error(`Test failed: ${test.name} - ${response.status}`)
      }
    }
    
    if (times.length > 0) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length
      const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]
      
      console.log(`${test.name}: avg=${avg.toFixed(1)}ms, p95=${p95.toFixed(1)}ms`)
      
      // Alert if performance targets not met
      if (avg > 100) {
        console.warn(`⚠️  ${test.name} exceeds 100ms target: ${avg.toFixed(1)}ms`)
      }
    }
  }
}

testAPIPerformance().catch(console.error)
```

#### Step 2: Integration Test Suite
```bash
# Run comprehensive test suite
pnpm test                    # Unit tests
pnpm test:integration       # API integration tests  
pnpm test:e2e              # Playwright E2E tests
pnpm test:performance      # Performance benchmarks
pnpm lint && pnpm type-check # Code quality
```

---

## Final Validation Checklist

### Security Validation
- [ ] **JWT vulnerability fixed** and verified with security audit
- [ ] **All API endpoints protected** with proper authentication
- [ ] **NextAuth.js integration** working with GitHub OAuth
- [ ] **Security headers** properly configured
- [ ] **No critical vulnerabilities** in dependency scan

### Performance Validation  
- [ ] **API responses <100ms** for 95th percentile
- [ ] **Bundle size <195KB** total compressed
- [ ] **Vector search <100ms** query performance
- [ ] **Cache hit rate >90%** for frequently accessed data
- [ ] **Page load <2.5s** on 3G networks

### Code Complexity Validation
- [ ] **85% code reduction achieved** (2,884 → 500 lines)
- [ ] **SOAR Engine removed** (614-934 lines eliminated)
- [ ] **Custom JWT replaced** (784 lines → NextAuth.js)
- [ ] **Environment config consolidated** (27 → 2 files)
- [ ] **GitHub client simplified** (1,132 → 100 lines)

### Portfolio Value Validation
- [ ] **Technical sophistication preserved** through modern architecture
- [ ] **AI integration maintained** with OpenAI Agents SDK
- [ ] **Vector search showcased** with optimized performance
- [ ] **Modern stack demonstrated** (Next.js 15, React 19, TypeScript)
- [ ] **Career advancement value** documented and measurable

### Operational Validation
- [ ] **Cost reduction achieved** ($69 → $25/month)
- [ ] **Maintenance reduction** (110 → 6 hours/month)
- [ ] **Deployment automation** working correctly
- [ ] **Monitoring systems** operational with essential metrics
- [ ] **Documentation updated** for new architecture

---

This comprehensive implementation blueprint provides detailed, actionable guidance for executing the architectural simplification strategy while maintaining portfolio demonstration value and achieving all target metrics.
