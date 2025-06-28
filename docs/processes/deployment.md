# Deployment Guide

Comprehensive deployment guide for the Contribux platform covering environment setup, deployment process, and monitoring.

## Table of Contents

- [Environment Configuration](#environment-configuration)
- [Pre-deployment Checklist](#pre-deployment-checklist)
- [Deployment Process](#deployment-process)
- [Post-deployment Verification](#post-deployment-verification)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

## Environment Configuration

### Required Environment Variables

#### Authentication (Required)

```bash
# GitHub OAuth (required)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# NextAuth.js (required)
NEXTAUTH_SECRET=your_secure_secret_key  # min 32 characters
NEXTAUTH_URL=https://your-domain.com

# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/database
```

#### Optional Variables

```bash
# Google OAuth (optional but recommended)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Feature Flags
ENABLE_OAUTH=true

# Environment-specific Database URLs
DATABASE_URL_DEV=postgresql://user:pass@host:5432/dev_database
DATABASE_URL_TEST=postgresql://user:pass@host:5432/test_database
```

### OAuth Provider Configuration

#### GitHub App Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set Authorization callback URL: `https://your-domain.com/api/auth/callback/github`
4. Copy Client ID and Client Secret to environment variables

#### Google Cloud Console Setup (Optional)

1. Create new project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable Google+ API
3. Create OAuth 2.0 Client ID credentials
4. Set Authorized redirect URI: `https://your-domain.com/api/auth/callback/google`
5. Copy Client ID and Client Secret to environment variables

## Pre-deployment Checklist

### Code Quality

- [ ] All tests pass (`pnpm test`)
- [ ] Code follows TypeScript strict mode
- [ ] Biome linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm type-check`)
- [ ] No console.logs or debug code in production files

### Security

- [ ] All environment variables are properly configured
- [ ] Secrets are not committed to git
- [ ] OAuth callback URLs are configured correctly
- [ ] HTTPS is enforced for production
- [ ] NEXTAUTH_SECRET is cryptographically secure (32+ characters)

### Database

- [ ] Database migrations are ready
- [ ] Database connection is tested
- [ ] Vector search indexes are created
- [ ] Performance monitoring is configured

### Performance

- [ ] Bundle analysis completed (`pnpm build:analyze`)
- [ ] Memory optimization verified
- [ ] Database queries optimized
- [ ] CDN configuration ready (if applicable)

## Deployment Process

### 1. Build Application

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Verify build succeeded
pnpm start
```

### 2. Database Setup

```bash
# Run database migrations
pnpm db:migrate

# Verify database health
pnpm db:health

# Test database performance
pnpm db:performance-report
```

### 3. Environment Validation

```bash
# Validate all required environment variables
pnpm validate:env

# Test authentication flows
pnpm test:auth

# Test database connections
pnpm test:db
```

### 4. Deploy to Platform

#### Vercel Deployment (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
vercel env add NEXTAUTH_SECRET
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET
vercel env add DATABASE_URL
```

#### Docker Deployment

```bash
# Build Docker image
docker build -t contribux .

# Run container
docker run -p 3000:3000 \
  -e NEXTAUTH_SECRET=your_secret \
  -e GITHUB_CLIENT_ID=your_id \
  -e GITHUB_CLIENT_SECRET=your_secret \
  -e DATABASE_URL=your_db_url \
  contribux
```

## Post-deployment Verification

### Functional Testing

- [ ] Homepage loads correctly
- [ ] GitHub OAuth sign-in works
- [ ] Google OAuth sign-in works (if configured)
- [ ] API endpoints respond correctly
- [ ] Database queries execute successfully
- [ ] Search functionality works
- [ ] User sessions persist correctly

### Performance Testing

- [ ] Page load times are acceptable (<2s)
- [ ] API response times are fast (<500ms)
- [ ] Database queries are optimized (<100ms)
- [ ] Memory usage is within limits
- [ ] No memory leaks detected

### Security Verification

- [ ] HTTPS is enforced
- [ ] OAuth flows are secure
- [ ] Session cookies are secure
- [ ] CSRF protection is active
- [ ] Rate limiting is functional
- [ ] Audit logging is working

### Monitoring Setup

- [ ] Error tracking is configured
- [ ] Performance monitoring is active
- [ ] Database monitoring is working
- [ ] Security alerts are set up
- [ ] Backup procedures are tested

## Monitoring & Maintenance

### Error Monitoring

```bash
# Check application logs
pnpm logs:production

# Monitor error rates
pnpm monitor:errors

# Database health check
pnpm db:health
```

### Performance Monitoring

```bash
# Check memory usage
pnpm memory:check

# Database performance
pnpm db:performance-report

# Slow query analysis
pnpm db:slow-queries
```

### Security Monitoring

- Monitor authentication success/failure rates
- Track unusual account linking activity
- Watch for token refresh failures
- Review audit logs regularly

### Regular Maintenance

- [ ] Review and rotate OAuth client secrets monthly
- [ ] Update dependencies regularly
- [ ] Monitor for security updates
- [ ] Backup database regularly
- [ ] Review performance metrics weekly

### Database Maintenance

```bash
# Vector search optimization
pnpm db:vector-metrics

# Index analysis
pnpm db:indexes

# Table statistics update
pnpm db:analyze
```

## Troubleshooting

### Common Deployment Issues

#### Authentication Errors

**Problem**: OAuth sign-in fails
**Solutions**:

- Verify OAuth client credentials
- Check callback URL configuration
- Ensure NEXTAUTH_SECRET is set correctly
- Verify NEXTAUTH_URL matches deployment URL

#### Database Connection Issues

**Problem**: Cannot connect to database
**Solutions**:

- Verify DATABASE_URL format
- Check database server status
- Test connection from deployment environment
- Verify SSL/TLS configuration

#### Build Failures

**Problem**: Application fails to build
**Solutions**:

- Check TypeScript errors
- Verify all dependencies are installed
- Review environment variable requirements
- Check for missing files or imports

#### Performance Issues

**Problem**: Slow page loads or API responses
**Solutions**:

- Run performance analysis (`pnpm build:analyze`)
- Check database query performance
- Review memory usage patterns
- Optimize bundle size

### Environment-Specific Issues

#### Development Environment

```bash
# Reset development database
pnpm db:reset:dev

# Clear development cache
pnpm dev:clean

# Debug authentication
pnpm debug:auth
```

#### Production Environment

```bash
# Check production logs
pnpm logs:production

# Monitor production performance
pnpm monitor:performance

# Emergency rollback procedure
pnpm deploy:rollback
```

### Recovery Procedures

#### Database Recovery

```bash
# Restore from backup
pnpm db:restore

# Rebuild indexes
pnpm db:reindex

# Verify data integrity
pnpm db:verify
```

#### Application Recovery

```bash
# Rollback to previous version
vercel rollback

# Restart application
vercel redeploy

# Clear CDN cache
vercel cache:clear
```

## Best Practices

### Deployment Safety

1. **Always test in staging environment first**
2. **Use blue-green deployment strategy**
3. **Keep rollback procedures ready**
4. **Monitor during and after deployment**

### Security Best Practices

1. **Rotate secrets regularly**
2. **Use environment-specific secrets**
3. **Monitor for security vulnerabilities**
4. **Keep audit logs for compliance**

### Performance Best Practices

1. **Monitor resource usage continuously**
2. **Optimize database queries regularly**
3. **Use CDN for static assets**
4. **Implement proper caching strategies**

This deployment guide ensures a smooth, secure, and reliable deployment process for the Contribux platform.
