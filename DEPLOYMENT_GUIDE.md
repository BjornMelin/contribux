# Contribux Deployment Guide

**Production-Ready Deployment | Enterprise Infrastructure Documentation**

---

## 📋 Table of Contents

- [Deployment Overview](#-deployment-overview)
- [Infrastructure Requirements](#-infrastructure-requirements)
- [Environment Setup](#-environment-setup)
- [Database Configuration](#-database-configuration)
- [Application Deployment](#-application-deployment)
- [Security Configuration](#-security-configuration)
- [Monitoring & Observability](#-monitoring--observability)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Performance Optimization](#-performance-optimization)
- [Disaster Recovery](#-disaster-recovery)

---

## 🚀 Deployment Overview

Contribux is designed for **serverless-first deployment** with zero-maintenance operational requirements, demonstrating modern DevOps practices and infrastructure automation expertise.

### **Deployment Architecture**

```mermaid
graph TB
    subgraph "🌐 Global CDN Layer"
        CDN[Vercel CDN]
        Edge[Edge Functions]
        Cache[Edge Caching]
        SSL[SSL Termination]
    end
    
    subgraph "⚡ Compute Layer"
        Functions[Serverless Functions]
        API[API Routes]
        Middleware[Auth Middleware]
        Background[Background Jobs]
    end
    
    subgraph "💾 Data Layer"
        Primary[Primary Database<br/>Neon PostgreSQL]
        ReadReplica[Read Replica<br/>Auto-scaling]
        Redis[Redis Cache<br/>Upstash]
        Storage[Blob Storage<br/>Vercel]
    end
    
    subgraph "🔗 External Services"
        GitHub[GitHub API]
        OpenAI[OpenAI Agents]
        Email[Resend Email]
        SMS[Telnyx SMS]
    end
    
    subgraph "📊 Monitoring Stack"
        Metrics[Performance Metrics]
        Logs[Structured Logging]
        Alerts[Smart Alerting]
        Analytics[User Analytics]
    end
    
    CDN --> Functions
    Edge --> API
    Cache --> Middleware
    SSL --> Background
    
    Functions --> Primary
    API --> ReadReplica
    Middleware --> Redis
    Background --> Storage
    
    Functions --> GitHub
    API --> OpenAI
    Background --> Email
    Background --> SMS
    
    Functions --> Metrics
    API --> Logs
    Middleware --> Alerts
    Background --> Analytics
    
    style CDN fill:#0EA5E9,color:#fff
    style Functions fill:#10B981,color:#fff
    style Primary fill:#F59E0B,color:#fff
    style GitHub fill:#7C3AED,color:#fff
    style Metrics fill:#EF4444,color:#fff
```

### **Deployment Environments**

| Environment | Purpose | URL | Auto-Deploy | Branch |
|-------------|---------|-----|-------------|--------|
| **Development** | Local development | localhost:3000 | ❌ | - |
| **Preview** | Feature testing | `*.vercel.app` | ✅ | feature/* |
| **Staging** | Pre-production | staging.contribux.dev | ✅ | develop |
| **Production** | Live application | contribux.dev | ✅ | main |

---

## 🏗️ Infrastructure Requirements

### **Core Infrastructure Components**

```mermaid
graph LR
    subgraph "☁️ Vercel Platform"
        Hosting[Serverless Hosting]
        Functions[Edge Functions]
        Analytics[Web Analytics]
        Domains[Custom Domains]
    end
    
    subgraph "💾 Neon Database"
        PostgreSQL[PostgreSQL 16]
        Branching[Database Branching]
        Scaling[Auto-scaling]
        Backup[Automated Backups]
    end
    
    subgraph "🔄 Upstash Services"
        Redis[Redis Cache]
        QStash[Message Queue]
        Vector[Vector Database]
        Metrics[Performance Metrics]
    end
    
    subgraph "🔐 Security Services"
        Auth[NextAuth.js]
        Encryption[Data Encryption]
        Secrets[Secret Management]
        Monitoring[Security Monitoring]
    end
    
    Hosting --> PostgreSQL
    Functions --> Redis
    Analytics --> QStash
    Domains --> Vector
    
    PostgreSQL --> Auth
    Branching --> Encryption
    Scaling --> Secrets
    Backup --> Monitoring
    
    style Hosting fill:#0EA5E9,color:#fff
    style PostgreSQL fill:#F59E0B,color:#fff
    style Redis fill:#10B981,color:#fff
    style Auth fill:#7C3AED,color:#fff
```

### **Resource Requirements**

| Component | Specification | Scaling | Cost (Monthly) |
|-----------|---------------|---------|----------------|
| **Vercel Hosting** | Pro Plan | Automatic | $20 |
| **Neon Database** | Scale Plan | Auto-scale | $69 |
| **Upstash Redis** | Pay-per-use | On-demand | $15 |
| **External APIs** | Usage-based | Rate-limited | $25 |
| **Monitoring** | Basic tier | Real-time | $10 |
| **Total** | - | - | **$139/month** |

---

## ⚙️ Environment Setup

### **Environment Variables Configuration**

```bash
# Core Application Settings
NODE_ENV=production
VERCEL_ENV=production
NEXT_PUBLIC_APP_URL=https://contribux.dev

# Database Configuration
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
DATABASE_URL_DEV=postgresql://user:password@host/db_dev?sslmode=require
DATABASE_URL_TEST=postgresql://user:password@host/db_test?sslmode=require

# Authentication Configuration
NEXTAUTH_URL=https://contribux.dev
NEXTAUTH_SECRET=your-production-secret-key
JWT_SECRET=your-jwt-secret-key

# OAuth Provider Configuration
GITHUB_CLIENT_ID=your-github-oauth-app-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-secret

# AI Service Configuration
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_ORGANIZATION_ID=org-your-openai-org-id

# External Service Configuration
RESEND_API_KEY=re_your-resend-api-key
TELNYX_API_KEY=KEY_your-telnyx-api-key
UPSTASH_REDIS_REST_URL=https://your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token
UPSTASH_QSTASH_URL=https://qstash.upstash.io
UPSTASH_QSTASH_TOKEN=your-qstash-token

# Security Configuration
ENCRYPTION_KEY=your-256-bit-encryption-key
WEBHOOK_SECRET=your-webhook-secret
CORS_ORIGIN=https://contribux.dev

# Feature Flags
ENABLE_AI_FEATURES=true
ENABLE_NOTIFICATIONS=true
ENABLE_ANALYTICS=true
ENABLE_DEBUG_MODE=false

# Performance Configuration
CACHE_TTL=3600
MAX_CONCURRENT_REQUESTS=1000
REQUEST_TIMEOUT=30000

# Monitoring Configuration
VERCEL_ANALYTICS_ID=your-analytics-id
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### **Environment Validation**

```typescript
// Environment Configuration Validation
import { z } from 'zod'

const envSchema = z.object({
  // Core Settings
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DEV: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),
  
  // Authentication
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  
  // OAuth
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  
  // AI Services
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  OPENAI_ORGANIZATION_ID: z.string().startsWith('org-'),
  
  // External Services
  RESEND_API_KEY: z.string().startsWith('re_'),
  TELNYX_API_KEY: z.string().startsWith('KEY'),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  
  // Security
  ENCRYPTION_KEY: z.string().min(64), // 256-bit key in hex
  WEBHOOK_SECRET: z.string().min(32),
  
  // Feature Flags
  ENABLE_AI_FEATURES: z.string().transform(val => val === 'true'),
  ENABLE_NOTIFICATIONS: z.string().transform(val => val === 'true'),
  ENABLE_ANALYTICS: z.string().transform(val => val === 'true'),
  
  // Performance
  CACHE_TTL: z.string().transform(val => parseInt(val, 10)),
  MAX_CONCURRENT_REQUESTS: z.string().transform(val => parseInt(val, 10)),
  REQUEST_TIMEOUT: z.string().transform(val => parseInt(val, 10))
})

export const validateEnvironment = () => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    console.error('Environment validation failed:', error)
    process.exit(1)
  }
}

// Runtime validation
export const env = validateEnvironment()
```

---

## 💾 Database Configuration

### **Neon Database Setup**

```sql
-- Production Database Configuration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create optimized indexes for production workloads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_health_score 
ON repositories (health_score DESC) 
WHERE health_score IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_repositories_embedding_hnsw 
ON repositories USING hnsw (description_embedding vector_cosine_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_opportunities_composite 
ON opportunities (complexity_score, impact_score, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_github_username 
ON users (github_username);

-- Create materialized views for analytics
CREATE MATERIALIZED VIEW user_contribution_stats AS
SELECT 
    user_id,
    COUNT(*) as total_contributions,
    AVG(actual_impact_score) as avg_impact_score,
    COUNT(*) FILTER (WHERE was_merged = true) as successful_contributions,
    AVG(actual_hours) as avg_hours_spent
FROM contribution_outcomes
WHERE completed_at IS NOT NULL
GROUP BY user_id;

CREATE UNIQUE INDEX ON user_contribution_stats (user_id);

-- Setup automated refresh for materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_contribution_stats;
    -- Add other materialized views here
END;
$$ LANGUAGE plpgsql;

-- Schedule materialized view refresh (requires pg_cron extension)
-- SELECT cron.schedule('refresh-mv', '0 */6 * * *', 'SELECT refresh_materialized_views();');
```

### **Database Connection Pooling**

```typescript
// Production Database Configuration
import { Pool } from '@neondatabase/serverless'

const createDatabasePool = () => {
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: {
      require: true,
      rejectUnauthorized: true
    },
    
    // Connection pool configuration
    max: 20, // Maximum number of clients in the pool
    min: 2,  // Minimum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
    
    // Production optimizations
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    
    // Statement timeout
    statement_timeout: 30000, // 30 seconds
    query_timeout: 25000,     // 25 seconds
    
    // Connection validation
    allowExitOnIdle: true,
    
    // Logging for production monitoring
    log: (messages) => {
      console.log('Database:', messages)
    }
  })
}

export const db = createDatabasePool()

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const client = await db.connect()
    const result = await client.query('SELECT 1 as health_check')
    client.release()
    return result.rows[0].health_check === 1
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}
```

---

## 🚀 Application Deployment

### **Vercel Deployment Configuration**

```json
{
  "version": 2,
  "name": "contribux",
  "alias": ["contribux.dev", "www.contribux.dev"],
  "regions": ["iad1", "sfo1", "lhr1"],
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "functions": {
    "app/api/**/*.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "geolocation=(), microphone=(), camera=()"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/docs",
      "destination": "https://docs.contribux.dev",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "build": {
    "env": {
      "NODE_OPTIONS": "--max-old-space-size=4096"
    }
  }
}
```

### **Next.js Production Configuration**

```javascript
// next.config.js - Production Optimizations
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js'
        }
      }
    }
  },
  
  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
    styledComponents: true
  },
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    domains: [
      'github.com',
      'avatars.githubusercontent.com',
      'opengraph.githubassets.com'
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' *.vercel.app *.vercel-analytics.com",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' *.vercel.app *.openai.com *.github.com vitals.vercel-insights.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          }
        ]
      }
    ]
  },
  
  // Redirects and rewrites
  async redirects() {
    return [
      {
        source: '/github',
        destination: 'https://github.com/BjornMelin/contribux',
        permanent: true
      }
    ]
  },
  
  // Bundle analyzer (development only)
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config) => {
      config.plugins.push(
        new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
          analyzerMode: 'static',
          openAnalyzer: false
        })
      )
      return config
    }
  }),
  
  // Production bundle optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Optimize bundle splitting
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all'
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true
          }
        }
      }
    }
    
    return config
  }
}

module.exports = nextConfig
```

### **Build and Deployment Scripts**

```bash
#!/bin/bash
# deploy.sh - Production Deployment Script

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Pre-deployment checks
echo "📋 Running pre-deployment checks..."

# Check environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

if [ -z "$NEXTAUTH_SECRET" ]; then
  echo "❌ NEXTAUTH_SECRET not set"
  exit 1
fi

echo "✅ Environment variables validated"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile --prod

# Run type checking
echo "🔍 Type checking..."
pnpm type-check

# Run tests
echo "🧪 Running tests..."
pnpm test:ci

# Run security checks
echo "🔒 Running security checks..."
pnpm audit --audit-level moderate

# Build application
echo "🏗️ Building application..."
NODE_ENV=production pnpm build

# Database migrations (if needed)
echo "💾 Running database migrations..."
pnpm db:migrate

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel deploy --prod --confirm

# Post-deployment verification
echo "✅ Running post-deployment checks..."

# Health check
curl -f https://contribux.dev/api/health || {
  echo "❌ Health check failed"
  exit 1
}

# Database connectivity check
curl -f https://contribux.dev/api/health/database || {
  echo "❌ Database health check failed"
  exit 1
}

echo "🎉 Deployment completed successfully!"
```

---

## 🔐 Security Configuration

### **Production Security Setup**

```typescript
// Security Configuration for Production
import { headers } from 'next/headers'
import { ratelimit } from '@/lib/rate-limit'

export async function SecurityMiddleware(request: Request) {
  const headersList = headers()
  const ip = headersList.get('x-forwarded-for') || 'unknown'
  const userAgent = headersList.get('user-agent') || 'unknown'
  
  // Rate limiting
  const { success, limit, reset, remaining } = await ratelimit.limit(ip)
  
  if (!success) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
        'Retry-After': Math.round((reset - Date.now()) / 1000).toString()
      }
    })
  }
  
  // Security headers
  const securityHeaders = {
    'X-DNS-Prefetch-Control': 'off',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' *.vercel.app",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' *.openai.com *.github.com",
      "frame-ancestors 'none'"
    ].join('; ')
  }
  
  // Log security events
  console.log(`Security check passed for ${ip} - ${userAgent}`)
  
  return NextResponse.next({
    headers: securityHeaders
  })
}
```

### **SSL/TLS Configuration**

```nginx
# NGINX Configuration (if using custom proxy)
server {
    listen 443 ssl http2;
    server_name contribux.dev www.contribux.dev;

    # SSL Configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy to Vercel
    location / {
        proxy_pass https://contribux.vercel.app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📊 Monitoring & Observability

### **Production Monitoring Stack**

```mermaid
graph TB
    subgraph "📊 Data Collection"
        App[Application Metrics]
        System[System Metrics]
        Database[Database Metrics]
        External[External API Metrics]
    end
    
    subgraph "🔄 Processing & Storage"
        Aggregation[Metric Aggregation]
        Storage[Time Series Storage]
        Alerting[Alert Processing]
        Analytics[Analytics Processing]
    end
    
    subgraph "📈 Visualization"
        Dashboard[Real-time Dashboard]
        Charts[Performance Charts]
        Reports[Automated Reports]
        Mobile[Mobile Alerts]
    end
    
    subgraph "🚨 Alerting"
        Rules[Alert Rules]
        Channels[Notification Channels]
        Escalation[Escalation Policies]
        OnCall[On-call Management]
    end
    
    App --> Aggregation
    System --> Storage
    Database --> Alerting
    External --> Analytics
    
    Aggregation --> Dashboard
    Storage --> Charts
    Alerting --> Reports
    Analytics --> Mobile
    
    Dashboard --> Rules
    Charts --> Channels
    Reports --> Escalation
    Mobile --> OnCall
    
    style App fill:#10B981,color:#fff
    style Dashboard fill:#7C3AED,color:#fff
    style Rules fill:#EF4444,color:#fff
```

### **Application Performance Monitoring**

```typescript
// Production Monitoring Configuration
import { metrics } from '@/lib/monitoring'

class ProductionMonitoring {
  async trackRequest(request: Request, response: Response): Promise<void> {
    const startTime = Date.now()
    const url = new URL(request.url)
    
    // Track response metrics
    const duration = Date.now() - startTime
    const statusCode = response.status
    
    await metrics.record('http_request_duration', duration, {
      method: request.method,
      path: url.pathname,
      status: statusCode.toString()
    })
    
    await metrics.increment('http_requests_total', {
      method: request.method,
      path: url.pathname,
      status: statusCode.toString()
    })
    
    // Track errors
    if (statusCode >= 400) {
      await metrics.increment('http_errors_total', {
        method: request.method,
        path: url.pathname,
        status: statusCode.toString()
      })
    }
    
    // Track slow requests
    if (duration > 1000) {
      await metrics.increment('http_slow_requests_total', {
        method: request.method,
        path: url.pathname,
        duration: duration.toString()
      })
    }
  }
  
  async trackDatabaseQuery(query: string, duration: number): Promise<void> {
    await metrics.record('database_query_duration', duration, {
      query_type: this.getQueryType(query)
    })
    
    if (duration > 100) {
      await metrics.increment('database_slow_queries_total', {
        query_type: this.getQueryType(query)
      })
    }
  }
  
  async trackAIRequest(provider: string, model: string, tokens: number): Promise<void> {
    await metrics.increment('ai_requests_total', {
      provider,
      model
    })
    
    await metrics.record('ai_tokens_used', tokens, {
      provider,
      model
    })
  }
}
```

### **Health Check Endpoints**

```typescript
// Comprehensive Health Checks
export async function GET() {
  const healthChecks = await Promise.allSettled([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkExternalAPIs(),
    checkSystemResources()
  ])
  
  const results = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: healthChecks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      redis: healthChecks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      external_apis: healthChecks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      system: healthChecks[3].status === 'fulfilled' ? 'healthy' : 'unhealthy'
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
  }
  
  const isHealthy = Object.values(results.checks).every(status => status === 'healthy')
  
  if (!isHealthy) {
    results.status = 'unhealthy'
  }
  
  return Response.json(results, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  })
}

async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await db.connect()
    await client.query('SELECT 1')
    client.release()
    return true
  } catch {
    return false
  }
}

async function checkExternalAPIs(): Promise<boolean> {
  try {
    const checks = await Promise.allSettled([
      fetch('https://api.github.com/rate_limit'),
      fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      })
    ])
    
    return checks.every(check => check.status === 'fulfilled')
  } catch {
    return false
  }
}
```

---

## 🔄 CI/CD Pipeline

### **GitHub Actions Workflow**

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  lint-and-typecheck:
    name: Lint and Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run ESLint
        run: pnpm lint
      
      - name: Run Type Check
        run: pnpm type-check

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run Unit Tests
        run: pnpm test:ci
        env:
          DATABASE_URL_TEST: ${{ secrets.DATABASE_URL_TEST }}
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Security Audit
        run: pnpm audit --audit-level moderate
      
      - name: Run Semgrep
        uses: semgrep/semgrep-action@v1
        with:
          config: auto

  build-and-deploy:
    name: Build and Deploy
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
      
      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Build Project Artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy Project Artifacts to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}

  post-deploy-tests:
    name: Post-Deployment Tests
    runs-on: ubuntu-latest
    needs: build-and-deploy
    steps:
      - uses: actions/checkout@v4
      
      - name: Wait for deployment
        run: sleep 60
      
      - name: Run Health Check
        run: |
          curl -f https://contribux.dev/api/health || exit 1
      
      - name: Run E2E Tests
        run: pnpm test:e2e:ci
        env:
          BASE_URL: https://contribux.dev

  notify:
    name: Notify Deployment
    runs-on: ubuntu-latest
    needs: post-deploy-tests
    if: always()
    steps:
      - name: Notify Success
        if: success()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
          -H 'Content-type: application/json' \
          --data '{"text":"✅ Production deployment successful!"}'
      
      - name: Notify Failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
          -H 'Content-type: application/json' \
          --data '{"text":"❌ Production deployment failed!"}'
```

---

## ⚡ Performance Optimization

### **Production Performance Configuration**

```typescript
// Performance Optimization Configuration
export const performanceConfig = {
  // Caching strategies
  caching: {
    redis: {
      defaultTTL: 3600, // 1 hour
      longTTL: 86400,   // 24 hours
      shortTTL: 300     // 5 minutes
    },
    
    nextjs: {
      revalidate: 3600, // ISR revalidation
      swr: {
        refreshInterval: 30000, // 30 seconds
        dedupingInterval: 2000  // 2 seconds
      }
    }
  },
  
  // Database optimization
  database: {
    connectionPool: {
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000
    },
    
    queryTimeout: 25000,
    statementTimeout: 30000
  },
  
  // API optimization
  api: {
    timeout: 30000,
    retries: 3,
    backoffMultiplier: 2,
    maxConcurrency: 100
  },
  
  // Bundle optimization
  bundle: {
    splitChunks: true,
    compression: 'gzip',
    minification: true,
    treeShaking: true
  }
}

// Performance monitoring
export class PerformanceMonitor {
  static async measureDatabaseQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now()
    
    try {
      const result = await queryFn()
      const duration = performance.now() - start
      
      // Log slow queries
      if (duration > 100) {
        console.warn(`Slow query detected: ${queryName} took ${duration}ms`)
      }
      
      // Record metrics
      await metrics.record('database_query_duration', duration, {
        query: queryName
      })
      
      return result
    } catch (error) {
      const duration = performance.now() - start
      
      // Record failed queries
      await metrics.increment('database_query_errors', {
        query: queryName,
        error: error.message
      })
      
      throw error
    }
  }
  
  static async measureAPICall<T>(
    apiName: string,
    apiFn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now()
    
    try {
      const result = await apiFn()
      const duration = performance.now() - start
      
      await metrics.record('api_call_duration', duration, {
        api: apiName
      })
      
      return result
    } catch (error) {
      await metrics.increment('api_call_errors', {
        api: apiName,
        error: error.message
      })
      
      throw error
    }
  }
}
```

---

## 🔄 Disaster Recovery

### **Backup and Recovery Strategy**

```mermaid
graph TB
    subgraph "💾 Backup Sources"
        Database[Neon Database]
        Files[Application Files]
        Config[Configuration]
        Secrets[Secrets & Keys]
    end
    
    subgraph "🔄 Backup Process"
        Automated[Automated Backups]
        Manual[Manual Snapshots]
        Continuous[Continuous Replication]
        Testing[Backup Testing]
    end
    
    subgraph "☁️ Backup Storage"
        Primary[Primary Storage<br/>Neon Built-in]
        Secondary[Secondary Storage<br/>AWS S3]
        Archive[Archive Storage<br/>Glacier]
        Offsite[Offsite Backup]
    end
    
    subgraph "🚨 Recovery Procedures"
        RTO[Recovery Time Objective<br/>< 1 hour]
        RPO[Recovery Point Objective<br/>< 15 minutes]
        Validation[Recovery Validation]
        Documentation[Recovery Documentation]
    end
    
    Database --> Automated
    Files --> Manual
    Config --> Continuous
    Secrets --> Testing
    
    Automated --> Primary
    Manual --> Secondary
    Continuous --> Archive
    Testing --> Offsite
    
    Primary --> RTO
    Secondary --> RPO
    Archive --> Validation
    Offsite --> Documentation
    
    style Database fill:#F59E0B,color:#fff
    style Automated fill:#10B981,color:#fff
    style Primary fill:#7C3AED,color:#fff
    style RTO fill:#EF4444,color:#fff
```

### **Recovery Procedures**

```bash
#!/bin/bash
# disaster-recovery.sh - Disaster Recovery Procedures

set -e

echo "🚨 Starting disaster recovery procedure..."

# Check recovery type
RECOVERY_TYPE=${1:-"full"}
BACKUP_TIMESTAMP=${2:-"latest"}

case $RECOVERY_TYPE in
  "database")
    echo "💾 Recovering database from backup..."
    recover_database $BACKUP_TIMESTAMP
    ;;
  "application")
    echo "⚡ Recovering application from backup..."
    recover_application $BACKUP_TIMESTAMP
    ;;
  "full")
    echo "🔄 Performing full system recovery..."
    recover_database $BACKUP_TIMESTAMP
    recover_application $BACKUP_TIMESTAMP
    ;;
  *)
    echo "❌ Invalid recovery type: $RECOVERY_TYPE"
    exit 1
    ;;
esac

recover_database() {
  local timestamp=$1
  
  echo "📋 Creating new Neon branch for recovery..."
  neon branches create --name "recovery-$(date +%Y%m%d-%H%M%S)"
  
  echo "💾 Restoring database from point-in-time backup..."
  neon branches restore --timestamp "$timestamp"
  
  echo "🔍 Validating database integrity..."
  pnpm db:validate
  
  echo "✅ Database recovery completed"
}

recover_application() {
  echo "🚀 Redeploying application from git..."
  vercel deploy --prod --force
  
  echo "🔍 Running post-deployment health checks..."
  curl -f https://contribux.dev/api/health || {
    echo "❌ Health check failed"
    exit 1
  }
  
  echo "✅ Application recovery completed"
}

echo "🎉 Disaster recovery completed successfully!"
```

---

## 📋 Deployment Checklist

### **Pre-Deployment Checklist**

- [ ] **Environment Variables**
  - [ ] All required environment variables configured
  - [ ] Secrets properly encrypted and stored
  - [ ] API keys validated and tested
  - [ ] Database connection strings verified

- [ ] **Security Checks**
  - [ ] Security headers configured
  - [ ] SSL/TLS certificates valid
  - [ ] Authentication system tested
  - [ ] Rate limiting configured

- [ ] **Performance Validation**
  - [ ] Bundle size optimized
  - [ ] Database queries optimized
  - [ ] CDN configuration verified
  - [ ] Caching strategies implemented

- [ ] **Quality Assurance**
  - [ ] All tests passing
  - [ ] Code coverage > 90%
  - [ ] Type checking passed
  - [ ] Security audit completed

### **Post-Deployment Checklist**

- [ ] **Health Checks**
  - [ ] Application health endpoint responding
  - [ ] Database connectivity verified
  - [ ] External API integrations working
  - [ ] Error monitoring active

- [ ] **Performance Monitoring**
  - [ ] Response times within SLA
  - [ ] Error rates below threshold
  - [ ] Resource utilization normal
  - [ ] Alerts configured and working

- [ ] **User Acceptance**
  - [ ] Core user flows tested
  - [ ] Authentication working
  - [ ] Search functionality operational
  - [ ] AI features responding

---

## 📞 Support & Troubleshooting

### **Common Deployment Issues**

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Build Failures** | Vercel build fails | Check environment variables, dependencies |
| **Database Connection** | 500 errors on API calls | Verify DATABASE_URL, check connection limits |
| **Authentication Issues** | Login redirects fail | Verify NEXTAUTH_URL, OAuth configuration |
| **Performance Degradation** | Slow response times | Check database queries, cache configuration |
| **External API Failures** | AI features not working | Verify API keys, check rate limits |

### **Monitoring and Alerts**

- **Uptime Monitoring**: 99.9% availability target
- **Response Time**: < 2s for 95th percentile
- **Error Rate**: < 0.1% for critical endpoints
- **Database Performance**: < 100ms query response time
- **External API Health**: Real-time status monitoring

---

**🚀 This deployment guide demonstrates enterprise-grade DevOps practices, infrastructure automation, and production readiness suitable for senior platform engineering roles.**

---

*Last Updated: July 2, 2025 | Deployment Version: 2.0 | Next Review: October 2025*