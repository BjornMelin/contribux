# Database Migration Strategy with Neon PostgreSQL

## Overview

This project uses Neon PostgreSQL with a branching-based migration strategy for safe database schema changes. Neon's branching feature allows us to test migrations on isolated database branches before applying them to production.

## Branch Structure

- **Main Branch** (`br-summer-art-a864udht`): Production database
- **Development Branch** (`br-cold-scene-a86p5ixr`): Development and feature testing
- **Testing Branch** (`br-fancy-pine-a8imumhr`): Automated testing and CI/CD

## Migration Workflow

### 1. Development Phase

```bash
# Work on development branch
export DATABASE_URL=$DATABASE_URL_DEV

# Run migrations on dev branch
npm run db:migrate:dev
```

### 2. Testing Phase

```bash
# Test migrations on testing branch
export DATABASE_URL=$DATABASE_URL_TEST

# Run automated tests
npm run test:db
npm run test:migrations
```

### 3. Production Deployment

```bash
# Apply to main branch only after successful testing
export DATABASE_URL=$DATABASE_URL

# Apply migrations to production
npm run db:migrate:prod
```

## Connection Pooling

Neon provides built-in connection pooling through their pooler endpoints:

- All connection strings include `-pooler` for automatic pooling
- Transaction pooling mode is used by default
- Optimal for Next.js serverless functions

### Connection Pool Configuration

```typescript
// Built into Neon - no additional setup required
const sql = neon(process.env.DATABASE_URL);

// For client-side pooling (if needed):
const poolConfig = {
  min: 2,
  max: 20,
  idleTimeoutMillis: 10000,
};
```

## Vector Search Configuration

### HNSW Index Settings

- **m**: 16 (connections per node)
- **ef_construction**: 64 (build quality)
- **ef_search**: 200 (runtime search quality)

### Hybrid Search Parameters

- **Text Weight**: 30% (pg_trgm fuzzy matching)
- **Vector Weight**: 70% (semantic similarity)
- **RRF k**: 60 (Reciprocal Rank Fusion parameter)

## Migration Safety Checklist

### Pre-Migration

- [ ] Create feature branch from main
- [ ] Test schema changes on development branch
- [ ] Verify all indexes are created successfully
- [ ] Test hybrid search functions
- [ ] Run performance benchmarks

### Migration Execution

- [ ] Backup current schema (Neon automatic)
- [ ] Apply migration to testing branch
- [ ] Run full test suite
- [ ] Verify data integrity
- [ ] Check query performance

### Post-Migration

- [ ] Monitor database performance
- [ ] Verify application functionality
- [ ] Check connection pool metrics
- [ ] Validate search functionality

## Database Schema Features

### Tables Created

- `users` - User profiles with halfvec embeddings
- `repositories` - Repository data with metadata
- `opportunities` - Contribution opportunities
- `user_preferences` - User matching preferences
- `notifications` - System notifications
- `contribution_outcomes` - Track contribution results
- `user_repository_interactions` - User activity tracking

### Extensions Enabled

- `vector 0.8.0` - Vector operations with halfvec support
- `pg_trgm 1.6` - Fuzzy text matching
- `uuid-ossp 1.1` - UUID generation
- `pgcrypto 1.3` - Encryption functions

### Search Functions

- `hybrid_search_opportunities()` - Combined vector + text search
- `hybrid_search_repositories()` - Repository search
- `search_similar_users()` - User similarity matching
- `find_matching_opportunities_for_user()` - Personalized recommendations

## Monitoring and Performance

### Key Metrics to Track

- Connection pool utilization
- HNSW index performance
- Query execution times
- Vector search accuracy
- Memory usage with halfvec

### Performance Optimization

- Use halfvec(1536) for 50% memory savings
- HNSW indexes with optimal parameters
- Proper query planning with ANALYZE
- Connection pooling for serverless efficiency

## Backup and Recovery

Neon provides:

- Automatic daily backups
- Point-in-time recovery
- Branch-based backup strategy
- Cross-region replication available

### Manual Backup Commands

```bash
# Create backup branch
neon branches create --project-id soft-dew-27794389 --name backup-$(date +%Y%m%d)

# Restore from backup
neon branches restore --project-id soft-dew-27794389 --branch-id <backup-branch-id>
```
