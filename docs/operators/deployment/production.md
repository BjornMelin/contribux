# Production Deployment Guide

This guide covers the complete production deployment process for the contribux platform, including safety checks, monitoring, and rollback procedures.

## Production Environment Overview

### Infrastructure Components

- **Application**: Next.js 15 on Vercel with Edge Functions
- **Database**: Neon PostgreSQL main branch with connection pooling
- **Vector Search**: pgvector with HNSW indexes for AI-powered search
- **AI Integration**: OpenAI Agents SDK for intelligent contribution matching
- **Monitoring**: Real-time performance and health monitoring

### Production Configuration

```bash
NODE_ENV=production
DATABASE_URL=postgresql://neondb_owner:***@ep-summer-art-a864udht-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
MAINTENANCE_MODE=false
RATE_LIMIT_ENABLED=true
LOG_LEVEL=warn
```

## Pre-Deployment Checklist

### Code Quality Validation

```bash
# Run complete test suite
pnpm test

# Type checking
pnpm type-check

# Linting and formatting
pnpm lint
pnpm format

# Build verification
pnpm build
```

### Database Migration Validation

```bash
# Test migrations on staging branch
export DATABASE_URL=$DATABASE_URL_STAGING
pnpm db:migrate

# Validate migration performance
pnpm db:performance-report

# Test rollback procedures
pnpm db:rollback:test
```

### Security Validation

```bash
# Dependency vulnerability scan
pnpm audit

# Security configuration check
pnpm security:audit

# Environment variable validation
pnpm env:validate:prod
```

### Performance Baseline

```bash
# Current performance metrics
pnpm db:performance-baseline

# Vector search performance test
pnpm db:vector-performance

# Connection pool health
pnpm db:connection-health
```

## Production Deployment Process

### Step 1: Pre-Deployment Preparation

#### 1.1 Enable Maintenance Mode (if required)

```bash
# For major deployments requiring downtime
export MAINTENANCE_MODE=true
pnpm deploy:maintenance:enable

# Verify maintenance page is active
curl -I https://contribux.com
```

#### 1.2 Database Backup Verification

```bash
# Verify automatic backups are current
pnpm db:backup:verify

# Create manual backup point
pnpm db:backup:create --name "pre-deployment-$(date +%Y%m%d-%H%M)"
```

#### 1.3 Performance Monitoring Setup

```bash
# Start deployment monitoring
pnpm monitor:deployment:start

# Configure enhanced alerting
pnpm alerts:deployment:enable
```

### Step 2: Database Migration (if required)

#### 2.1 Apply Database Migrations

```bash
# Switch to production database
export DATABASE_URL=$DATABASE_URL

# Apply migrations with monitoring
pnpm db:migrate:prod --monitor

# Verify migration success
pnpm db:migration:verify
```

#### 2.2 Vector Index Optimization

```bash
# Rebuild vector indexes if needed
pnpm db:vector:optimize

# Update table statistics
pnpm db:analyze

# Verify search performance
pnpm db:vector:performance-test
```

### Step 3: Application Deployment

#### 3.1 Deploy Application Code

```bash
# Deploy via Vercel (typically triggered by Git push)
git push origin main

# Monitor deployment status
vercel --prod --confirm

# Verify deployment completion
pnpm deploy:verify:prod
```

#### 3.2 Configuration Update

```bash
# Apply new environment variables (if any)
vercel env add VARIABLE_NAME value --scope production

# Trigger redeployment if config changed
vercel --prod --force
```

### Step 4: Post-Deployment Validation

#### 4.1 Health Checks

```bash
# Application health check
curl -f https://contribux.com/api/health

# Database health check
pnpm db:health

# Vector search functionality test
pnpm test:vector-search:prod
```

#### 4.2 Performance Validation

```bash
# Response time validation
pnpm monitor:response-times

# Database performance check
pnpm db:performance-report

# Connection pool monitoring
pnpm db:connection-metrics
```

#### 4.3 Feature Validation

```bash
# User authentication test
pnpm test:auth:prod

# GitHub integration test
pnpm test:github-api:prod

# AI recommendation system test
pnpm test:ai-recommendations:prod
```

### Step 5: Monitoring and Alerting

#### 5.1 Enable Production Monitoring

```bash
# Start comprehensive monitoring
pnpm monitor:prod:enable

# Configure performance alerts
pnpm alerts:performance:configure

# Setup error rate monitoring
pnpm alerts:errors:configure
```

#### 5.2 Disable Maintenance Mode

```bash
# Disable maintenance mode
export MAINTENANCE_MODE=false
pnpm deploy:maintenance:disable

# Verify application accessibility
curl -f https://contribux.com
```

## Production Monitoring

### Key Performance Indicators (KPIs)

#### Application Performance

- **Response Time**: p95 < 200ms, p99 < 500ms
- **Error Rate**: < 0.1%
- **Availability**: > 99.9%
- **Throughput**: Monitor requests per second

#### Database Performance

- **Query Performance**: Average < 100ms, Slow queries < 1000ms
- **Connection Pool**: Utilization < 80%
- **Vector Search**: Search latency < 50ms
- **Index Performance**: HNSW efficiency > 95%

### Monitoring Commands

```bash
# Real-time performance monitoring
pnpm monitor:prod:realtime

# Generate performance report
pnpm monitor:prod:report

# Database performance monitoring
pnpm db:monitor:prod

# Vector search performance
pnpm vector:monitor:prod
```

### Alert Thresholds

#### Critical Alerts (Immediate Response)

- Application down (availability < 99%)
- Database connection failures
- Error rate > 1%
- Response time p95 > 1000ms

#### Warning Alerts (Monitor Closely)

- Response time p95 > 500ms
- Error rate > 0.5%
- Database connection pool > 80%
- Vector search latency > 100ms

#### Info Alerts (Trending Issues)

- Response time increase > 20%
- Database slow queries > 5 per hour
- Unusual traffic patterns
- Vector index efficiency decline

## Security Monitoring

### Security Checks

```bash
# Authentication system health
pnpm security:auth:check

# Rate limiting effectiveness
pnpm security:rate-limit:check

# JWT token security
pnpm security:jwt:validate

# Database security audit
pnpm security:db:audit
```

### Security Alerts

- Failed authentication attempts spike
- Rate limiting threshold breaches
- Unusual access patterns
- Database security violations

## Performance Optimization

### Database Optimization

```bash
# Optimize query performance
pnpm db:optimize:queries

# Vector index maintenance
pnpm db:vector:maintenance

# Connection pool optimization
pnpm db:optimize:connections

# Statistics update
pnpm db:analyze:tables
```

### Application Optimization

```bash
# Cache performance optimization
pnpm optimize:cache

# API endpoint performance tuning
pnpm optimize:api

# Vector search optimization
pnpm optimize:vector-search
```

## Rollback Procedures

### Emergency Rollback

```bash
# Immediate application rollback
vercel rollback --prod

# Database rollback (if needed)
pnpm db:rollback:emergency

# Verify rollback success
pnpm rollback:verify
```

### Gradual Rollback

```bash
# Enable maintenance mode
pnpm deploy:maintenance:enable

# Rollback database migrations
pnpm db:rollback --version=previous

# Rollback application code
vercel rollback --prod --confirm

# Disable maintenance mode
pnpm deploy:maintenance:disable
```

## Post-Deployment Tasks

### Immediate Tasks (0-2 hours)

- [ ] Verify all health checks passing
- [ ] Monitor error rates and response times
- [ ] Validate core functionality
- [ ] Check database performance metrics

### Short-term Tasks (2-24 hours)

- [ ] Monitor user experience metrics
- [ ] Analyze performance trends
- [ ] Review security logs
- [ ] Validate AI recommendation accuracy

### Long-term Tasks (1-7 days)

- [ ] Generate deployment success report
- [ ] Update documentation with lessons learned
- [ ] Plan next deployment improvements
- [ ] Review monitoring effectiveness

## Troubleshooting

### Common Issues

#### High Response Times

```bash
# Check database performance
pnpm db:slow-queries

# Analyze bottlenecks
pnpm analyze:performance-bottlenecks

# Check connection pool saturation
pnpm db:connection-analysis
```

#### Error Rate Spikes

```bash
# Check application logs
pnpm logs:errors:recent

# Database error analysis
pnpm logs:db:errors

# Vector search errors
pnpm logs:vector:errors
```

#### Database Issues

```bash
# Connection debugging
pnpm db:debug:connections

# Query performance analysis
pnpm db:debug:queries

# Vector index health
pnpm db:debug:vector-indexes
```

## Emergency Contacts

### Escalation Path

1. **DevOps Team**: First response team
2. **Platform Architect**: Technical escalation
3. **Engineering Manager**: Management escalation
4. **On-Call Engineer**: 24/7 emergency response

### Emergency Procedures

- **Severity 1**: Application down - immediate response required
- **Severity 2**: Performance degradation - response within 30 minutes
- **Severity 3**: Non-critical issues - response within 2 hours

## Success Criteria

### Deployment Success Metrics

- [ ] All health checks passing
- [ ] Error rate < 0.1%
- [ ] Response time p95 < 200ms
- [ ] Database performance within thresholds
- [ ] Vector search functionality working
- [ ] User authentication working
- [ ] AI recommendations functioning

### Business Success Metrics

- [ ] User engagement maintained or improved
- [ ] System availability > 99.9%
- [ ] Customer satisfaction metrics stable
- [ ] Revenue impact neutral or positive

This production deployment guide ensures safe, monitored, and successful deployments while maintaining high availability and performance standards.
