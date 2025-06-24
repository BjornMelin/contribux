# Database Standards

This document outlines database standards, operations, and best practices for Neon PostgreSQL with vector search capabilities.

## Overview

contribux uses Neon PostgreSQL 16 with pgvector extension for AI-powered search:

- **Database**: Neon PostgreSQL 16 with pgvector
- **Vector embeddings**: halfvec(1536) for semantic similarity
- **Search**: Hybrid text and vector search with HNSW indexes
- **Monitoring**: Performance tracking and health checks

## Environment Configuration

### Branch-Specific URLs

Database connections use environment-specific URLs:

```env
# Production/main branch
DATABASE_URL="postgresql://user:pass@host/db"

# Development branch
DATABASE_URL_DEV="postgresql://user:pass@dev-host/db"

# Testing branch
DATABASE_URL_TEST="postgresql://user:pass@test-host/db"
```

### Connection Management

```typescript
// lib/db/client.ts
import { Pool } from "pg";
import { z } from "zod";

const dbConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DEV: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),
});

const config = dbConfigSchema.parse(process.env);

export const createDatabasePool = (
  environment: "prod" | "dev" | "test" = "prod"
) => {
  const url = {
    prod: config.DATABASE_URL,
    dev: config.DATABASE_URL_DEV || config.DATABASE_URL,
    test: config.DATABASE_URL_TEST || config.DATABASE_URL,
  }[environment];

  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
};
```

## Database Schema

### Core Tables

```sql
-- Users with GitHub integration
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  profile_data JSONB,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repositories with health scoring
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner VARCHAR(255) NOT NULL,
  description TEXT,
  language VARCHAR(100),
  stars INTEGER DEFAULT 0,
  health_score DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  embedding halfvec(1536), -- Vector embeddings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contribution opportunities with AI analysis
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  difficulty VARCHAR(50) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  impact_score DECIMAL(3,2),
  skills_required TEXT[],
  embedding halfvec(1536), -- Vector embeddings
  github_issue_id INTEGER,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences for personalization
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skills TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  difficulty_preference VARCHAR(50),
  notification_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification system
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  channel VARCHAR(50), -- email, web, slack
  status VARCHAR(50) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Contribution outcome tracking
CREATE TABLE contribution_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  opportunity_id UUID REFERENCES opportunities(id),
  repository_id UUID REFERENCES repositories(id),
  status VARCHAR(50), -- started, pr_created, merged, abandoned
  pr_url VARCHAR(500),
  outcome_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- User engagement tracking
CREATE TABLE user_repository_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  repository_id UUID REFERENCES repositories(id),
  interaction_type VARCHAR(100), -- viewed, starred, applied, contributed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Vector Search Indexes

```sql
-- HNSW indexes for efficient vector search
CREATE INDEX idx_repositories_embedding
ON repositories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_opportunities_embedding
ON opportunities USING hnsw (embedding vector_cosine_ops);

-- Performance indexes
CREATE INDEX idx_repositories_stars ON repositories(stars DESC);
CREATE INDEX idx_repositories_language ON repositories(language);
CREATE INDEX idx_opportunities_difficulty ON opportunities(difficulty);
CREATE INDEX idx_opportunities_impact ON opportunities(impact_score DESC);
CREATE INDEX idx_user_preferences_skills ON user_preferences USING GIN (skills);
```

## Vector Search Operations

### Similarity Search Functions

```sql
-- Repository similarity search
CREATE OR REPLACE FUNCTION search_similar_repositories(
  query_embedding halfvec(1536),
  similarity_threshold DECIMAL DEFAULT 0.7,
  result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name VARCHAR(255),
  owner VARCHAR(255),
  description TEXT,
  similarity_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.owner,
    r.description,
    (1 - (r.embedding <=> query_embedding)) AS similarity_score
  FROM repositories r
  WHERE (1 - (r.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Hybrid search combining text and vector
CREATE OR REPLACE FUNCTION hybrid_search_opportunities(
  search_text TEXT,
  query_embedding halfvec(1536),
  user_skills TEXT[] DEFAULT '{}',
  difficulty_filter VARCHAR(50) DEFAULT NULL,
  result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(500),
  description TEXT,
  repository_name VARCHAR(255),
  similarity_score DECIMAL,
  text_rank DECIMAL,
  combined_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.title,
    o.description,
    r.name AS repository_name,
    (1 - (o.embedding <=> query_embedding)) AS similarity_score,
    ts_rank(to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')),
            plainto_tsquery('english', search_text)) AS text_rank,
    -- Combined scoring: 70% vector similarity + 30% text relevance
    ((1 - (o.embedding <=> query_embedding)) * 0.7 +
     ts_rank(to_tsvector('english', o.title || ' ' || COALESCE(o.description, '')),
             plainto_tsquery('english', search_text)) * 0.3) AS combined_score
  FROM opportunities o
  JOIN repositories r ON o.repository_id = r.id
  WHERE
    (difficulty_filter IS NULL OR o.difficulty = difficulty_filter)
    AND (array_length(user_skills, 1) IS NULL OR o.skills_required && user_skills)
    AND (search_text = '' OR to_tsvector('english', o.title || ' ' || COALESCE(o.description, ''))
         @@ plainto_tsquery('english', search_text))
  ORDER BY combined_score DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### Embedding Management

```typescript
// lib/db/embeddings.ts
import { Pool } from "pg";
import { openai } from "@/lib/openai";

export class EmbeddingManager {
  constructor(private pool: Pool) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    });

    return response.data[0].embedding;
  }

  async updateRepositoryEmbedding(
    repositoryId: string,
    text: string
  ): Promise<void> {
    const embedding = await this.generateEmbedding(text);

    await this.pool.query(
      "UPDATE repositories SET embedding = $1 WHERE id = $2",
      [JSON.stringify(embedding), repositoryId]
    );
  }

  async searchSimilarRepositories(
    queryText: string,
    options: { threshold?: number; limit?: number } = {}
  ): Promise<Array<{ id: string; name: string; similarity: number }>> {
    const embedding = await this.generateEmbedding(queryText);
    const { threshold = 0.7, limit = 10 } = options;

    const result = await this.pool.query(
      "SELECT * FROM search_similar_repositories($1, $2, $3)",
      [JSON.stringify(embedding), threshold, limit]
    );

    return result.rows;
  }
}
```

## Database Operations

### Connection Testing

```bash
# Test all database connections
pnpm db:test-connection    # Test current environment
pnpm db:test-dev          # Test development database
pnpm db:test-prod         # Test production database
```

### Health Monitoring

```bash
# Database health and performance
pnpm db:health            # Overall health check
pnpm db:performance-report # Performance metrics
pnpm db:slow-queries      # Identify slow queries
pnpm db:vector-metrics    # Vector search metrics
pnpm db:indexes          # Index usage statistics
pnpm db:analyze          # Update table statistics
```

### Query Performance Monitoring

```typescript
// lib/db/monitoring.ts
export class DatabaseMonitor {
  constructor(private pool: Pool) {}

  async getSlowQueries(limit = 10): Promise<
    Array<{
      query: string;
      mean_time: number;
      calls: number;
      total_time: number;
    }>
  > {
    const result = await this.pool.query(
      `
      SELECT 
        query,
        mean_time,
        calls,
        total_time
      FROM pg_stat_statements 
      WHERE mean_time > 100
      ORDER BY mean_time DESC 
      LIMIT $1
    `,
      [limit]
    );

    return result.rows;
  }

  async getVectorSearchMetrics(): Promise<{
    total_repositories: number;
    repositories_with_embeddings: number;
    avg_similarity_query_time: number;
  }> {
    const result = await this.pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM repositories) as total_repositories,
        (SELECT COUNT(*) FROM repositories WHERE embedding IS NOT NULL) as repositories_with_embeddings,
        (SELECT AVG(mean_time) FROM pg_stat_statements WHERE query LIKE '%<=>%') as avg_similarity_query_time
    `);

    return result.rows[0];
  }

  async getIndexUsage(): Promise<
    Array<{
      table_name: string;
      index_name: string;
      index_scans: number;
      tuples_read: number;
      tuples_fetched: number;
    }>
  > {
    const result = await this.pool.query(`
      SELECT 
        schemaname,
        tablename as table_name,
        indexname as index_name,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      ORDER BY idx_scan DESC
    `);

    return result.rows;
  }
}
```

## Migration Strategy

### Schema Migrations

```typescript
// migrations/001_initial_schema.ts
export const up = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "vector";
    
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id INTEGER UNIQUE NOT NULL,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

export const down = async (pool: Pool): Promise<void> => {
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
};
```

### Data Migrations

```typescript
// migrations/002_add_vector_embeddings.ts
export const up = async (pool: Pool): Promise<void> => {
  // Add embedding columns
  await pool.query(`
    ALTER TABLE repositories 
    ADD COLUMN embedding halfvec(1536);
    
    ALTER TABLE opportunities 
    ADD COLUMN embedding halfvec(1536);
  `);

  // Create vector indexes
  await pool.query(`
    CREATE INDEX idx_repositories_embedding 
    ON repositories USING hnsw (embedding vector_cosine_ops);
    
    CREATE INDEX idx_opportunities_embedding 
    ON opportunities USING hnsw (embedding vector_cosine_ops);
  `);
};
```

### Migration Runner

```typescript
// lib/db/migrations.ts
export class MigrationRunner {
  constructor(private pool: Pool) {}

  async runMigrations(): Promise<void> => {
    await this.ensureMigrationTable();

    const migrations = await this.getPendingMigrations();

    for (const migration of migrations) {
      try {
        await this.pool.query('BEGIN');
        await migration.up(this.pool);
        await this.recordMigration(migration.name);
        await this.pool.query('COMMIT');

        console.log(`✅ Migration ${migration.name} completed`);
      } catch (error) {
        await this.pool.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed: ${error}`);
      }
    }
  }

  private async ensureMigrationTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
}
```

## Performance Optimization

### Query Optimization

```sql
-- Efficient repository search with filters
EXPLAIN (ANALYZE, BUFFERS)
SELECT r.*,
       (1 - (r.embedding <=> $1)) AS similarity_score
FROM repositories r
WHERE r.stars >= 100
  AND r.language = 'TypeScript'
  AND (1 - (r.embedding <=> $1)) >= 0.7
ORDER BY r.embedding <=> $1
LIMIT 10;

-- Optimize with covering index
CREATE INDEX idx_repositories_filtered_search
ON repositories (language, stars)
INCLUDE (name, description, embedding);
```

### Connection Pooling

```typescript
// lib/db/pool.ts
export const createOptimizedPool = (): Pool => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum connections
    min: 5, // Minimum connections
    idleTimeoutMillis: 30000, // Close idle connections
    connectionTimeoutMillis: 5000, // Connection timeout
    acquireTimeoutMillis: 60000, // Pool acquire timeout

    // Neon-specific optimizations
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
};
```

### Batch Operations

```typescript
// lib/db/batch.ts
export class BatchOperations {
  constructor(private pool: Pool) {}

  async batchUpdateEmbeddings(
    updates: Array<{ id: string; embedding: number[] }>
  ): Promise<void> {
    const query = `
      UPDATE repositories 
      SET embedding = data.embedding::halfvec(1536)
      FROM (VALUES ${updates
        .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
        .join(",")}) 
      AS data(id, embedding)
      WHERE repositories.id = data.id::uuid
    `;

    const values = updates.flatMap((u) => [u.id, JSON.stringify(u.embedding)]);

    await this.pool.query(query, values);
  }

  async batchInsertOpportunities(
    opportunities: Array<{
      repository_id: string;
      title: string;
      description: string;
      embedding: number[];
    }>
  ): Promise<void> {
    const query = `
      INSERT INTO opportunities (repository_id, title, description, embedding)
      VALUES ${opportunities
        .map(
          (_, i) =>
            `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
        )
        .join(",")}
    `;

    const values = opportunities.flatMap((o) => [
      o.repository_id,
      o.title,
      o.description,
      JSON.stringify(o.embedding),
    ]);

    await this.pool.query(query, values);
  }
}
```

## Backup and Recovery

### Automated Backups

Neon provides automatic backups, but implement additional strategies:

```typescript
// lib/db/backup.ts
export class BackupManager {
  async createSnapshot(description: string): Promise<string> {
    // Use Neon API for branch creation as backup
    const response = await fetch(
      `${NEON_API_BASE}/projects/${PROJECT_ID}/branches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NEON_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: {
            name: `backup-${Date.now()}`,
            parent_id: "main",
          },
        }),
      }
    );

    const { branch } = await response.json();
    return branch.id;
  }

  async exportData(tables: string[]): Promise<Buffer> {
    // Export specific tables for external backup
    const queries = tables.map(
      (table) => `COPY ${table} TO STDOUT WITH (FORMAT csv, HEADER true)`
    );

    // Implementation depends on backup strategy
    return Buffer.from("exported data");
  }
}
```

## Security Standards

### Access Control

```sql
-- Role-based access control
CREATE ROLE app_user;
CREATE ROLE app_admin;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE ON users TO app_user;
GRANT SELECT, INSERT, UPDATE ON repositories TO app_user;
GRANT SELECT, INSERT, UPDATE ON opportunities TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES TO app_admin;

-- Row Level Security (RLS)
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_policy ON user_preferences
  FOR ALL TO app_user
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### Data Validation

```typescript
// lib/db/validation.ts
import { z } from "zod";

export const RepositorySchema = z.object({
  id: z.string().uuid(),
  github_id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  owner: z.string().min(1).max(255),
  description: z.string().optional(),
  language: z.string().max(100).optional(),
  stars: z.number().int().min(0),
  health_score: z.number().min(0).max(1).optional(),
});

export const validateRepository = (data: unknown): Repository => {
  return RepositorySchema.parse(data);
};
```

## Troubleshooting

### Common Issues

```bash
# Connection pool exhaustion
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Kill long-running queries
SELECT pid, query_start, query
FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';

# Vector search performance
# Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%';

# Update table statistics
ANALYZE repositories;
ANALYZE opportunities;
```

### Monitoring Queries

```sql
-- Monitor vector search performance
SELECT
  query,
  calls,
  mean_time,
  total_time
FROM pg_stat_statements
WHERE query LIKE '%<=>%'
ORDER BY mean_time DESC;

-- Check embedding coverage
SELECT
  COUNT(*) as total_repos,
  COUNT(embedding) as with_embeddings,
  ROUND(COUNT(embedding)::decimal / COUNT(*) * 100, 2) as coverage_percent
FROM repositories;
```
