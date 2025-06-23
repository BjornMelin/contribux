# Local Testing Infrastructure Guide

This guide covers the comprehensive local testing infrastructure for contribux, including Docker setup, database testing, performance benchmarking, and vector search validation.

## Quick Start

### 1. Start the Complete Test Suite

```bash
# Run the full test suite with all infrastructure
pnpm test:full

# Run with debug interfaces (pgAdmin, RedisInsight)
pnpm test:full --debug

# Run with monitoring (Prometheus, Grafana)
pnpm test:full --monitoring
```

### 2. Quick Testing (Essential Tests Only)

```bash
# Run essential tests quickly
pnpm test:quick
```

### 3. Manual Infrastructure Setup

```bash
# Start infrastructure for manual testing
pnpm test:setup

# Run tests manually
pnpm test
pnpm test:db
pnpm test:vector

# Clean up when done
pnpm test:cleanup
```

## Infrastructure Components

### Core Services

- **PostgreSQL 16 with pgvector**: Main database with vector similarity search
- **Redis 7**: Caching layer for performance optimization
- **pgAdmin**: Web-based PostgreSQL administration (debug mode)
- **RedisInsight**: Redis monitoring and debugging (debug mode)

### Monitoring Services (Optional)

- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Metrics visualization and dashboards

## Available Test Commands

### Test Orchestration

```bash
pnpm test:full          # Complete test suite with infrastructure setup
pnpm test:quick         # Essential tests only
pnpm test:setup         # Setup infrastructure for manual testing
pnpm test:cleanup       # Clean up Docker containers and volumes
```

### Database Testing

```bash
pnpm test:db            # Run database-specific tests
pnpm test:vector        # Run vector search tests specifically
pnpm db:migrate         # Run database migrations
pnpm db:migrate:status  # Show migration status
pnpm db:migrate:reset   # Reset database and re-run migrations
pnpm db:seed            # Seed test data
```

### Performance Testing

```bash
pnpm test:performance   # Run performance benchmarks
pnpm test:cache         # Test cache performance and functionality
```

### Docker Management

```bash
pnpm docker:up          # Start core services (PostgreSQL, Redis)
pnpm docker:down        # Stop services and remove volumes
pnpm docker:debug       # Start with debug interfaces
pnpm docker:monitoring  # Start with monitoring stack
pnpm docker:logs        # Follow container logs
```

### Standard Application Testing

```bash
pnpm test               # Run all application tests
pnpm test:watch         # Run tests in watch mode
pnpm test:coverage      # Run tests with coverage report
pnpm test:ui            # Open Vitest UI interface
```

## Infrastructure Details

### PostgreSQL Configuration

- **Image**: `pgvector/pgvector:pg16`
- **Port**: 5432
- **Database**: `testdb`
- **User**: `testuser`
- **Password**: `testpass`
- **Extensions**: pgvector, pg_trgm, pg_stat_statements
- **Optimizations**: Configured for development and testing performance

### Redis Configuration

- **Image**: `redis:7-alpine`
- **Port**: 6379
- **Password**: `testredispass`
- **Configuration**: Optimized for testing and caching

### Debug Interfaces

- **pgAdmin**: <http://localhost:5050> (<admin@contribux.dev> / admin)
- **RedisInsight**: <http://localhost:8001>

### Monitoring Interfaces

- **Prometheus**: <http://localhost:9090>
- **Grafana**: <http://localhost:3001> (admin / admin)

## Test Data

### Automated Test Data Generation

The testing infrastructure includes sophisticated test data generation:

- **Users**: 5 test users with realistic profiles and embeddings
- **Repositories**: 5 test repositories with health scoring and vector embeddings
- **Opportunities**: 15-25 contribution opportunities with semantic embeddings
- **Interactions**: User-repository interactions and contribution outcomes
- **Vector Embeddings**: 1536-dimensional halfvec embeddings for semantic search

### Vector Test Data Features

- **Cluster-based generation**: Test data is organized in semantic clusters
- **Similarity control**: Generate embeddings with controlled similarity levels
- **Edge case testing**: Test various vector edge cases and query patterns
- **Performance validation**: Large-scale data for performance testing

## Performance Benchmarking

### Database Benchmarks

- **Basic Queries**: Standard SELECT, WHERE, ORDER BY operations
- **Vector Search**: HNSW index performance with various configurations
- **Complex Joins**: Multi-table joins with filtering and aggregation
- **Index Performance**: GIN, Trigram, and HNSW index efficiency

### Cache Benchmarks

- **Redis Operations**: SET, GET, HSET, HGET performance
- **Cache Hit Ratios**: Measure cache effectiveness
- **Cache vs Database**: Performance comparison
- **Memory Usage**: Redis memory utilization patterns

### Vector Search Benchmarks

- **Similarity Search**: Cosine, L2, and inner product distance metrics
- **HNSW Configuration**: Test different m and ef_construction values
- **Hybrid Search**: Combined text and vector search performance
- **Index Build Time**: HNSW index construction performance

## Vector Search Testing

### Test Categories

1. **Basic Similarity Search**: User profiles, repository descriptions, opportunity titles
2. **Hybrid Search**: Combined text and vector similarity
3. **Edge Case Handling**: Zero vectors, high-magnitude vectors, sparse vectors
4. **Performance Validation**: Index usage, query optimization
5. **Distance Metrics**: Cosine, L2, inner product comparisons

### Vector Test Utilities

- **Fake Embedding Generation**: Realistic 1536-dimensional vectors
- **Similarity Control**: Generate embeddings with specific similarity levels
- **Cluster Generation**: Create semantic clusters for testing
- **Performance Measurement**: Execution time and index usage analysis

## Monitoring and Reports

### Test Reports

All test runs generate comprehensive reports:

- **Performance Report**: JSON format with detailed metrics
- **Test Summary**: Markdown format for easy reading
- **Cache Analysis**: Redis performance and efficiency metrics
- **Vector Metrics**: HNSW index performance and query analysis

### Report Locations

- `scripts/reports/comprehensive-test-report.json`
- `scripts/reports/test-summary.md`
- `scripts/reports/performance-report-*.json`
- `scripts/reports/cache-test-report-*.json`

## Environment Configuration

### Required Environment Variables

```bash
# Database (automatically set for testing)
DATABASE_URL_TEST=postgresql://testuser:testpass@localhost:5432/testdb

# Redis (automatically set for testing)
REDIS_URL_TEST=redis://:testredispass@localhost:6379

# Vector Search Configuration
VECTOR_SEARCH_EF_SEARCH=200
VECTOR_SIMILARITY_THRESHOLD=0.7
```

### Optional Configuration

```bash
# Performance Testing
BENCHMARK_ITERATIONS=50
PERFORMANCE_THRESHOLD_MS=100

# Debugging
DEBUG_TESTS=true
LOG_LEVEL=debug
```

## Troubleshooting

### Common Issues

#### Docker Issues

```bash
# If containers won't start
pnpm docker:down
docker system prune -f
pnpm docker:up

# Check container logs
pnpm docker:logs
```

#### Database Connection Issues

```bash
# Verify PostgreSQL is ready
pg_isready -h localhost -p 5432 -U testuser

# Check database status
pnpm db:migrate:status
```

#### Redis Connection Issues

```bash
# Test Redis connectivity
redis-cli -h localhost -p 6379 -a testredispass ping
```

#### Vector Search Issues

```bash
# Verify pgvector extension
psql -h localhost -p 5432 -U testuser -d testdb -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# Check HNSW indexes
pnpm db:vector-metrics
```

### Performance Issues

- **Slow vector queries**: Adjust `hnsw.ef_search` setting
- **Memory usage**: Monitor Docker container resources
- **Index build time**: Consider adjusting HNSW parameters (m, ef_construction)

### Debug Mode

Enable debug mode for additional monitoring:

```bash
# Start with debug interfaces
pnpm docker:debug

# Access pgAdmin at http://localhost:5050
# Access RedisInsight at http://localhost:8001
```

## Best Practices

### Running Tests

1. Always use `pnpm test:full` for comprehensive validation
2. Use `pnpm test:quick` for rapid iteration during development
3. Run `pnpm test:vector` specifically when working on vector search features
4. Monitor performance with `pnpm test:performance` after changes

### Vector Search Development

1. Use vector test utilities for generating realistic embeddings
2. Test with various similarity thresholds and distance metrics
3. Validate HNSW index configuration for your use case
4. Monitor index build time and memory usage

### Performance Optimization

1. Run benchmarks before and after optimizations
2. Monitor cache hit ratios and adjust TTL values
3. Test different HNSW parameters for optimal performance
4. Use profiling tools to identify bottlenecks

### Data Management

1. Use seeded test data for consistent results
2. Clean up test data between runs
3. Generate sufficient test data for performance validation
4. Test edge cases and boundary conditions

## Advanced Usage

### Custom HNSW Configuration Testing

```bash
# Test different HNSW parameters
node scripts/performance/benchmark-suite.js

# Monitor index performance
pnpm db:vector-metrics
```

### Custom Performance Testing

```bash
# Run specific benchmarks
node scripts/performance/benchmark-suite.js
node scripts/performance/cache-test-utils.js
```

### Monitoring Setup

```bash
# Start full monitoring stack
pnpm docker:monitoring

# Access Grafana dashboards
open http://localhost:3001
```

This infrastructure provides a robust foundation for local development and testing of the contribux platform's vector search capabilities, caching layer, and overall performance.
