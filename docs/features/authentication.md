# Authentication System Documentation

Comprehensive documentation for the Contribux authentication system using GitHub OAuth and NextAuth.js.

## Table of Contents

- [Overview](#overview)
- [Multi-Provider OAuth Implementation](#multi-provider-oauth-implementation)
- [NextAuth.js Configuration](#nextauth-configuration)
- [WebAuthn Simplification](#webauthn-simplification)
- [Security Features](#security-features)
- [Database Schema](#database-schema)
- [Environment Configuration](#environment-configuration)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Testing](#testing)

## Overview

The Contribux platform uses a simplified authentication system focused on GitHub OAuth for seamless
integration with the developer ecosystem. The implementation has been streamlined to remove complexity
while maintaining security best practices.

## Multi-Provider OAuth Implementation

### Supported Providers

#### GitHub Provider (Primary)

- **Scope**: `read:user user:email`
- **Features**: Username extraction, repository access integration
- **Primary Use**: Main authentication method for developers

#### Google Provider (Optional)

- **Scope**: `openid email profile`
- **Features**: PKCE support, offline access, email verification
- **Use Case**: Alternative authentication option

### Account Linking Scenarios

1. **New User Signup**

   - Creates new user with OAuth provider as primary
   - Extracts provider-specific user data (name, username, etc.)
   - Sets up initial OAuth account with `is_primary = true`

2. **Existing User + Same Email**

   - Automatically links new provider to existing user account
   - Maintains existing user data while adding new provider
   - Updates user profile with additional provider information
   - Sets new provider as `is_primary = false`

3. **Provider Already Linked**

   - Updates existing OAuth tokens for the provider
   - Refreshes access tokens and expiration times
   - Maintains account linking without duplication

4. **Email Conflict Resolution**
   - Prevents account hijacking while enabling legitimate linking
   - Validates email ownership through provider verification
   - Implements secure account merging strategies

## NextAuth Configuration

### Core Configuration

```typescript
// src/lib/auth/config.ts
export const authConfig = {
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Custom session and JWT callbacks
    // Account linking logic
    // Token refresh handling
  },
};
```

### Authentication Handlers

```typescript
// src/lib/auth/index.ts
export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);
```

### API Route Configuration

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

## WebAuthn Simplification

The authentication system was simplified by removing WebAuthn complexity in favor of OAuth-only authentication.

### What Was Removed

- **Dependencies**:

  - `@simplewebauthn/browser`
  - `@simplewebauthn/server`
  - `@simplewebauthn/types`

- **Database Tables**:

  - `webauthn_credentials`
  - `auth_challenges`

- **Code Files**:
  - `src/lib/auth/webauthn.ts`
  - `src/lib/auth/webauthn-config.ts`
  - Related test files

### Benefits of Simplification

1. **Reduced Complexity**: Eliminated complex WebAuthn implementation
2. **Fewer Dependencies**: Removed 3 WebAuthn packages
3. **Simplified Auth Flow**: Single OAuth provider with NextAuth.js
4. **Better Maintainability**: Standard NextAuth.js patterns
5. **Improved Reliability**: Less code to maintain and debug

## Security Features

### Token Management

- Provider-specific token refresh logic
- Secure token storage and rotation
- Proper expiration handling
- Refresh token validation

### Session Security

- Enhanced session data with provider information
- Secure cookie configuration
- HTTP-only, SameSite, and secure flags
- Session token rotation

### Audit Logging

- Comprehensive security event tracking
- OAuth account linking events
- Authentication success/failure logging
- Unusual activity detection

### Email Conflict Resolution

- **Scenario**: User tries to sign in with Provider B using email already registered with Provider A
- **Solution**: Automatic account linking with security validation
- **Protection**: Prevents account hijacking while enabling legitimate use cases

## Database Schema

### Core Tables

```sql
-- Users table with multi-provider support
ALTER TABLE users
    ADD COLUMN display_name VARCHAR(255),
    ADD COLUMN username VARCHAR(255) UNIQUE;

-- OAuth accounts with linking support
ALTER TABLE oauth_accounts
    ADD COLUMN is_primary BOOLEAN DEFAULT false,
    ADD COLUMN linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Account linking requests for email verification
CREATE TABLE account_linking_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    email VARCHAR(255) NOT NULL,
    verification_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Simplified GitHub sessions (post-WebAuthn removal)
CREATE TABLE github_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  github_token TEXT NOT NULL, -- encrypted
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Environment Configuration

### Required Variables

```bash
# GitHub OAuth (required)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# NextAuth
NEXTAUTH_SECRET=your_secure_secret_key
NEXTAUTH_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/database
```

### Optional Variables

```bash
# Google OAuth (optional but recommended)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Feature Flags
ENABLE_OAUTH=true
```

### OAuth Provider Configuration

#### GitHub App Setup

1. Go to GitHub Developer Settings
2. Create new OAuth App
3. Set Authorization callback URL: `https://your-domain.com/api/auth/callback/github`
4. Copy Client ID and Client Secret

#### Google Cloud Console Setup

1. Create new project in Google Cloud Console
2. Enable Google+ API
3. Create OAuth 2.0 Client ID credentials
4. Set Authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
5. Copy Client ID and Client Secret

## Usage Examples

### Basic Sign-In

```typescript
import { signIn } from "next-auth/react";

// Sign in with GitHub
await signIn("github", { callbackUrl: "/dashboard" });

// Sign in with Google
await signIn("google", { callbackUrl: "/dashboard" });
```

### Session Access

```typescript
import { useSession } from "next-auth/react";

function Profile() {
  const { data: session } = useSession();

  if (session?.user) {
    return (
      <div>
        <h1>Welcome {session.user.name}</h1>
        <p>Email: {session.user.email}</p>
        <p>Primary Provider: {session.user.primaryProvider}</p>
        <p>Connected Providers: {session.user.connectedProviders.join(", ")}</p>
      </div>
    );
  }

  return <p>Please sign in</p>;
}
```

### Server-Side Access

```typescript
import { auth } from "@/lib/auth/config";

export default async function ServerComponent() {
  const session = await auth();

  if (session?.user) {
    return <div>Authenticated as {session.user.email}</div>;
  }

  return <div>Not authenticated</div>;
}
```

### Helper Functions

```typescript
import { getServerSession, requireAuth, withAuth } from "@/lib/auth/helpers";

// Get current session
const session = await getServerSession();

// Require auth or redirect
await requireAuth("/login");

// API route wrapper
export const GET = withAuth(async (request, { user }) => {
  // Protected API route logic
});
```

## Error Handling

### Common Error Scenarios

- **OAuthAccountNotLinked**: Provider email conflicts with existing account
- **Email Verification Required**: Google account not verified
- **Provider Already Linked**: Attempting to link already connected provider
- **Invalid Provider**: Unsupported OAuth provider

### Error Page Configuration

```typescript
// pages/auth/error.tsx
export default function AuthError() {
  const router = useRouter();
  const { error } = router.query;

  const errorMessages = {
    OAuthAccountNotLinked:
      "This account is already associated with another provider.",
    EmailSignin: "Please check your email for the sign-in link.",
    Default: "An error occurred during authentication.",
  };

  return (
    <div>
      <h1>Authentication Error</h1>
      <p>{errorMessages[error as string] || errorMessages.Default}</p>
    </div>
  );
}
```

## Testing

### Test Coverage

The implementation includes comprehensive tests covering:

- Provider configuration validation
- Account linking scenarios
- Token management and refresh
- Session enhancement
- Error handling
- Security validations

### Running Tests

```bash
# Run all auth tests
pnpm test tests/auth/

# Run multi-provider specific tests
pnpm test tests/auth/multi-provider-auth.test.ts

# Run NextAuth tests
pnpm test tests/auth/nextauth.test.ts

# Run with coverage
pnpm test:coverage tests/auth/
```

### Test Scenarios

1. New user registration with GitHub
2. New user registration with Google
3. Existing GitHub user linking Google account
4. Existing Google user linking GitHub account
5. Attempting to link already connected provider
6. Email conflict resolution
7. Token refresh for both providers
8. Session management across providers

## Security Best Practices Implemented

1. **PKCE Support**: Enabled for all OAuth flows
2. **Secure Cookies**: HTTP-only, secure, SameSite settings
3. **Token Rotation**: Automatic refresh token rotation
4. **Audit Logging**: Comprehensive security event tracking
5. **Email Verification**: Required for Google provider
6. **Rate Limiting**: Protection against abuse
7. **Session Security**: Enhanced session management with provider tracking
8. **CSRF Protection**: Built-in NextAuth CSRF protection
9. **XSS Prevention**: Proper cookie security attributes
10. **Account Hijacking Prevention**: Secure email conflict resolution

## Deployment Checklist

- [ ] Set all required environment variables
- [ ] Configure OAuth provider callback URLs
- [ ] Run database migrations
- [ ] Verify SSL/HTTPS setup
- [ ] Test authentication flows
- [ ] Verify error handling
- [ ] Check audit logging
- [ ] Validate session management
- [ ] Test token refresh functionality
- [ ] Confirm provider linking works

## Monitoring and Maintenance

### Security Monitoring

- Monitor security audit logs for unusual activity
- Track authentication success/failure rates
- Watch for account linking anomalies
- Monitor token refresh failures

### Performance Monitoring

- Database query performance for user/account lookups
- OAuth provider response times
- Session management overhead
- Token refresh frequency

### Regular Maintenance

- Review and rotate OAuth client secrets
- Update provider configurations as needed
- Monitor for security updates in NextAuth
- Review audit logs for security patterns

This implementation provides a production-ready, secure, and extensible authentication system that
follows NextAuth.js v5 best practices and modern OAuth security standards.
