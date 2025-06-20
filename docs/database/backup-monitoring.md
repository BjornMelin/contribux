# Backup and Monitoring Strategy

## Neon Built-in Backup Features

Neon PostgreSQL provides comprehensive backup capabilities built into the platform:

### Automatic Daily Backups
- **Frequency**: Daily automatic backups
- **Retention**: 30 days by default (configurable)
- **Storage**: Cross-region backup storage
- **Recovery**: Point-in-time recovery (PITR) available

### Branch-Based Backup Strategy
Each database branch serves as a backup point:
- **Main Branch**: Production data with daily backups
- **Development Branch**: Safe testing environment
- **Testing Branch**: CI/CD and automated testing

### Creating Manual Backup Branches
```bash
# Create a backup branch from current main
neon branches create \
  --project-id soft-dew-27794389 \
  --name "backup-$(date +%Y%m%d-%H%M)" \
  --parent br-summer-art-a864udht

# List all backup branches
neon branches list --project-id soft-dew-27794389
```

## Database Monitoring Configuration

### Key Performance Metrics

#### 1. Connection Pool Monitoring
- **Active Connections**: Monitor connection utilization
- **Pool Saturation**: Alert when approaching limits
- **Connection Errors**: Track failed connections

#### 2. Query Performance
- **Slow Query Detection**: Queries > 1000ms execution time
- **Query Frequency**: High-frequency operations
- **Execution Plans**: Monitor query plan changes

#### 3. Vector Search Performance
- **HNSW Index Usage**: Index scan frequency and efficiency
- **Search Latency**: Vector similarity search response times
- **Index Memory Usage**: halfvec memory optimization tracking

#### 4. Storage and Index Metrics
- **Table Growth**: Monitor table size increases
- **Index Efficiency**: Track index usage statistics
- **Disk Space**: Storage utilization trends

### Monitoring Scripts

#### Daily Health Check
```bash
#\!/bin/bash
# daily-health-check.sh

echo "🔍 Running daily database health check..."

# Test connection
npm run db:test-connection

# Generate performance report
node -e "
const { DatabaseMonitor } = require('./src/lib/monitoring/database-monitor');
const monitor = new DatabaseMonitor(process.env.DATABASE_URL);
monitor.generatePerformanceReport().then(report => {
  console.log(report);
  // Optionally send to monitoring service
});
"

echo "✅ Health check completed"
```

#### Performance Monitoring
```bash
#\!/bin/bash
# performance-monitor.sh

echo "📊 Collecting performance metrics..."

# Check slow queries
node -e "
const { DatabaseMonitor } = require('./src/lib/monitoring/database-monitor');
const monitor = new DatabaseMonitor(process.env.DATABASE_URL);
monitor.getSlowQueries(10).then(queries => {
  if (queries.length > 0) {
    console.log('⚠️  Slow queries detected:');
    queries.forEach(q => console.log(`- ${q.query.substring(0, 100)}... (${Math.round(q.mean_exec_time)}ms)`));
  } else {
    console.log('✅ No slow queries found');
  }
});
"

# Check vector index performance
node -e "
const { DatabaseMonitor } = require('./src/lib/monitoring/database-monitor');
const monitor = new DatabaseMonitor(process.env.DATABASE_URL);
monitor.getVectorIndexMetrics().then(metrics => {
  console.log('🔍 Vector Index Performance:');
  metrics.forEach(idx => console.log(`- ${idx.indexname}: ${idx.index_size}, ${idx.scans_count} scans`));
});
"
```

### Alerting Configuration

#### Critical Alerts (Immediate Response)
- Database connection failures
- Query execution time > 10 seconds
- Connection pool saturation (>90%)
- Disk space usage > 85%

#### Warning Alerts (Monitor Closely)
- Query execution time > 5 seconds
- Connection pool usage > 75%
- High number of slow queries (>10 per hour)
- Vector index efficiency degradation

#### Example Alert Script
```bash
#\!/bin/bash
# alert-check.sh

# Check connection pool usage
ACTIVE_CONNECTIONS=$(node -e "
const { DatabaseMonitor } = require('./src/lib/monitoring/database-monitor');
const monitor = new DatabaseMonitor(process.env.DATABASE_URL);
monitor.getConnectionMetrics().then(metrics => console.log(metrics.active));
")

if [ "$ACTIVE_CONNECTIONS" -gt 18 ]; then
  echo "🚨 ALERT: High connection usage - $ACTIVE_CONNECTIONS/20 connections active"
  # Send to alerting system (Slack, email, etc.)
fi

# Check for slow queries
SLOW_QUERY_COUNT=$(node -e "
const { DatabaseMonitor } = require('./src/lib/monitoring/database-monitor');
const monitor = new DatabaseMonitor(process.env.DATABASE_URL);
monitor.getSlowQueries().then(queries => console.log(queries.length));
")

if [ "$SLOW_QUERY_COUNT" -gt 5 ]; then
  echo "⚠️  WARNING: $SLOW_QUERY_COUNT slow queries detected"
fi
```

## Integration with External Services

### Application Performance Monitoring (APM)
Integrate with services like:
- **DataDog**: Database performance monitoring
- **New Relic**: Application and database insights
- **Prometheus + Grafana**: Custom metrics dashboards

### Log Aggregation
- **Structured Logging**: JSON format for easy parsing
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Query Logging**: Log slow queries and errors

### Example Monitoring Integration
```typescript
// src/lib/monitoring/apm-integration.ts
import { DatabaseMonitor } from './database-monitor';

export class APMIntegration {
  private monitor: DatabaseMonitor;

  constructor(connectionString: string) {
    this.monitor = new DatabaseMonitor(connectionString);
  }

  async collectMetrics() {
    const [
      connectionMetrics,
      slowQueries,
      vectorMetrics,
      healthCheck
    ] = await Promise.all([
      this.monitor.getConnectionMetrics(),
      this.monitor.getSlowQueries(),
      this.monitor.getVectorIndexMetrics(),
      this.monitor.checkDatabaseHealth()
    ]);

    // Send to APM service
    const metrics = {
      timestamp: Date.now(),
      database: {
        connections: connectionMetrics,
        health: healthCheck.status,
        slowQueryCount: slowQueries.length,
        vectorIndexCount: vectorMetrics.length
      }
    };

    // Example: Send to DataDog, New Relic, etc.
    // await this.sendToAPM(metrics);
    
    return metrics;
  }
}
```

## Disaster Recovery Procedures

### 1. Database Corruption Recovery
```bash
# Create recovery branch from latest backup
neon branches create \
  --project-id soft-dew-27794389 \
  --name "recovery-$(date +%Y%m%d)" \
  --parent br-summer-art-a864udht

# Verify data integrity
npm run db:test-connection
```

### 2. Point-in-Time Recovery
```bash
# Restore to specific timestamp
neon branches create \
  --project-id soft-dew-27794389 \
  --name "pitr-recovery" \
  --parent br-summer-art-a864udht \
  --timestamp "2024-01-01T12:00:00Z"
```

### 3. Cross-Region Failover
Neon provides cross-region backup storage. In case of regional failure:
1. Access backup from alternative region
2. Create new project in available region
3. Restore from cross-region backup
4. Update application connection strings

## Maintenance Procedures

### Weekly Maintenance
- Review slow query reports
- Analyze index usage statistics
- Check connection pool metrics
- Update table statistics (`ANALYZE`)

### Monthly Maintenance
- Review storage usage trends
- Optimize or rebuild underused indexes
- Performance baseline comparison
- Backup retention policy review

### Quarterly Maintenance
- Full performance audit
- Disaster recovery testing
- Security audit and access review
- Capacity planning assessment

## Monitoring Dashboard Setup

### Key Dashboards

#### 1. Database Health Dashboard
- Connection status indicator
- Query performance trends
- Error rate monitoring
- Resource utilization

#### 2. Vector Search Dashboard
- HNSW index performance
- Search latency metrics
- Index memory usage
- Query accuracy tracking

#### 3. Application Integration Dashboard
- API response times
- Database query distribution
- User activity correlation
- Feature usage analytics

### Example Grafana Configuration
```json
{
  "dashboard": {
    "title": "Neon PostgreSQL Monitoring",
    "panels": [
      {
        "title": "Connection Pool Usage",
        "type": "graph",
        "targets": [
          {
            "query": "active_connections",
            "refId": "A"
          }
        ]
      },
      {
        "title": "Query Performance",
        "type": "graph", 
        "targets": [
          {
            "query": "avg_query_time",
            "refId": "B"
          }
        ]
      }
    ]
  }
}
```
