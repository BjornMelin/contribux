# Environment Setup Instructions - Contribux

This guide provides comprehensive instructions for setting up all environment variables in your `.env.local` file.

## Quick Start

1. Copy `.env.example` to `.env.local`
2. Follow the sections below to configure each service
3. Test your configuration with `pnpm db:test-connection`

## 🗄️ Database Configuration (Neon PostgreSQL)

**Your Neon project is already configured:** `soft-dew-27794389`

```bash
# Main branch (production)
DATABASE_URL="postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-calm-pine-a8q96mx7-pooler.eastus2.azure.neon.tech/neondb?sslmode=require"

# Development branch  
DATABASE_URL_DEV="postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-steep-unit-a8roi9e8-pooler.eastus2.azure.neon.tech/neondb?sslmode=require"

# Testing branch
DATABASE_URL_TEST="postgresql://neondb_owner:npg_G8poqg2YQRAz@ep-hidden-union-a8b34lc5-pooler.eastus2.azure.neon.tech/neondb?sslmode=require"

# Database configuration
DB_PROJECT_ID="soft-dew-27794389"
DB_MAIN_BRANCH="br-summer-art-a864udht"
DB_DEV_BRANCH="br-cold-scene-a86p5ixr"
DB_TEST_BRANCH="br-fancy-pine-a8imumhr"

# Neon API key - Get from https://console.neon.tech/account/keys
NEON_API_KEY="your-neon-api-key-here"
```

## 🔐 Authentication Configuration

### NextAuth.js Configuration
```bash
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-nextauth-secret-here-minimum-32-characters"
NEXTAUTH_URL="http://localhost:3000"
```

### GitHub OAuth Setup
1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

```bash
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### GitHub Webhook Setup
1. Go to your GitHub repository settings
2. Add webhook with URL: `http://localhost:3000/api/webhooks/github`
3. Generate secret: `openssl rand -hex 32`

```bash
GITHUB_WEBHOOK_SECRET="your-github-webhook-secret-here"
```

### Google OAuth Setup
1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

```bash
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## 🛡️ Security Configuration

### Encryption Keys
```bash
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY="your-64-character-hex-encoded-encryption-key-here"

# Generate with: openssl rand -base64 32
CSP_NONCE_SECRET="your-csp-nonce-secret-32-chars-minimum"
```

### WebAuthn Configuration
```bash
NEXT_PUBLIC_APP_NAME="Contribux"
NEXT_PUBLIC_RP_ID="localhost"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
WEBAUTHN_RP_NAME="Contribux"
```

## ☁️ Redis Configuration (Upstash)

1. Sign up at https://console.upstash.com/redis
2. Create a new Redis database
3. Copy the REST URL and token

```bash
UPSTASH_REDIS_REST_URL="https://your-redis-endpoint.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-redis-rest-token"
```

## 🤖 AI Configuration

### OpenAI Setup
1. Get API key from https://platform.openai.com/api-keys
2. Add to environment:

```bash
OPENAI_API_KEY="sk-your-openai-api-key-here"
```

## 📊 Monitoring & WebSocket

```bash
# WebSocket endpoint for real-time dashboard
NEXT_PUBLIC_WS_ENDPOINT="ws://localhost:8080/metrics"
```

## 🎛️ Feature Flags & Security Settings

```bash
# Basic features
ENABLE_WEBAUTHN=true
ENABLE_OAUTH=true
ENABLE_AUDIT_LOGS=true
ENABLE_RATE_LIMITING=true

# Advanced security features (portfolio showcase)
ENABLE_ADVANCED_SECURITY=false
ENABLE_SECURITY_DASHBOARD=false
ENABLE_DEVICE_FINGERPRINTING=false
ENABLE_DETAILED_AUDIT=false

# Security monitoring
ENABLE_SECURITY_AUDIT=true
ENABLE_MFA_MONITORING=true
ENABLE_PERFORMANCE_MONITORING=true

# Security headers
ENABLE_SECURITY_HEADERS=true
ENABLE_CORS_PROTECTION=true
```

## 🔒 Rate Limiting & CORS

```bash
CORS_ORIGINS="http://localhost:3000"
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900
```

## 📝 Logging & Environment

```bash
LOG_LEVEL=info
NODE_ENV=development
```

## ✅ Testing Your Configuration

### 1. Database Connection Test
```bash
pnpm db:test-connection
```

### 2. Health Check
```bash
curl http://localhost:3000/api/health
```

### 3. Authentication Test
```bash
# Start the dev server
pnpm dev

# Visit http://localhost:3000/auth/signin
# Try logging in with GitHub or Google
```

### 4. WebAuthn Test
```bash
# Visit http://localhost:3000/settings/security
# Try enrolling a WebAuthn device (needs HTTPS in production)
```

## 🛠️ Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run all tests
pnpm test

# Database health check
pnpm db:health

# Performance report
pnpm db:performance-report

# Vector search metrics
pnpm db:vector-metrics

# Code quality
pnpm lint && pnpm type-check
```

## 🔍 Troubleshooting

### Database Connection Issues
- Verify your DATABASE_URL is correct
- Check if your IP is allowlisted in Neon console
- Ensure SSL mode is enabled

### Authentication Issues
- Verify OAuth redirect URIs match exactly
- Check that all required secrets are set
- Ensure NEXTAUTH_URL matches your domain

### Redis Issues
- Verify Upstash credentials are correct
- Check if Redis instance is active
- The app will fall back to in-memory storage if Redis fails

### WebAuthn Issues
- WebAuthn requires HTTPS in production
- Use localhost for development
- Ensure RP_ID matches your domain

## 📋 Required vs Optional Variables

### ✅ Required for Basic Functionality
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
- `ENCRYPTION_KEY`

### 🔧 Optional but Recommended
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`

### 🎯 Portfolio/Demo Features
- `ENABLE_ADVANCED_SECURITY=true`
- `ENABLE_SECURITY_DASHBOARD=true`
- WebAuthn configuration
- Real-time monitoring endpoints

---

**✨ Your Neon database is already properly configured and tested!**
- Project: `contribux-db` (soft-dew-27794389)
- Branches: main, development, testing
- Connection: ✅ Verified working
- Tables: 14 tables in testing branch