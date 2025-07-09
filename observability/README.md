# Contribux Observability Setup

This directory contains the observability stack configuration for the Contribux application,
providing comprehensive monitoring, tracing, and metrics collection.

## 🎯 Overview

The observability stack includes:

- **OpenTelemetry**: Distributed tracing and metrics collection
- **Jaeger**: Trace visualization and analysis
- **Prometheus**: Metrics storage and querying
- **Grafana**: Dashboard visualization
- **Health Checks**: System health monitoring API

## 🚀 Quick Start

### 1. Start the Observability Stack

```bash
# Start Jaeger, Prometheus, and Grafana
docker-compose -f docker-compose.observability.yml up -d

# Check services are running
docker-compose -f docker-compose.observability.yml ps
```

### 2. Start the Application

```bash
# Install dependencies (if not already done)
pnpm install

# Start the development server with instrumentation
pnpm dev
```

### 3. Access the Dashboards

- **Application**: <http://localhost:3000>
- **Observability Dashboard**: <http://localhost:3000/observability>
- **Jaeger UI**: <http://localhost:16686>
- **Prometheus**: <http://localhost:9090>
- **Grafana**: <http://localhost:3001> (admin/admin)

## 📊 Monitoring Endpoints

### Health Check API

```bash
# System-wide health check
curl http://localhost:3000/api/health

# Specific component health
curl http://localhost:3000/api/health?component=github
curl http://localhost:3000/api/health?component=database
curl http://localhost:3000/api/health?component=cache

# Prometheus format
curl http://localhost:3000/api/health?format=prometheus
```

### Metrics API

```bash
# Prometheus metrics
curl http://localhost:3000/api/metrics
```

## 🔍 Key Metrics

### GitHub API Metrics

- `github_api_calls_total`: Total GitHub API calls by operation and status
- `github_api_duration_ms`: GitHub API call duration histogram
- `github_rate_limit_remaining`: GitHub API rate limit remaining

### Database Metrics

- `database_operations_total`: Total database operations by type and status
- `database_operation_duration_ms`: Database operation duration histogram

### Vector Search Metrics

- `vector_search_operations_total`: Total vector search operations
- `vector_search_duration_ms`: Vector search duration histogram

### Cache Metrics

- `cache_operations_total`: Total cache operations by type
- `cache_hit_ratio`: Cache hit ratio gauge

### Health Metrics

- `contribux_component_health`: Component health status (1 = healthy, 0 = unhealthy)
- `contribux_system_health`: Overall system health status

## 🔧 Configuration

### Environment Variables

Add these to your `.env.local` for enhanced observability:

```env
# Jaeger configuration
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# OpenTelemetry configuration
OTEL_SERVICE_NAME=contribux
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Enable/disable instrumentation
OTEL_INSTRUMENTATION_HTTP_ENABLED=true
OTEL_INSTRUMENTATION_FS_ENABLED=false
```

### Custom Spans

Use the telemetry utilities in your code:

```typescript
import { createSpan, createGitHubSpan, telemetryLogger } from '@/lib/telemetry'

// Basic span
await createSpan('my-operation', async (span) => {
  span.setAttribute('custom.attribute', 'value')
  // Your code here
})

// GitHub API span with metrics
await createGitHubSpan('search_repositories', async (span) => {
  // GitHub API call
}, { 'github.query': 'your-query' })

// Enhanced logging with trace context
telemetryLogger.info('Operation completed', {
  operation: 'my-operation',
  duration: 123,
})
```

### Health Checks

Add custom health checks:

```typescript
import { checkSystemHealth } from '@/lib/telemetry/health'

const health = await checkSystemHealth()
console.log('System health:', health.overall)
```

## 📈 Grafana Dashboards

### Default Dashboard

The included dashboard shows:

- System health status
- GitHub API call rates and latencies
- Rate limit monitoring
- Error rates and patterns

### Custom Dashboards

1. Access Grafana at <http://localhost:3001>
2. Login with admin/admin
3. Create new dashboards using the Prometheus datasource
4. Use the metrics listed above for your panels

### Example Queries

```promql
# GitHub API error rate
rate(github_api_calls_total{status="error"}[5m]) / rate(github_api_calls_total[5m])

# 95th percentile API response time
histogram_quantile(0.95, rate(github_api_duration_ms_bucket[5m]))

# Database connection pool usage
database_connections_active / database_connections_max * 100
```

## 🚨 Alerting

### Prometheus Alerting Rules

Create `observability/alert_rules.yml`:

```yaml
groups:
  - name: contribux
    rules:
      - alert: HighErrorRate
        expr: rate(github_api_calls_total{status="error"}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High GitHub API error rate

      - alert: SystemUnhealthy
        expr: contribux_system_health == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: System health check failed
```

## 🔧 Troubleshooting

### Common Issues

1. **Traces not appearing in Jaeger**
   - Check that Jaeger is running: `docker-compose logs jaeger`
   - Verify JAEGER_ENDPOINT environment variable
   - Check application logs for OpenTelemetry errors

2. **Metrics not appearing in Prometheus**
   - Verify Prometheus can scrape the app: `curl http://localhost:3000/api/metrics`
   - Check Prometheus targets: <http://localhost:9090/targets>
   - Review Prometheus logs: `docker-compose logs prometheus`

3. **Grafana connection issues**
   - Verify datasource configuration in Grafana
   - Check network connectivity between containers
   - Review Grafana logs: `docker-compose logs grafana`

### Debug Commands

```bash
# Check application metrics
curl -s http://localhost:3000/api/metrics | grep github

# Check health status
curl -s http://localhost:3000/api/health | jq

# View container logs
docker-compose -f docker-compose.observability.yml logs -f

# Check Jaeger API
curl http://localhost:16686/api/services

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

## 🧹 Cleanup

```bash
# Stop observability stack
docker-compose -f docker-compose.observability.yml down

# Remove volumes (WARNING: This deletes all metrics data)
docker-compose -f docker-compose.observability.yml down -v
```

## 📚 Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
