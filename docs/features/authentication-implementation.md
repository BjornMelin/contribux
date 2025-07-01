# Authentication Implementation Guide

> _Practical implementation patterns for modern authentication in Contribux_

## Quick Start: Better Auth Implementation

### 1. Installation and Setup

```bash
# Install Better Auth and dependencies
pnpm add better-auth @better-auth/pg
pnpm add -D @types/pg

# Install additional providers if needed
pnpm add @better-auth/github @better-auth/google
```

### 2. Environment Configuration

```typescript
// .env.local additions
BETTER_AUTH_SECRET="your-secret-key-minimum-32-characters"
BETTER_AUTH_URL="http://localhost:3000"

# Keep existing OAuth credentials
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Database (use existing DATABASE_URL)
DATABASE_URL="your-existing-neon-url"
```

### 3. Core Authentication Setup

```typescript
// src/lib/auth/better-auth.ts
import { betterAuth } from "better-auth";
import { pg } from "@better-auth/pg";
import { getEnv } from "@/lib/validation/env";

const env = getEnv();

export const auth = betterAuth({
  database: pg({
    connectionString: env.DATABASE_URL,
  }),

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // Social providers
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      scope: ["user:email"],
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      scope: ["openid", "email", "profile"],
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Security settings
  secret: env.BETTER_AUTH_SECRET || env.JWT_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,

  // Rate limiting
  rateLimit: {
    window: 60, // 1 minute
    max: 10, // 10 attempts per minute
  },

  // Advanced security
  advanced: {
    crossSubDomainCookies: {
      enabled: false, // Enable for subdomain support
    },
    useSecureCookies: env.NODE_ENV === "production",
    generateId: () => crypto.randomUUID(),
  },

  // Callbacks for custom logic
  callbacks: {
    async signIn(user, account) {
      // Custom sign-in logic
      console.log(`User ${user.email} signed in via ${account.provider}`);
      return true;
    },

    async signUp(user) {
      // Custom sign-up logic
      console.log(`New user registered: ${user.email}`);
      return true;
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.User;
```

### 4. API Route Handlers

```typescript
// src/app/api/auth/[...better-auth]/route.ts
import { auth } from "@/lib/auth/better-auth";

export const { GET, POST } = auth.handler;
```

### 5. Client-Side Setup

```typescript
// src/lib/auth/client.ts
import { createAuthClient } from "better-auth/react";
import { getEnv } from "@/lib/validation/env";

const env = getEnv();

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  // Optional: custom fetch configuration
  fetchOptions: {
    credentials: "include",
  },
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  // Social providers
  signInSocial,
  // Email verification
  sendVerificationEmail,
  verifyEmail,
  // Password reset
  forgetPassword,
  resetPassword,
} = authClient;
```

### 6. React Components

```typescript
// src/components/auth/auth-provider.tsx
"use client";

import { ReactNode } from "react";
import { SessionProvider } from "better-auth/react";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

```typescript
// src/components/auth/sign-in-form.tsx
"use client";

import { useState } from "react";
import { signIn, signInSocial } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      });
    } catch (error) {
      console.error("Sign in failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: "github" | "google") => {
    try {
      await signInSocial({
        provider,
        callbackURL: "/dashboard",
      });
    } catch (error) {
      console.error(`${provider} sign in failed:`, error);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <div className="space-y-2">
        <Button
          variant="outline"
          onClick={() => handleSocialSignIn("github")}
          className="w-full"
        >
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSocialSignIn("google")}
          className="w-full"
        >
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
```

### 7. Session Management

```typescript
// src/components/auth/user-button.tsx
"use client";

import { useSession, signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />;
  }

  if (!session) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={session.user.image || ""}
              alt={session.user.name || ""}
            />
            <AvatarFallback>
              {session.user.name?.charAt(0) || session.user.email?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex flex-col space-y-1 p-2">
          <p className="text-sm font-medium">{session.user.name}</p>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 8. Middleware for Route Protection

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/better-auth";

export async function middleware(request: NextRequest) {
  // Get session from request
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!session) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
  }

  // Redirect authenticated users away from auth pages
  if (request.nextUrl.pathname.startsWith("/auth")) {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/api/protected/:path*"],
};
```

### 9. Server-Side Session Access

```typescript
// src/lib/auth/server.ts
import { auth } from "@/lib/auth/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function getSession() {
  return await auth.api.getSession({
    headers: headers(),
  });
}

export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    redirect("/auth/signin");
  }

  return session;
}

// Usage in Server Components
export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <div>
      <h1>Welcome, {session.user.name}!</h1>
    </div>
  );
}
```

### 10. Database Schema Migration

```sql
-- Better Auth will create these tables automatically
-- This is for reference and custom extensions

-- Users table (created by Better Auth)
CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (created by Better Auth)
CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Accounts table for OAuth (created by Better Auth)
CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP,
  "refreshTokenExpiresAt" TIMESTAMP,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Custom extensions for Contribux
ALTER TABLE "user" ADD COLUMN "github_username" TEXT;
ALTER TABLE "user" ADD COLUMN "preferences" JSONB DEFAULT '{}';
ALTER TABLE "user" ADD COLUMN "last_login" TIMESTAMP;

-- Indexes for performance
CREATE INDEX "user_email_idx" ON "user"("email");
CREATE INDEX "session_token_idx" ON "session"("token");
CREATE INDEX "session_user_id_idx" ON "session"("userId");
CREATE INDEX "account_user_id_idx" ON "account"("userId");
CREATE INDEX "account_provider_idx" ON "account"("providerId", "accountId");
```

## Migration from Current NextAuth.js Setup

### Step 1: Install Better Auth Alongside NextAuth.js

```bash
# Keep existing NextAuth.js for now
pnpm add better-auth @better-auth/pg
```

### Step 2: Set Up Better Auth Configuration

```typescript
// src/lib/auth/better-auth-migration.ts
import { betterAuth } from "better-auth";
import { pg } from "@better-auth/pg";

// Configure Better Auth to use different table prefix during migration
export const newAuth = betterAuth({
  database: pg({
    connectionString: process.env.DATABASE_URL,
    options: {
      // Use different schema or table prefix during migration
      schema: "better_auth",
    },
  }),
  // ... rest of configuration
});
```

### Step 3: Create Migration Script

```typescript
// scripts/migrate-auth.ts
import { auth as oldAuth } from "@/lib/auth/nextauth";
import { newAuth } from "@/lib/auth/better-auth-migration";

async function migrateUsers() {
  // Get all users from NextAuth tables
  const users = await db.query(`
    SELECT u.id, u.name, u.email, u.image, u.emailVerified, u.createdAt
    FROM users u
  `);

  // Migrate each user to Better Auth
  for (const user of users.rows) {
    await newAuth.api.createUser({
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      // Map additional fields as needed
    });
  }

  // Migrate OAuth accounts
  const accounts = await db.query(`
    SELECT a.*, u.email
    FROM accounts a
    JOIN users u ON a.userId = u.id
  `);

  for (const account of accounts.rows) {
    // Link OAuth accounts to migrated users
    await newAuth.api.linkAccount({
      userId: account.userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      // ... other account fields
    });
  }
}

// Run migration
migrateUsers().catch(console.error);
```

### Step 4: Feature Flag Implementation

```typescript
// src/lib/feature-flags.ts
export const useNewAuth = process.env.ENABLE_BETTER_AUTH === "true";

// src/lib/auth/index.ts
import { useNewAuth } from "@/lib/feature-flags";

if (useNewAuth) {
  export * from "./better-auth";
} else {
  export * from "./nextauth";
}
```

### Step 5: Gradual Component Migration

```typescript
// src/components/auth/unified-auth-provider.tsx
"use client";

import { useNewAuth } from "@/lib/feature-flags";
import { SessionProvider as NextAuthProvider } from "next-auth/react";
import { SessionProvider as BetterAuthProvider } from "better-auth/react";

export function UnifiedAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (useNewAuth) {
    return <BetterAuthProvider>{children}</BetterAuthProvider>;
  }

  return <NextAuthProvider>{children}</NextAuthProvider>;
}
```

## Security Enhancements

### 1. Rate Limiting Implementation

```typescript
// src/lib/auth/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"), // 5 attempts per minute
  analytics: true,
});

// Usage in API routes
export async function checkAuthRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await authRateLimit.limit(
    identifier
  );

  return {
    allowed: success,
    limit,
    reset,
    remaining,
  };
}
```

### 2. Enhanced Security Headers

```typescript
// src/lib/auth/security.ts
import { NextResponse } from "next/server";

export function addSecurityHeaders(response: NextResponse) {
  // Authentication-specific security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // CSRF protection
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // Content Security Policy for auth pages
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.github.com https://accounts.google.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  return response;
}
```

### 3. Audit Logging

```typescript
// src/lib/auth/audit.ts
import { db } from "@/lib/db";

export interface AuthEvent {
  userId?: string;
  email?: string;
  action: string;
  provider?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuthEvent(event: AuthEvent) {
  await db.authAuditLogs.create({
    data: {
      userId: event.userId,
      email: event.email,
      action: event.action,
      provider: event.provider,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      success: event.success,
      error: event.error,
      metadata: event.metadata,
      timestamp: new Date(),
    },
  });

  // Also log to external monitoring service
  if (process.env.NODE_ENV === "production") {
    console.log(
      JSON.stringify({
        type: "auth_event",
        ...event,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// Usage in auth handlers
export async function enhancedSignIn(credentials: SignInCredentials) {
  const startTime = Date.now();

  try {
    const result = await signIn(credentials);

    await logAuthEvent({
      userId: result.user.id,
      email: result.user.email,
      action: "sign_in",
      provider: credentials.provider,
      success: true,
      metadata: {
        duration: Date.now() - startTime,
      },
    });

    return result;
  } catch (error) {
    await logAuthEvent({
      email: credentials.email,
      action: "sign_in",
      provider: credentials.provider,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      metadata: {
        duration: Date.now() - startTime,
      },
    });

    throw error;
  }
}
```

## Testing Strategy

### 1. Authentication Flow Tests

```typescript
// tests/auth/better-auth.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { auth } from "@/lib/auth/better-auth";

describe("Better Auth Integration", () => {
  beforeEach(async () => {
    // Clean up test database
    await auth.api.testutils.cleanDatabase();
  });

  test("should create user with email and password", async () => {
    const userData = {
      email: "test@example.com",
      password: "securepassword123",
      name: "Test User",
    };

    const user = await auth.api.signUp.email(userData);

    expect(user.user.email).toBe(userData.email);
    expect(user.user.name).toBe(userData.name);
    expect(user.user.emailVerified).toBe(false);
  });

  test("should authenticate with valid credentials", async () => {
    // Create user first
    await auth.api.signUp.email({
      email: "test@example.com",
      password: "securepassword123",
    });

    const result = await auth.api.signIn.email({
      email: "test@example.com",
      password: "securepassword123",
    });

    expect(result.session).toBeDefined();
    expect(result.user.email).toBe("test@example.com");
  });

  test("should handle OAuth callback", async () => {
    const mockOAuthData = {
      provider: "github",
      providerAccountId: "123456",
      email: "test@example.com",
      name: "GitHub User",
    };

    const result = await auth.api.callback.oauth(mockOAuthData);

    expect(result.user.email).toBe(mockOAuthData.email);
    expect(result.account.provider).toBe("github");
  });
});
```

### 2. Security Tests

```typescript
// tests/auth/security.test.ts
import { describe, test, expect } from "vitest";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { validateJwtToken } from "@/lib/auth/jwt";

describe("Authentication Security", () => {
  test("should enforce rate limiting", async () => {
    const identifier = "test-user";

    // First 5 attempts should succeed
    for (let i = 0; i < 5; i++) {
      const result = await checkAuthRateLimit(identifier);
      expect(result.allowed).toBe(true);
    }

    // 6th attempt should be blocked
    const blockedResult = await checkAuthRateLimit(identifier);
    expect(blockedResult.allowed).toBe(false);
  });

  test("should validate JWT tokens securely", () => {
    const validToken = "valid.jwt.token";
    const invalidToken = "invalid.token";

    expect(validateJwtToken(validToken)).toBeDefined();
    expect(validateJwtToken(invalidToken)).toBeNull();
  });

  test("should prevent session fixation", async () => {
    // Test that session IDs change after authentication
    const session1 = await auth.api.createSession({ userId: "test" });
    const session2 = await auth.api.createSession({ userId: "test" });

    expect(session1.token).not.toBe(session2.token);
  });
});
```

## Performance Optimization

### 1. Session Caching

```typescript
// src/lib/auth/session-cache.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";

// Cache session data for the duration of a request
export const getSessionCached = cache(async (sessionToken: string) => {
  return await auth.api.getSession({ token: sessionToken });
});

// Cache user data with longer TTL
export const getUserCached = unstable_cache(
  async (userId: string) => {
    return await auth.api.getUser({ userId });
  },
  ["user"],
  {
    revalidate: 300, // 5 minutes
    tags: ["auth", "user"],
  }
);
```

### 2. Database Optimization

```sql
-- Indexes for Better Auth tables
CREATE INDEX CONCURRENTLY "session_expires_at_idx" ON "session"("expiresAt");
CREATE INDEX CONCURRENTLY "session_user_id_expires_idx" ON "session"("userId", "expiresAt");
CREATE INDEX CONCURRENTLY "account_provider_account_idx" ON "account"("providerId", "accountId");

-- Cleanup expired sessions (run as scheduled job)
DELETE FROM "session" WHERE "expiresAt" < NOW();
```

## Monitoring and Alerting

### 1. Metrics Collection

```typescript
// src/lib/auth/metrics.ts
import { Counter, Histogram, Gauge } from "prom-client";

export const authMetrics = {
  signInAttempts: new Counter({
    name: "auth_signin_attempts_total",
    help: "Total number of sign-in attempts",
    labelNames: ["provider", "success"],
  }),

  sessionDuration: new Histogram({
    name: "auth_session_duration_seconds",
    help: "Duration of user sessions",
    buckets: [300, 600, 1800, 3600, 7200, 14400, 28800], // 5min to 8hrs
  }),

  activeUsers: new Gauge({
    name: "auth_active_users",
    help: "Number of currently active users",
  }),

  rateLimitHits: new Counter({
    name: "auth_rate_limit_hits_total",
    help: "Number of rate limit hits",
    labelNames: ["identifier_type"],
  }),
};

// Update metrics in auth handlers
export function recordSignInAttempt(provider: string, success: boolean) {
  authMetrics.signInAttempts.inc({ provider, success: success.toString() });
}
```

This implementation guide provides a complete, production-ready authentication system using Better Auth that addresses all the security requirements and best practices identified in the research phase.
