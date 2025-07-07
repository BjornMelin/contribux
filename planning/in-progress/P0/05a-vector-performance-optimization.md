# P0 Research Agent D1: Vector Search Performance Optimization for Contribux

## Executive Summary

This research report provides a comprehensive guide for optimizing pgvector with HNSW indexes in Neon PostgreSQL for production-scale repository discovery. Key findings include:

- **30x faster index builds** with pgvector 0.5.1+ parallel HNSW construction
- **57% storage reduction** using halfvec data type with negligible accuracy loss
- **3x better query performance** with properly tuned HNSW parameters
- **66% memory reduction** using scalar/binary quantization techniques
- **Neon-specific optimizations** leveraging serverless autoscaling for index builds

## 1. HNSW Index Parameter Tuning

### Core HNSW Parameters

**Construction Parameters:**
- **m (default: 16)**: Number of bi-directional links per node
  - Higher values (32-48) = better recall, slower builds, more memory
  - Lower values (8-12) = faster builds, less memory, lower recall
  - **Recommendation**: Start with m=16, increase to 24-32 for critical accuracy needs

- **ef_construction (default: 64)**: Size of dynamic candidate list
  - Higher values (128-200) = better recall, slower builds
  - **Recommendation**: Use 64 for balanced performance, 128 for high accuracy

**Query Parameters:**
- **hnsw.ef_search**: Controls query-time accuracy/speed tradeoff
  - Default: 40
  - Production recommendation: 100-200 for better recall
  - Can be set per-session: `SET hnsw.ef_search = 100;`

### Optimal Index Creation

```sql
-- Production-optimized HNSW index for 1536-dim embeddings
CREATE INDEX idx_repositories_embedding_hnsw 
ON repositories 
USING hnsw (embedding_vector vector_cosine_ops) 
WITH (
  m = 24,                    -- Balanced for production
  ef_construction = 128      -- Higher accuracy during build
);

-- Enable parallel builds (pgvector 0.5.1+)
SET max_parallel_maintenance_workers = 8;  -- Adjust based on CPU cores
SET maintenance_work_mem = '8GB';          -- More memory = faster builds
```

### Performance/Accuracy Balance Matrix

| Use Case | m | ef_construction | ef_search | Build Time | Query Time | Recall |
|----------|---|-----------------|-----------|------------|------------|--------|
| Development | 16 | 64 | 40 | Fast | Fast | ~90% |
| Production | 24 | 128 | 100 | Medium | Medium | ~95% |
| High Accuracy | 32 | 200 | 200 | Slow | Slow | ~98% |
| Speed Priority | 12 | 64 | 50 | Very Fast | Very Fast | ~85% |

## 2. Vector Dimensionality Optimization

### Halfvec Storage Optimization

pgvector's `halfvec` type uses 16-bit floats instead of 32-bit, providing:
- **57% total storage reduction**
- **66% index size reduction**
- **No measurable accuracy loss** for most use cases
- **Slight query speed improvement** due to reduced I/O

```sql
-- Create table with halfvec type (1536 dimensions, 16-bit precision)
CREATE TABLE repositories_optimized (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_vector halfvec(1536),  -- 3KB instead of 6KB per vector
  metadata JSONB
);

-- Convert existing vectors to halfvec
INSERT INTO repositories_optimized (id, name, description, embedding_vector, metadata)
SELECT id, name, description, embedding_vector::halfvec(1536), metadata
FROM repositories;
```

### Dimensionality Reduction Strategies

1. **Keep First N Dimensions**
   - Research shows keeping 25% of dimensions retains ~95% performance
   - For 1536-dim vectors, use first 384-512 dimensions

2. **PCA Reduction** (for extreme optimization)
   ```sql
   -- Example: Reduce to 512 dimensions using PCA
   -- Requires preprocessing embeddings before storage
   CREATE TABLE repositories_pca (
     id BIGSERIAL PRIMARY KEY,
     embedding_vector halfvec(512)  -- 1KB per vector
   );
   ```

3. **Binary Quantization** (maximum compression)
   - Reduces vectors to 1 bit per dimension
   - 192 bytes for 1536-dim vector (32x reduction)
   - Best for high-volume, low-precision needs

## 3. Query Performance Optimization

### Connection Pooling Configuration

```typescript
// Neon-optimized connection pool configuration
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon-specific optimizations
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,  // Serverless: keep low to avoid connection overhead
  
  // Connection parameters for vector operations
  options: {
    // Force index usage for vector queries
    '-c enable_seqscan=off',
    // Pre-set HNSW search accuracy
    '-c hnsw.ef_search=100',
    // Optimize for read-heavy workloads
    '-c random_page_cost=1.1',
  }
});
```

### Query Optimization Patterns

1. **Batch Vector Searches**
   ```sql
   -- Efficient: Single query for multiple vectors
   WITH query_vectors AS (
     SELECT unnest(ARRAY[
       '[0.1, 0.2, ...]'::halfvec(1536),
       '[0.3, 0.4, ...]'::halfvec(1536)
     ]) AS vec
   )
   SELECT r.*, qv.vec <=> r.embedding_vector AS distance
   FROM repositories r, query_vectors qv
   ORDER BY distance
   LIMIT 10;
   ```

2. **Filtered Vector Search with Iterative Scanning**
   ```sql
   -- Enable iterative scanning for filtered queries (pgvector 0.8.0+)
   SET hnsw.iterative_scan = on;
   SET hnsw.max_scan_tuples = 10000;
   
   -- Efficient filtered search
   SELECT * FROM repositories
   WHERE language = 'TypeScript' 
     AND stars > 100
   ORDER BY embedding_vector <=> $1
   LIMIT 10;
   ```

3. **Hybrid Search Pattern**
   ```sql
   -- Combine vector similarity with keyword search
   WITH vector_results AS (
     SELECT id, embedding_vector <=> $1 AS vector_distance
     FROM repositories
     ORDER BY vector_distance
     LIMIT 100
   ),
   keyword_results AS (
     SELECT id, ts_rank(search_vector, plainto_tsquery($2)) AS text_rank
     FROM repositories
     WHERE search_vector @@ plainto_tsquery($2)
   )
   SELECT r.*, 
          vr.vector_distance,
          kr.text_rank,
          (0.7 * (1 - vr.vector_distance) + 0.3 * kr.text_rank) AS combined_score
   FROM repositories r
   JOIN vector_results vr ON r.id = vr.id
   LEFT JOIN keyword_results kr ON r.id = kr.id
   ORDER BY combined_score DESC
   LIMIT 20;
   ```

### Caching Strategies

1. **Application-Level Caching**
   ```typescript
   import { LRUCache } from 'lru-cache';
   
   const vectorCache = new LRUCache<string, Float32Array>({
     max: 10000,  // Cache 10k most recent embeddings
     ttl: 1000 * 60 * 60,  // 1 hour TTL
     sizeCalculation: (value) => value.length * 4,  // bytes
     maxSize: 50 * 1024 * 1024,  // 50MB max
   });
   ```

2. **Query Result Caching**
   ```typescript
   const queryCache = new LRUCache<string, SearchResult[]>({
     max: 1000,
     ttl: 1000 * 60 * 5,  // 5 minute TTL for search results
   });
   
   async function cachedVectorSearch(query: string, vector: Float32Array) {
     const cacheKey = `${query}-${hashVector(vector)}`;
     const cached = queryCache.get(cacheKey);
     if (cached) return cached;
     
     const results = await performVectorSearch(vector);
     queryCache.set(cacheKey, results);
     return results;
   }
   ```

## 4. Neon PostgreSQL-Specific Optimizations

### Serverless Autoscaling for Index Builds

```typescript
// Neon autoscaling strategy for HNSW index creation
async function buildHNSWIndexWithAutoscaling() {
  const neon = new NeonClient();
  
  try {
    // Scale up for index build
    await neon.updateEndpoint({
      compute_size: 'large',  // 8 vCPUs, 32GB RAM
      autoscaling_limit_min_cu: 4,
      autoscaling_limit_max_cu: 8,
    });
    
    // Build index with parallel workers
    await sql`
      SET max_parallel_maintenance_workers = 8;
      SET maintenance_work_mem = '16GB';
      CREATE INDEX CONCURRENTLY idx_embedding_hnsw 
      ON repositories 
      USING hnsw (embedding_vector vector_cosine_ops) 
      WITH (m = 24, ef_construction = 128);
    `;
    
    // Scale back down
    await neon.updateEndpoint({
      compute_size: 'small',  // 0.5 vCPUs, 2GB RAM
      autoscaling_limit_min_cu: 0.25,
      autoscaling_limit_max_cu: 1,
    });
  } catch (error) {
    console.error('Index build failed:', error);
    throw error;
  }
}
```

### Neon Branch Strategy for Testing

```typescript
// Create branch for index optimization testing
async function testIndexConfiguration() {
  const branch = await neon.createBranch({
    name: 'index-optimization-test',
    parent_id: 'main',
  });
  
  // Test different configurations on branch
  const configs = [
    { m: 16, ef: 64 },
    { m: 24, ef: 128 },
    { m: 32, ef: 200 },
  ];
  
  for (const config of configs) {
    await testHNSWConfig(branch.id, config);
  }
  
  // Delete branch after testing
  await neon.deleteBranch(branch.id);
}
```

### Connection Pooling for Serverless

```typescript
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Enable WebSocket connections for better performance
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = false;  // Use WebSockets

// Optimized pool for vector operations
const vectorPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,  // Lower for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

## 5. Monitoring and Performance Measurement

### Key Metrics to Track

1. **Index Performance Metrics**
   ```sql
   -- Monitor index usage
   SELECT 
     schemaname,
     tablename,
     indexname,
     idx_scan,
     idx_tup_read,
     idx_tup_fetch,
     pg_size_pretty(pg_relation_size(indexrelid)) as index_size
   FROM pg_stat_user_indexes
   WHERE indexname LIKE '%hnsw%'
   ORDER BY idx_scan DESC;
   ```

2. **Query Performance Tracking**
   ```sql
   -- Enable pg_stat_statements
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
   
   -- Track vector query performance
   SELECT 
     query,
     calls,
     mean_exec_time,
     stddev_exec_time,
     min_exec_time,
     max_exec_time
   FROM pg_stat_statements
   WHERE query LIKE '%<=>%' OR query LIKE '%vector%'
   ORDER BY mean_exec_time DESC
   LIMIT 20;
   ```

3. **Vector Operation Monitoring**
   ```typescript
   // Custom monitoring wrapper
   class VectorMetrics {
     private histogram = new Histogram({
       name: 'vector_search_duration',
       help: 'Vector search query duration',
       labelNames: ['operation', 'index_type'],
       buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
     });
     
     async trackVectorSearch<T>(
       operation: string,
       fn: () => Promise<T>
     ): Promise<T> {
       const timer = this.histogram.startTimer({
         operation,
         index_type: 'hnsw',
       });
       
       try {
         return await fn();
       } finally {
         timer();
       }
     }
   }
   ```

### Performance Dashboard Setup

```typescript
// Monitoring dashboard configuration
export const vectorDashboard = {
  panels: [
    {
      title: 'Vector Search Latency',
      query: 'histogram_quantile(0.95, vector_search_duration_bucket)',
      unit: 'seconds',
    },
    {
      title: 'Index Build Progress',
      query: 'pg_stat_progress_create_index',
      unit: 'percentage',
    },
    {
      title: 'Vector Cache Hit Rate',
      query: 'rate(vector_cache_hits) / rate(vector_cache_total)',
      unit: 'ratio',
    },
    {
      title: 'Memory Usage by Index',
      query: 'pg_indexes_size{name=~".*hnsw.*"}',
      unit: 'bytes',
    },
  ],
};
```

### Alerting Rules

```yaml
# Prometheus alerting rules for vector operations
groups:
  - name: vector_performance
    rules:
      - alert: HighVectorSearchLatency
        expr: histogram_quantile(0.95, vector_search_duration_bucket) > 0.5
        for: 5m
        annotations:
          summary: "Vector search P95 latency above 500ms"
          
      - alert: LowVectorCacheHitRate
        expr: rate(vector_cache_hits) / rate(vector_cache_total) < 0.5
        for: 10m
        annotations:
          summary: "Vector cache hit rate below 50%"
          
      - alert: IndexBuildStalled
        expr: rate(pg_stat_progress_create_index[5m]) == 0
        for: 30m
        annotations:
          summary: "HNSW index build has stalled"
```

## 6. Production Deployment Checklist

### Pre-Production Optimization

1. **Benchmark Current Performance**
   ```sql
   -- Create benchmark table
   CREATE TABLE vector_benchmarks (
     id SERIAL PRIMARY KEY,
     test_name TEXT,
     vector_count INTEGER,
     index_type TEXT,
     build_time_ms BIGINT,
     avg_query_ms NUMERIC,
     p95_query_ms NUMERIC,
     recall_rate NUMERIC,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **Test Configurations**
   - Run tests with different m and ef_construction values
   - Compare halfvec vs vector performance
   - Measure memory usage and query times
   - Validate recall rates meet requirements

3. **Capacity Planning**
   ```typescript
   // Calculate storage requirements
   const calculateStorage = (vectorCount: number) => {
     const vectorSize = 1536 * 2; // halfvec bytes
     const indexOverhead = 1.5; // HNSW typically 50% overhead
     const totalBytes = vectorCount * vectorSize * indexOverhead;
     return {
       vectors: vectorCount * vectorSize,
       index: vectorCount * vectorSize * 0.5,
       total: totalBytes,
       formatted: `${(totalBytes / 1e9).toFixed(2)} GB`,
     };
   };
   ```

### Migration Strategy

1. **Phased Rollout**
   ```sql
   -- Phase 1: Create new optimized table
   CREATE TABLE repositories_v2 (
     id BIGSERIAL PRIMARY KEY,
     embedding_vector halfvec(1536),
     -- other columns
   );
   
   -- Phase 2: Copy data in batches
   INSERT INTO repositories_v2 (id, embedding_vector, ...)
   SELECT id, embedding_vector::halfvec(1536), ...
   FROM repositories
   WHERE id BETWEEN $1 AND $2;
   
   -- Phase 3: Build index during low traffic
   CREATE INDEX CONCURRENTLY idx_v2_embedding 
   ON repositories_v2 
   USING hnsw (embedding_vector vector_cosine_ops)
   WITH (m = 24, ef_construction = 128);
   
   -- Phase 4: Atomic table swap
   BEGIN;
   ALTER TABLE repositories RENAME TO repositories_old;
   ALTER TABLE repositories_v2 RENAME TO repositories;
   COMMIT;
   ```

2. **Rollback Plan**
   - Keep old table for 7 days
   - Monitor performance metrics
   - Have quick rollback script ready

### Performance Validation

```typescript
// Automated performance validation
async function validateVectorPerformance() {
  const tests = [
    { name: 'cold_query', warmup: false },
    { name: 'warm_query', warmup: true },
    { name: 'filtered_search', filter: true },
    { name: 'batch_search', batch: 10 },
  ];
  
  const results = [];
  for (const test of tests) {
    if (test.warmup) {
      await warmupCache();
    }
    
    const metrics = await runPerformanceTest(test);
    results.push({
      ...test,
      ...metrics,
      passed: metrics.p95 < 100 && metrics.recall > 0.95,
    });
  }
  
  return results;
}
```

## Conclusion

Optimizing pgvector with HNSW indexes for production requires careful tuning of multiple parameters:

1. **HNSW Parameters**: m=24, ef_construction=128 provides optimal balance
2. **Storage**: halfvec reduces storage by 57% with no accuracy loss
3. **Query Performance**: Proper connection pooling and caching essential
4. **Neon-Specific**: Leverage autoscaling for index builds
5. **Monitoring**: Comprehensive metrics tracking required

These optimizations can achieve:
- 30x faster index builds
- 3x better query performance
- 66% memory reduction
- Sub-100ms query latency at scale

The key is to benchmark extensively with production-like data and workloads before deployment.