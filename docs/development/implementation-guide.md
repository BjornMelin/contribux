# Implementation Guide

Comprehensive guide for implementing features in the Contribux platform following KISS principles and
modern development practices.

## Table of Contents

- [Project Architecture](#project-architecture)
- [Multi-Provider OAuth Implementation](#multi-provider-oauth-implementation)
- [Development Standards](#development-standards)
- [Testing Strategy](#testing-strategy)
- [Security Implementation](#security-implementation)
- [Database Design](#database-design)
- [Performance Optimization](#performance-optimization)
- [Deployment Process](#deployment-process)

## Project Architecture

### Tech Stack Overview

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5.8+
- **Styling**: Tailwind CSS 4.0+, Biome for formatting/linting
- **Database**: Neon PostgreSQL 16 with pgvector extension for vector search
- **AI/ML**: OpenAI Agents SDK, halfvec embeddings (1536 dimensions)
- **Authentication**: NextAuth.js v5 with GitHub OAuth
- **Testing**: Vitest 3.2+ with V8 coverage provider
- **Package Manager**: pnpm 10.11.1 (strictly enforced)

### Directory Structure

```text
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── features/          # Feature-specific components
│   └── ui/                # Reusable UI components
├── lib/                   # Utilities and configurations
│   ├── auth/              # Authentication system
│   ├── db/                # Database configuration
│   ├── github/            # GitHub API client
│   ├── security/          # Security utilities
│   └── validation/        # Zod schemas and validation
├── context/               # React context providers
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions

tests/
├── auth/                  # Authentication tests
├── github/                # GitHub client tests
├── database/              # Database tests
├── integration/           # End-to-end tests
└── helpers/               # Test utilities
```

## Multi-Provider OAuth Implementation

### Core Files Modified

#### 1. Authentication Configuration (`/src/lib/auth/config.ts`)

- **Added Google Provider** with PKCE support and offline access
- **Enhanced Account Linking Logic** with comprehensive email conflict resolution
- **Multi-Provider Token Refresh** with provider-specific implementations
- **Advanced Security Features** including audit logging and session management
- **Error Handling** for all account linking scenarios

#### 2. Environment Validation (`/src/lib/validation/env.ts`)

- **Added Google OAuth Variables**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- **Enhanced Validation Logic** for multi-provider configurations
- **Backwards Compatibility** with GitHub-only setups
- **Production Security Checks** for OAuth credentials

#### 3. Type Definitions (`/src/types/auth.ts`)

- **Extended Session Interface** with `connectedProviders` and `primaryProvider`
- **Updated User Interface** with `display_name` and `username` fields
- **Enhanced OAuth Account Types** with `is_primary` and `linked_at`
- **Added Account Linking Types** for email verification workflows

### Key Features Implemented

#### 1. Comprehensive Account Linking Scenarios

##### **New User Signup**

- Creates new user with the OAuth provider as primary
- Extracts provider-specific user data (name, username, etc.)
- Sets up initial OAuth account with `is_primary = true`

##### **Existing User + Same Email**

- Automatically links new provider to existing user account
- Maintains existing user data while adding new provider
- Updates user profile with additional provider information
- Sets new provider as `is_primary = false`

##### **Provider Already Linked**

- Updates existing OAuth tokens for the provider
- Refreshes access tokens and expiration times
- Maintains account linking without duplication

##### **Email Conflict Resolution**

- Prevents account hijacking while enabling legitimate linking
- Validates email ownership through provider verification
- Implements secure account merging strategies

#### 2. Provider-Specific Features

##### **GitHub Provider**

```typescript
GitHub({
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
  authorization: {
    params: {
      scope: "read:user user:email",
    },
  },
});
```

##### **Google Provider**

```typescript
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
});
```

#### 3. Enhanced Security Implementation

##### **Token Management**

- Provider-specific token refresh logic
- Secure token storage and rotation
- Proper expiration handling
- Refresh token validation

##### **Session Security**

- Enhanced session data with provider information
- Secure cookie configuration
- HTTP-only, SameSite, and secure flags
- Session token rotation

##### **Audit Logging**

- Comprehensive security event tracking
- OAuth account linking events
- Authentication success/failure logging
- Unusual activity detection

## Development Standards

### Package Management

**CRITICAL: Always use `pnpm` instead of `npm` for all package management**

- **Installation**: `pnpm install` for dependencies
- **Scripts**: `pnpm <script-name>` for all package.json scripts

### Code Quality Standards

- **Linting**: Biome with strict TypeScript rules
- **Type safety**: Strict TypeScript with Zod validation throughout
- **Testing**: Comprehensive Vitest coverage with meaningful test scenarios
- **Performance**: Database performance monitoring and vector index optimization

### TypeScript Configuration

- **Strict mode enabled** with comprehensive type checking
- **Path mapping**: Use `@/*` for src/ imports
- **Target**: ES2017 for broad compatibility
- **Additional strictness**: noUncheckedIndexedAccess, exactOptionalPropertyTypes

## Testing Strategy

### Test-Driven Development (TDD)

- Always develop using a TDD test-first approach with Vitest
- Write tests for new features/functionality before implementation
- Implement code to make tests pass until all requirements are met
- Ensure complete feature implementation matching task requirements

### Testing Framework & Configuration

- **Framework**: Vitest 3.2+ with V8 coverage provider
- **Coverage targets**: 90% across all metrics through meaningful tests
- **Test organization**: Feature-based in tests/ directory
- **Global APIs**: Enabled for Jest-like syntax without imports

### Quality Standards

- **Functional Organization**: Group tests by business functionality
- **Realistic Scenarios**: Test real-world usage patterns
- **Modern Patterns**: Use MSW 2.x for HTTP mocking
- **Proper Isolation**: Comprehensive setup/teardown
- **Meaningful Coverage**: Achieve coverage through valuable tests

### Test File Organization

```text
Feature Tests Structure:
├── feature-core.test.ts        # Basic functionality
├── feature-edge-cases.test.ts  # Error handling, boundaries
├── feature-integration.test.ts # End-to-end flows
└── feature-comprehensive.test.ts # Full API testing
```

## Security Implementation

### Zero-Trust Architecture

The platform implements comprehensive security following zero-trust principles:

```typescript
// src/lib/security/zero-trust.ts
- Never-trust-always-verify implementation
- Multi-layered security validation
- Continuous security monitoring
```

### Security Modules

```typescript
// src/lib/security/
- crypto.ts: Web Crypto API with zero-trust principles
- edge-middleware.ts: Ultra-fast Vercel Edge security
- webhook-verification.ts: HMAC-SHA256 with replay protection
- csp-cors.ts: Dynamic CORS and nonce-based CSP
```

### Best Practices Implemented

1. **PKCE Support**: Enabled for all OAuth flows
2. **Secure Cookies**: HTTP-only, secure, SameSite settings
3. **Token Rotation**: Automatic refresh token rotation
4. **Audit Logging**: Comprehensive security event tracking
5. **Rate Limiting**: Protection against abuse
6. **Email Verification**: Required for Google provider
7. **Session Security**: Enhanced session management
8. **CSRF Protection**: Built-in NextAuth CSRF protection

## Database Design

### Core Schema

The database uses sophisticated schema with vector embeddings:

- **users**: User profiles with GitHub integration
- **repositories**: Repository metadata with health scoring
- **opportunities**: Contribution opportunities with AI analysis
- **user_preferences**: Personalized filtering settings
- **notifications**: Multi-channel notification system
- **user_repository_interactions**: User engagement tracking

### Vector Search Features

- **halfvec(1536) embeddings** for semantic similarity
- **HNSW indexes** for efficient vector search
- **Hybrid search functions** combining text and vector search
- **Performance monitoring** with comprehensive metrics

### Environment Configuration

Database connections use branch-specific URLs:

- `DATABASE_URL` - Production/main branch
- `DATABASE_URL_DEV` - Development branch
- `DATABASE_URL_TEST` - Testing branch

## Performance Optimization

### Next.js Configuration

```javascript
// next.config.js
- Bundle Analyzer for visualizing bundle composition
- Webpack Memory Optimizations enabled
- CSS Optimization with built-in optimizations
- Tree Shaking with usedExports and sideEffects: false
- Module Imports configuration for icon libraries
```

### Memory Optimization

- **Dynamic Import Utilities** for lazy loading heavy dependencies
- **Optimized Middleware** with dynamic imports
- **Memory Monitoring Tools** for real-time analysis
- **Bundle Analysis** for identifying optimization opportunities

### Database Performance

- **Connection Pooling**: Built-in Neon serverless pooling
- **Vector Operations**: Efficient HNSW indexing
- **Query Optimization**: Performance monitoring and reporting
- **Caching Strategy**: Lightweight caching for common requests

## Deployment Process

### Environment Setup

```bash
# Required Variables
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
NEXTAUTH_SECRET=your_secure_secret_key
NEXTAUTH_URL=https://your-domain.com
DATABASE_URL=postgresql://user:pass@localhost:5432/database

# Optional Variables
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Deployment Checklist

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

### Monitoring and Maintenance

#### **Security Monitoring**

- Monitor security audit logs for unusual activity
- Track authentication success/failure rates
- Watch for account linking anomalies
- Monitor token refresh failures

#### **Performance Monitoring**

- Database query performance for user/account lookups
- OAuth provider response times
- Session management overhead
- Token refresh frequency

#### **Regular Maintenance**

- Review and rotate OAuth client secrets
- Update provider configurations as needed
- Monitor for security updates in NextAuth
- Review audit logs for security patterns

This implementation provides a production-ready, secure, and extensible foundation that follows
NextAuth.js v5 best practices and modern development standards.
