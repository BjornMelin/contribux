# Technology Stack and Decisions

## Overview

contribux employs a modern, **serverless-first** technology stack optimized for AI-native applications with zero maintenance overhead. Every technology choice is made with 2025 best practices in mind, prioritizing developer experience, performance, and cost efficiency.

## Stack Architecture

```mermaid
graph TB
    subgraph "🎨 Frontend Technologies"
        A[Next.js 15] --> B[React 19]
        B --> C[TypeScript 5.7+]
        C --> D[Tailwind CSS 4.0]
        D --> E[shadcn/ui 2.0]
    end

    subgraph "🔧 Development Tools"
        F[pnpm 10.11.1] --> G[Biome]
        G --> H[Vitest 3.2+]
        H --> I[Playwright 2.0]
    end

    subgraph "🚀 Backend Technologies"
        J[Vercel Edge Functions] --> K[tRPC v11]
        K --> L[Neon PostgreSQL 16]
        L --> M[pgvector 0.7]
    end

    subgraph "🤖 AI & Intelligence"
        N[OpenAI Agents SDK v1.0] --> O[GPT-4o-mini-2025-06]
        O --> P[text-embedding-ada-002]
    end

    subgraph "📡 External Services"
        Q[GitHub API v4] --> R[Resend v4]
        R --> S[Upstash QStash v3]
        S --> T[Vercel Analytics]
    end

    style A fill:#7C3AED,color:#fff
    style N fill:#10B981,color:#fff
    style J fill:#F59E0B,color:#fff
    style Q fill:#EF4444,color:#fff
```

## Frontend Stack

### Next.js 15.0+

**Purpose**: React framework with App Router and Server Components
**Rationale**:

- **App Router**: File-based routing with enhanced layouts and parallel routes
- **React Server Components**: Reduced bundle size and improved performance
- **Streaming SSR**: Better perceived performance with incremental loading
- **Edge Runtime**: Global distribution with sub-50ms latency
- **Built-in Optimizations**: Image optimization, font optimization, and automatic code splitting

**Configuration**:

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@neondatabase/serverless"],
    ppr: true, // Partial Prerendering
  },
  images: {
    formats: ["image/webp", "image/avif"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ],
    },
  ],
};
```

### React 19.0+

**Purpose**: UI library with concurrent features
**Rationale**:

- **Server Components**: Native server-side rendering without hydration overhead
- **Concurrent Features**: Improved user experience with time slicing
- **Automatic Batching**: Better performance with fewer re-renders
- **Suspense Improvements**: Better loading states and error boundaries

### TypeScript 5.7+

**Purpose**: Type safety and developer experience
**Rationale**:

- **Strict Mode**: Catch errors at compile time
- **Path Mapping**: Clean imports with `@/*` aliases
- **Template Literal Types**: Better string type safety
- **Satisfies Operator**: Better type inference

**Configuration**:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    },
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Tailwind CSS 4.0+

**Purpose**: Utility-first styling framework
**Rationale**:

- **CSS-First Configuration**: Simpler setup with CSS custom properties
- **Performance**: Smaller CSS bundles with better purging
- **Design System**: Consistent spacing, colors, and typography
- **Developer Experience**: IntelliSense support and rapid prototyping

**Configuration**:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "hsl(var(--primary))",
        secondary: "hsl(var(--secondary))",
        accent: "hsl(var(--accent))",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["Source Code Pro", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
```

### shadcn/ui 2.0+

**Purpose**: Component library with accessibility
**Rationale**:

- **Radix UI Primitives**: Accessible by default
- **Customizable**: Copy-paste components for full control
- **TypeScript Native**: Excellent type support
- **Design System**: Consistent component API

## Backend Stack

### Vercel Edge Functions

**Purpose**: Serverless API endpoints with global distribution
**Rationale**:

- **Edge Runtime**: Sub-50ms latency worldwide
- **Automatic Scaling**: Zero to thousands of requests instantly
- **Cost Efficiency**: Pay only for actual usage
- **Built-in Monitoring**: Request logs and performance metrics

### tRPC v11.0+

**Purpose**: End-to-end type safety for APIs
**Rationale**:

- **Type Safety**: Shared types between client and server
- **Developer Experience**: Auto-completion and error detection
- **Performance**: Optimized data fetching with deduplication
- **React Integration**: Native React Query integration

**Setup**:

```typescript
// src/lib/trpc/router.ts
import { z } from "zod";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  getOpportunities: publicProcedure
    .input(
      z.object({
        type: z.enum(["documentation", "bug", "feature"]).optional(),
        minScore: z.number().min(0).max(10).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      // Type-safe query implementation
    }),
});

export type AppRouter = typeof appRouter;
```

### Neon PostgreSQL 16+

**Purpose**: Serverless PostgreSQL with modern features
**Rationale**:

- **Serverless**: Automatic scaling and hibernation
- **Branching**: Database branches for development/testing
- **Modern PostgreSQL**: Latest features and performance improvements
- **Cost Efficiency**: Pay only for compute and storage used

**Key Features**:

- **Connection Pooling**: Built-in PgBouncer
- **Read Replicas**: Automatic read scaling
- **Point-in-Time Recovery**: Continuous backup
- **Extensions**: Full PostgreSQL extension support

### pgvector 0.7+

**Purpose**: Vector similarity search for AI features
**Rationale**:

- **Native PostgreSQL**: No additional vector database needed
- **HNSW Indexes**: Fast approximate nearest neighbor search
- **SQL Integration**: Use SQL for complex vector + text queries
- **Similarity Functions**: Cosine, L2, and inner product distance

**Configuration**:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector columns
ALTER TABLE repositories
ADD COLUMN description_embedding vector(1536);

-- Create HNSW index for fast similarity search
CREATE INDEX idx_repositories_embedding ON repositories
USING hnsw (description_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

## Development Tools

### pnpm 10.11.1

**Purpose**: Fast, disk space efficient package manager
**Rationale**:

- **Speed**: 2x faster than npm, faster than yarn
- **Disk Efficiency**: Symlinks to shared store
- **Strict**: Prevents phantom dependencies
- **Monorepo Support**: Workspace support out of the box

**Configuration**:

```yaml
# .npmrc
auto-install-peers=true
shamefully-hoist=false
strict-peer-dependencies=false
```

### Biome

**Purpose**: Fast linter and formatter for TypeScript
**Rationale**:

- **Performance**: 100x faster than ESLint + Prettier
- **Zero Configuration**: Works out of the box
- **Import Sorting**: Automatic import organization
- **TypeScript Native**: Built specifically for TypeScript

**Configuration**:

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "error",
        "useImportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "lineWidth": 100,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "organizeImports": {
    "enabled": true
  }
}
```

### Vitest 3.2+

**Purpose**: Fast unit and integration testing
**Rationale**:

- **Speed**: Native ESM support, faster than Jest
- **Vite Integration**: Shared configuration with build tools
- **TypeScript**: Native TypeScript support
- **Modern APIs**: Compatible with Jest APIs

**Configuration**:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### Playwright 2.0+

**Purpose**: End-to-end testing across browsers
**Rationale**:

- **Cross-Browser**: Chrome, Firefox, Safari, Edge
- **Component Testing**: Test React components in isolation
- **AI-Powered Selectors**: More resilient test selectors
- **Modern Web APIs**: Full support for modern web features

## AI and Intelligence Stack

### OpenAI Agents SDK v1.0+

**Purpose**: Multi-agent orchestration with TypeScript support
**Rationale**:

- **Type Safety**: Full TypeScript support for agent definitions
- **Observability**: Built-in tracing and debugging tools
- **Flexibility**: Support for multiple LLM providers
- **Production Ready**: Human-in-the-loop and guardrails

**Agent Definition**:

```typescript
// src/agents/analyzer.ts
import { Agent } from "@openai/agents-sdk";

export const analyzerAgent = new Agent({
  name: "ContribuxAnalyzer",
  model: "gpt-4o-mini-2025-06",
  temperature: 0.3,
  instructions: `Analyze GitHub issues for contribution viability.
  
  Consider:
  1. Issue clarity and completeness
  2. Technical complexity
  3. Required expertise
  4. Likelihood of acceptance
  
  Provide structured JSON output with confidence scores.`,

  tools: [
    {
      type: "function",
      function: {
        name: "analyze_complexity",
        description: "Estimate effort and complexity",
        parameters: {
          type: "object",
          properties: {
            issue_body: { type: "string" },
            repository_context: { type: "object" },
          },
        },
      },
    },
  ],

  guardrails: {
    maxTokens: 4000,
    timeout: 30000,
    retries: 3,
  },
});
```

### GPT-4o-mini-2025-06

**Purpose**: Cost-effective AI model for analysis tasks
**Rationale**:

- **Cost Efficiency**: 10x cheaper than GPT-4 with similar quality
- **Speed**: Faster response times for real-time analysis
- **Context Window**: 128k tokens for large document analysis
- **Function Calling**: Native support for structured outputs

### Text Embedding Ada-002

**Purpose**: Vector embeddings for semantic similarity
**Rationale**:

- **Proven Performance**: Industry standard for embeddings
- **Cost Effective**: $0.0001 per 1K tokens
- **Dimension**: 1536 dimensions with good semantic capture
- **Stability**: Consistent embeddings across API calls

## External Services

### GitHub API v4 (GraphQL)

**Purpose**: Repository data and real-time updates
**Rationale**:

- **Efficiency**: GraphQL allows precise data fetching
- **Rate Limits**: 5000 requests/hour with proper token management
- **Real-time**: Webhooks for immediate event processing
- **Rich Data**: Complete repository, issue, and user information

**Query Example**:

```graphql
query GetRepositoryIssues($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(
      first: 50
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        id
        number
        title
        body
        labels(first: 10) {
          nodes {
            name
          }
        }
        createdAt
        updatedAt
        author {
          login
        }
      }
    }
  }
}
```

### Resend v4

**Purpose**: Transactional email delivery
**Rationale**:

- **Developer Experience**: Modern API with TypeScript support
- **Deliverability**: High delivery rates with domain authentication
- **Templates**: React-based email templates
- **Analytics**: Open/click tracking and engagement metrics

### Upstash QStash v3

**Purpose**: Serverless message queuing and scheduling
**Rationale**:

- **Serverless**: No infrastructure management
- **HTTP-Based**: Simple REST API for job scheduling
- **Reliability**: At-least-once delivery with retries
- **Scheduling**: Cron-like scheduling for batch jobs

## Infrastructure and Deployment

### Vercel Platform

**Purpose**: Serverless hosting and edge functions
**Rationale**:

- **Edge Network**: Global CDN with automatic optimization
- **Zero Configuration**: Deploy with `git push`
- **Preview Deployments**: Automatic deployments for every PR
- **Analytics**: Built-in performance monitoring

### Environment Configuration

```bash
# Production Environment Variables
NODE_ENV=production
DATABASE_URL=postgresql://...
DATABASE_URL_DEV=postgresql://...
DATABASE_URL_TEST=postgresql://...

# Authentication
NEXTAUTH_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# AI Services
OPENAI_API_KEY=...
OPENAI_ORG_ID=...

# Communication
RESEND_API_KEY=...
TELNYX_API_KEY=...

# Monitoring
SENTRY_DSN=...
VERCEL_ANALYTICS_ID=...
```

## Data Validation and Type Safety

### Zod Integration

**Purpose**: Runtime type validation and parsing
**Rationale**:

- **Runtime Safety**: Validate data at API boundaries
- **TypeScript Integration**: Infer types from schemas
- **Error Handling**: Detailed validation error messages
- **Performance**: Fast parsing with minimal overhead

**Schema Example**:

```typescript
// src/lib/schemas/opportunity.ts
import { z } from "zod";

export const opportunitySchema = z.object({
  id: z.string().uuid(),
  repository: z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    full_name: z.string(),
  }),
  type: z.enum(["documentation", "bug", "feature", "review", "other"]),
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()),
  scores: z.object({
    complexity: z.number().min(0).max(10),
    impact: z.number().min(0).max(10),
    confidence: z.number().min(0).max(1),
    urgency: z.number().min(0).max(10),
  }),
  ai_analysis: z.object({
    summary: z.string(),
    required_skills: z.array(z.string()),
    estimated_hours: z.number().positive(),
    implementation_hints: z.array(z.string()),
    potential_challenges: z.array(z.string()),
  }),
});

export type Opportunity = z.infer<typeof opportunitySchema>;
```

## Performance Considerations

### Bundle Optimization

- **Code Splitting**: Automatic route-based splitting
- **Dynamic Imports**: Lazy loading for large components
- **Tree Shaking**: Remove unused code
- **Compression**: Gzip and Brotli compression

### Caching Strategy

- **Static Assets**: Long-term caching with cache busting
- **API Responses**: Smart caching with SWR
- **Database Queries**: Query result caching
- **CDN**: Global edge caching

### Monitoring Tools

- **Vercel Analytics**: Core Web Vitals and user metrics
- **Sentry**: Error tracking and performance monitoring
- **Lighthouse CI**: Automated performance audits
- **Database Monitoring**: Query performance and optimization

## Cost Analysis

### Monthly Operating Costs (Estimated)

| Service             | Free Tier | 1K Users | 10K Users | Notes                 |
| ------------------- | --------- | -------- | --------- | --------------------- |
| **Vercel Pro**      | $0        | $20      | $20       | Generous free tier    |
| **Neon PostgreSQL** | $0        | $35      | $200      | Scales with storage   |
| **OpenAI API**      | $0        | $30      | $300      | Usage-based pricing   |
| **Upstash QStash**  | $0        | $10      | $50       | Message-based pricing |
| **Resend**          | $0        | $20      | $80       | Email volume based    |
| **GitHub API**      | $0        | $0       | $0        | Rate limited but free |
| **Monitoring**      | $0        | $0       | $25       | Sentry Pro plan       |
| **Total**           | **$0**    | **$115** | **$675**  | Scales with usage     |

### Cost Optimization Strategies

- **Caching**: Reduce API calls and database queries
- **Batching**: Process multiple items together
- **Rate Limiting**: Prevent abuse and unnecessary usage
- **Model Selection**: Use cost-effective AI models
- **Monitoring**: Track usage and optimize continuously

## Future Technology Considerations

### Planned Upgrades

- **React Compiler**: Automatic optimization when stable
- **Turbopack**: Next.js bundler for faster builds
- **WebAssembly**: Performance-critical computations
- **Streaming**: Enhanced streaming capabilities

### Emerging Technologies

- **Edge Databases**: Distributed database at the edge
- **Local-First**: Offline-capable applications
- **AI Agents**: More sophisticated agent capabilities
- **WebGPU**: Client-side AI inference

This technology stack provides a robust foundation for contribux while maintaining flexibility for future enhancements and scaling requirements.
