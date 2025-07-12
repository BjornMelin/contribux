# CI/CD Pipeline Setup Guide

This guide explains how to configure GitHub Secrets and environment variables for the Contribux CI/CD pipeline.

## Required GitHub Secrets

Configure these secrets in your GitHub repository under **Settings → Secrets and variables → Actions**:

### 🗄️ Neon Database Secrets

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `NEON_API_KEY` | Neon API key for branch operations | [Neon Console](https://console.neon.tech) → Account Settings → API Keys |
| `NEON_PROJECT_ID` | Your Neon project identifier | [Neon Console](https://console.neon.tech) → Project Settings → General |

### 🔐 Authentication Secrets

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `NEXTAUTH_SECRET` | NextAuth.js secret key | Generate with: `openssl rand -base64 32` |

### 📊 Optional Secrets (for enhanced features)

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `CODECOV_TOKEN` | Code coverage reporting | Optional |

## How to Configure Neon Secrets

### 1. Get Your Neon API Key

1. Visit [Neon Console](https://console.neon.tech)
2. Go to **Account Settings** → **API Keys**
3. Click **Create API Key**
4. Copy the generated key (starts with `neon_api_key_`)

### 2. Get Your Neon Project ID

1. In [Neon Console](https://console.neon.tech), select your project
2. Go to **Settings** → **General**
3. Copy the **Project ID** (format: `brave-hill-12345678`)

### 3. Add Secrets to GitHub

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:
   - Name: `NEON_API_KEY`
   - Value: Your Neon API key
   - Name: `NEON_PROJECT_ID`
   - Value: Your Neon project ID
   - Name: `NEXTAUTH_SECRET`
   - Value: Generated secret (run `openssl rand -base64 32`)

## CI/CD Pipeline Overview

The pipeline consists of two main jobs:

### 🧪 Test Job

- **Duration**: ~5-8 minutes
- **Purpose**: Unit, integration, and database tests
- **Neon Branch**: `ci-{run-id}-{attempt}`
- **Timeout**: 15 minutes total

### 🎭 E2E Job

- **Duration**: ~3-8 minutes
- **Purpose**: End-to-end browser tests
- **Neon Branch**: `e2e-{run-id}-{attempt}`
- **Timeout**: 10 minutes total

## Troubleshooting

### Common Issues

#### 1. Neon API Timeouts

**Error**: `curl: (28) Operation timed out`
**Solution**:

- Check Neon API status
- Verify API key permissions
- Network connectivity issues

#### 2. Database Connection Failures

**Error**: `Connection refused` or `Invalid connection string`
**Solution**:

- Verify `NEON_PROJECT_ID` is correct
- Check API key has branch creation permissions
- Ensure project exists and is active

#### 3. E2E Test Timeouts

**Error**: `Test timeout of 30000ms exceeded`
**Solution**:

- Check web server startup (should be < 60s)
- Verify database connectivity
- Review Playwright configuration

### Debug Commands

```bash
# Test Neon API connectivity locally
curl -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID"

# Validate environment variables
echo "API Key: ${NEON_API_KEY:0:20}..."
echo "Project ID: $NEON_PROJECT_ID"

# Test database connection
psql "$DATABASE_URL" -c "SELECT version();"
```

## Performance Optimizations

### CI Environment

- **Parallel Jobs**: Test and E2E run independently
- **Browser Optimization**: Only Chromium + Mobile Chrome in CI
- **Memory Management**: Reduced from 4GB to 2GB for CI
- **Timeout Optimization**: Reduced webserver timeout to 60s

### Retry Logic

- **Neon API**: 3 attempts with 10s backoff
- **Playwright**: 2 retries on failure
- **Test Execution**: 1-2 retries depending on test type

## Security Best Practices

✅ **Do**:

- Use GitHub Secrets for all sensitive data
- Rotate API keys regularly
- Use minimal permissions for API keys
- Monitor failed CI runs for potential issues

❌ **Don't**:

- Commit secrets to repository
- Share API keys in public channels
- Use production databases for CI
- Leave debug output enabled in production

## Monitoring

### Key Metrics to Watch

- **Branch Creation Time**: Should be < 30 seconds
- **Test Execution Time**: Should be < 10 minutes total
- **Build Success Rate**: Target > 95%
- **Database Cleanup**: All branches should be deleted

### Alerts

Monitor for:

- Repeated Neon API failures
- Long-running CI jobs (> 20 minutes)
- Database connection issues
- E2E test instability

## Workflow Files

- **Main**: `.github/workflows/test-with-neon.yml` (current)
- **Improved**: `.github/workflows/test-with-neon-improved.yml` (enhanced version)
- **Memory Check**: `.github/workflows/memory-check.yml` (memory profiling)

Switch to the improved workflow by renaming:

```bash
mv .github/workflows/test-with-neon.yml .github/workflows/test-with-neon-old.yml
mv .github/workflows/test-with-neon-improved.yml .github/workflows/test-with-neon.yml
```
