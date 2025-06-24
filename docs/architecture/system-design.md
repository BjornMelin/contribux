# System Design and Architecture

## Overview

contribux is an AI-powered GitHub contribution discovery platform built on a **serverless-first**, **AI-native** architecture designed for zero maintenance and ultra-low operating costs ($3-8/month). The system intelligently surfaces high-impact open source opportunities for senior developers transitioning to AI Engineering roles.

## Architecture Principles

### Core Design Principles

- **KISS (Keep It Simple, Stupid)**: Prefer straightforward solutions over clever abstractions
- **YAGNI (You Aren't Gonna Need It)**: Implement only what is explicitly needed
- **DRY (Don't Repeat Yourself)**: No duplicated logic; factor into clear helpers
- **Serverless-First**: Zero maintenance overhead with automatic scaling
- **AI-Native**: LLM-first architecture with fallback mechanisms
- **Edge-First Computing**: Leveraging Vercel Edge Functions for low latency
- **Event-Driven**: Using webhooks and real-time updates

### 2025 Modern Architecture Patterns

- **React Server Components**: For optimal performance and reduced client bundle size
- **Streaming Responses**: Real-time AI responses with incremental loading
- **Edge Rendering**: Using Vercel's edge runtime for global distribution
- **Incremental Static Regeneration**: For dashboard pages with dynamic content
- **Parallel Routes**: For complex UI states and improved UX

## High-Level Architecture

```mermaid
graph TB
    subgraph "🎨 Client Layer"
        A[Next.js 15 PWA] --> B[React Server Components]
        B --> C[SWR v3 Cache]
        C --> D[Tailwind CSS 4.0]
    end

    subgraph "🔌 API Layer"
        E[Vercel Edge Functions] --> F[tRPC v11 Router]
        F --> G[Auth Middleware]
        G --> H[Rate Limiting]
    end

    subgraph "🤖 Intelligence Layer"
        I[Repository Scanner] --> J[AI Analyzer]
        J --> K[Scoring Engine]
        K --> L[Personalization Engine]
        L --> M[Notification Engine]
    end

    subgraph "💾 Data Layer"
        N[Neon PostgreSQL 16] --> O[pgvector 0.7]
        P[Upstash Redis] --> Q[QStash v3]
    end

    subgraph "🌐 External Services"
        R[GitHub API v4] --> S[OpenAI Agents SDK v1.0]
        T[Resend v4] --> U[Telnyx SMS]
    end

    subgraph "📊 Observability"
        V[Vercel Analytics] --> W[Sentry Monitoring]
        W --> X[Performance Tracking]
    end

    A --> E
    E --> I
    I --> N
    J --> S
    M --> T
    I --> V

    style A fill:#7C3AED,color:#fff
    style J fill:#10B981,color:#fff
    style N fill:#F59E0B,color:#fff
    style S fill:#EF4444,color:#fff
```

## Detailed Component Architecture

### 1. Client Layer

#### Next.js 15 Application

- **App Router**: File-based routing with enhanced layouts
- **React Server Components**: Server-side rendering with selective hydration
- **Progressive Web App**: Offline capability and mobile optimization
- **TypeScript 5.7+**: Strict type safety with path mapping

#### State Management

- **SWR v3**: Data fetching with intelligent caching and revalidation
- **React Context**: Global state for user preferences and authentication
- **URL State**: Search parameters and filters persisted in URL

#### Styling System

- **Tailwind CSS 4.0**: Utility-first styling with CSS-first configuration
- **shadcn/ui v2**: Component library with accessibility built-in
- **Responsive Design**: Mobile-first approach with progressive enhancement

### 2. API Layer

#### Edge Functions

- **Vercel Edge Runtime**: Global distribution with sub-50ms latency
- **tRPC v11**: End-to-end type safety with automatic API generation
- **Authentication**: JWT-based auth with refresh token rotation
- **Rate Limiting**: Per-user and per-endpoint protection

#### Middleware Stack

```mermaid
graph LR
    A[Request] --> B[CORS]
    B --> C[Auth Check]
    C --> D[Rate Limiting]
    D --> E[Input Validation]
    E --> F[Business Logic]
    F --> G[Response]

    style C fill:#10B981,color:#fff
    style E fill:#F59E0B,color:#fff
```

### 3. Intelligence Layer

#### AI Agent System

```mermaid
graph TB
    subgraph "🎯 Orchestration"
        A[ContribuxOrchestrator] --> B[Task Router]
        B --> C[State Manager]
        C --> D[Error Handler]
    end

    subgraph "🔍 Discovery Agents"
        E[ContribuxScanner] --> F[Repository Health Check]
        E --> G[Issue Discovery]
        E --> H[Trend Analysis]
    end

    subgraph "🧠 Analysis Agents"
        I[ContribuxAnalyzer] --> J[Complexity Estimator]
        I --> K[Skill Detector]
        I --> L[Acceptance Predictor]
    end

    subgraph "💡 Strategy Agents"
        M[ContribuxStrategist] --> N[Implementation Planner]
        M --> O[Risk Assessor]
        M --> P[Success Predictor]
    end

    subgraph "📈 Learning Layer"
        Q[SuccessTracker] --> R[Pattern Analyzer]
        Q --> S[Recommendation Tuner]
    end

    A --> E
    A --> I
    A --> M
    A --> Q

    style A fill:#7C3AED,color:#fff
    style I fill:#10B981,color:#fff
    style M fill:#F59E0B,color:#fff
```

#### AI Processing Pipeline

1. **Data Ingestion**: GitHub API events and repository scanning
2. **Preprocessing**: Text cleaning, normalization, and enrichment
3. **Analysis**: Multi-agent processing with confidence scoring
4. **Scoring**: Weighted scoring across multiple dimensions
5. **Personalization**: User preference matching and ranking
6. **Delivery**: Smart notification with optimal timing

### 4. Data Layer

#### PostgreSQL Schema Design

```mermaid
erDiagram
    users ||--o{ user_preferences : has
    users ||--o{ contribution_outcomes : tracks
    users ||--o{ notifications : receives

    repositories ||--o{ opportunities : contains
    repositories ||--o{ repository_watches : watched_by

    opportunities ||--o{ notifications : triggers
    opportunities ||--o{ contribution_outcomes : results_in

    users {
        uuid id PK
        text github_username
        text email
        timestamptz created_at
        timestamptz updated_at
    }

    repositories {
        uuid id PK
        bigint github_id
        text full_name
        text owner
        text name
        text description
        text[] topics
        text primary_language
        jsonb languages
        integer stars_count
        integer forks_count
        float health_score
        vector_384 description_embedding
        vector_384 topics_embedding
        timestamptz last_scanned_at
        boolean is_archived
        boolean has_contributing_guide
    }

    opportunities {
        uuid id PK
        uuid repository_id FK
        bigint github_issue_id
        integer github_issue_number
        text type
        text status
        text title
        text body
        text[] labels
        float complexity_score
        float impact_score
        float confidence_score
        float urgency_score
        float overall_score
        jsonb ai_analysis
        text[] required_skills
        float estimated_hours
        text[] implementation_hints
        timestamptz first_seen_at
        timestamptz expires_at
    }

    user_preferences {
        uuid id PK
        uuid user_id FK
        text[] expertise_areas
        text[] languages
        text[] topics_of_interest
        text[] excluded_topics
        text[] preferred_contribution_types
        integer min_repo_stars
        float max_complexity_score
        float min_impact_score
        text[] notification_channels
        text timezone
        time daily_digest_time
        integer max_daily_notifications
        boolean include_first_time_contributions
        boolean prefer_ai_ml_repos
    }
```

#### Vector Search Implementation

- **Embedding Model**: OpenAI text-embedding-ada-002 (1536 dimensions)
- **Vector Index**: pgvector IVFFLAT with cosine similarity
- **Hybrid Search**: Combines vector similarity with traditional text search
- **Performance**: Sub-100ms query times with proper indexing

#### Caching Strategy

```mermaid
graph LR
    A[Client Request] --> B{Cache Check}
    B -->|Hit| C[Return Cached]
    B -->|Miss| D[Database Query]
    D --> E[Cache Result]
    E --> F[Return Data]

    subgraph "Cache Layers"
        G[SWR Client Cache]
        H[Redis Cache]
        I[PostgreSQL Query Cache]
    end

    style B fill:#10B981,color:#fff
    style H fill:#F59E0B,color:#fff
```

### 5. External Service Integration

#### GitHub API Integration

- **REST API v3**: Repository metadata and issue tracking
- **GraphQL API v4**: Efficient data fetching with custom queries
- **Webhooks**: Real-time updates for repository events
- **Rate Limiting**: Intelligent backoff with token pool management

#### OpenAI Integration

- **Agents SDK v1.0**: Multi-agent orchestration with TypeScript support
- **GPT-4o-mini**: Cost-effective model for analysis tasks
- **Embeddings API**: Semantic similarity for opportunity matching
- **Token Management**: Usage tracking and cost optimization

#### Communication Services

- **Resend**: Transactional email with template management
- **Telnyx**: SMS delivery for urgent notifications
- **Push Notifications**: Browser notifications for real-time updates

## Data Flow and Processing

### Real-time Processing Pipeline

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant WH as Webhook Handler
    participant Q as Queue (QStash)
    participant AI as AI Analyzer
    participant DB as Database
    participant N as Notifier
    participant U as User

    GH->>WH: Issue/PR Event
    WH->>Q: Queue for Processing
    Q->>AI: Analyze Opportunity
    AI-->>AI: Score & Classify
    AI->>DB: Store Results
    DB->>N: Trigger Notifications
    N->>U: Deliver via Email/SMS
    U->>DB: Track Engagement
```

### Batch Processing Workflow

```mermaid
graph TB
    A[Scheduled Job] --> B[Repository Scanner]
    B --> C[Trending Repos API]
    C --> D[Repository Health Check]
    D --> E[Issue Extraction]
    E --> F[AI Analysis Queue]
    F --> G[Scoring Engine]
    G --> H[User Matching]
    H --> I[Notification Queue]
    I --> J[Smart Delivery]

    style A fill:#7C3AED,color:#fff
    style F fill:#10B981,color:#fff
    style I fill:#F59E0B,color:#fff
```

## Performance and Scalability

### Performance Targets

| Metric              | Target | Critical Threshold | Measurement      |
| ------------------- | ------ | ------------------ | ---------------- |
| Initial Page Load   | <2s    | <3s                | Lighthouse CI    |
| API Response (p95)  | <500ms | <1s                | Vercel Analytics |
| Time to Interactive | <3s    | <5s                | Core Web Vitals  |
| Background Jobs     | <5min  | <10min             | Queue Metrics    |
| Database Queries    | <100ms | <500ms             | PostgreSQL Logs  |

### Scaling Strategy

#### Horizontal Scaling

- **Serverless Functions**: Auto-scaling based on demand
- **Database**: Neon's automatic read replicas and connection pooling
- **CDN**: Global edge distribution for static assets
- **Queue Processing**: Parallel job execution with QStash

#### Vertical Optimization

- **Bundle Splitting**: Lazy loading for non-critical components
- **Image Optimization**: WebP format with responsive sizing
- **Database Indexing**: Optimized queries with proper indexes
- **Caching**: Multi-layer caching strategy

### Resource Management

```mermaid
graph TB
    subgraph "Resource Limits"
        A[Vercel Function: 10s timeout]
        B[Database: 0.5GB free tier]
        C[OpenAI: $100/month budget]
        D[Redis: 100K operations/day]
    end

    subgraph "Monitoring"
        E[Usage Tracking]
        F[Cost Alerts]
        G[Performance Metrics]
        H[Error Tracking]
    end

    A --> E
    B --> E
    C --> F
    D --> G

    style F fill:#EF4444,color:#fff
    style G fill:#10B981,color:#fff
```

## Security Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as Auth Service
    participant GH as GitHub OAuth
    participant DB as Database

    U->>F: Login Request
    F->>A: Initiate OAuth
    A->>GH: Redirect to GitHub
    GH->>U: Authorization Page
    U->>GH: Grant Permission
    GH->>A: Authorization Code
    A->>GH: Exchange for Token
    GH->>A: Access Token
    A->>DB: Store User Data
    A->>F: JWT Token
    F->>U: Authenticated Session
```

### Security Layers

1. **Transport Security**

   - TLS 1.3 for all communications
   - HSTS headers for HTTPS enforcement
   - Certificate pinning for API calls

2. **Authentication & Authorization**

   - GitHub OAuth 2.0 with PKCE
   - JWT tokens with 15-minute expiry
   - Refresh token rotation
   - Role-based access control (future)

3. **Data Protection**

   - AES-256-GCM encryption for sensitive data
   - Token encryption at rest
   - PII minimization and anonymization
   - GDPR compliance with data deletion

4. **Input Validation**
   - Zod schemas for runtime type checking
   - SQL injection prevention with parameterized queries
   - XSS protection with CSP headers
   - Rate limiting and DDoS protection

## Monitoring and Observability

### Observability Stack

```mermaid
graph TB
    subgraph "Metrics Collection"
        A[Vercel Analytics] --> B[Custom Events]
        C[Database Metrics] --> D[Query Performance]
        E[Application Metrics] --> F[Error Rates]
    end

    subgraph "Error Tracking"
        G[Sentry] --> H[Error Aggregation]
        H --> I[Alert Routing]
    end

    subgraph "Performance Monitoring"
        J[Lighthouse CI] --> K[Core Web Vitals]
        L[APM Traces] --> M[Request Flow]
    end

    subgraph "Business Metrics"
        N[User Engagement] --> O[Conversion Rates]
        P[AI Performance] --> Q[Accuracy Metrics]
    end

    style A fill:#7C3AED,color:#fff
    style G fill:#EF4444,color:#fff
    style J fill:#10B981,color:#fff
    style N fill:#F59E0B,color:#fff
```

### Key Metrics Dashboard

#### Technical Metrics

- **Availability**: 99.9% uptime SLA
- **Response Time**: p95 < 500ms
- **Error Rate**: < 0.1%
- **Cache Hit Rate**: > 85%

#### Business Metrics

- **User Activation**: 80% within 7 days
- **Contribution Success**: 40% PR acceptance rate
- **Notification Relevance**: 80% useful rating
- **Cost per User**: < $0.50/month

#### AI Performance Metrics

- **Analysis Accuracy**: > 85%
- **Confidence Calibration**: Well-calibrated predictions
- **Processing Time**: < 30 seconds per opportunity
- **Token Efficiency**: Optimized prompt engineering

## Deployment and Infrastructure

### Deployment Pipeline

```mermaid
graph LR
    A[Git Push] --> B[GitHub Actions]
    B --> C[Type Check]
    C --> D[Lint & Format]
    D --> E[Unit Tests]
    E --> F[Integration Tests]
    F --> G[Build]
    G --> H[Vercel Deploy]
    H --> I[Health Check]
    I --> J[Rollback on Failure]

    style B fill:#10B981,color:#fff
    style H fill:#7C3AED,color:#fff
    style J fill:#EF4444,color:#fff
```

### Environment Strategy

| Environment     | Purpose           | Branch        | Database         | Features                |
| --------------- | ----------------- | ------------- | ---------------- | ----------------------- |
| **Development** | Local development | feature/\*    | Local PostgreSQL | Hot reload, debug tools |
| **Preview**     | PR previews       | pull requests | Neon branch      | Full feature testing    |
| **Staging**     | Pre-production    | develop       | Neon staging     | Production simulation   |
| **Production**  | Live system       | main          | Neon production  | Full monitoring         |

### Infrastructure as Code

```typescript
// Vercel deployment configuration
export default {
  name: "contribux",
  framework: "nextjs",
  buildCommand: "pnpm build",
  outputDirectory: ".next",
  installCommand: "pnpm install",
  devCommand: "pnpm dev",
  regions: ["iad1", "sfo1", "fra1"], // Multi-region deployment
  env: {
    NODE_ENV: "production",
    DATABASE_URL: "@database-url",
    OPENAI_API_KEY: "@openai-key",
    GITHUB_TOKEN: "@github-token",
  },
  functions: {
    "src/app/api/**/*.ts": {
      maxDuration: 30, // 30-second timeout for AI processing
    },
  },
};
```

## Future Architecture Considerations

### Planned Enhancements

1. **Microservices Evolution**

   - Agent service extraction for better scaling
   - Dedicated notification service
   - Analytics service separation

2. **Advanced AI Features**

   - Fine-tuned models for domain-specific analysis
   - Reinforcement learning from user feedback
   - Multi-modal analysis (code + documentation)

3. **Enterprise Features**

   - Team collaboration tools
   - Organization-level analytics
   - Custom deployment options

4. **Performance Optimizations**
   - GraphQL federation for complex queries
   - Event sourcing for audit trails
   - CQRS pattern for read/write separation

### Technology Evolution

- **React Server Components**: Continued adoption for better performance
- **Edge Computing**: Expanded use of edge functions and databases
- **AI Integration**: Deeper integration with emerging AI capabilities
- **WebAssembly**: Performance-critical computations in the browser

This architecture provides a solid foundation for the contribux platform while maintaining flexibility for future growth and evolution.
