# Troubleshooting Guide

Common issues and solutions for developing with contribux.

## Quick Diagnostics

### Health Check Commands

```bash
# Run comprehensive health check
pnpm diagnose

# Check specific components
pnpm db:health                     # Database connectivity
pnpm type-check                    # TypeScript issues
pnpm lint                          # Code quality issues
pnpm test                          # Test failures
```

### System Requirements Check

```bash
# Verify versions
node --version                     # Should be 18+
pnpm --version                     # Should be 10.11.1+
git --version                      # Should be 2.0+

# Check environment variables
echo $DATABASE_URL_DEV
echo $OPENAI_API_KEY
echo $GITHUB_TOKEN
```

## Common Issues and Solutions

### Installation and Setup Issues

#### Problem: pnpm not found

```bash
# Error
bash: pnpm: command not found

# Solution
npm install -g pnpm@10.11.1

# Verify installation
pnpm --version
```

#### Problem: TypeScript errors after installation

```bash
# Error
TS2307: Cannot find module '@/lib/utils'

# Solution
# Clear cache and reinstall
pnpm clean
pnpm install

# Check TypeScript configuration
pnpm type-check

# Verify path mapping in tsconfig.json
cat tsconfig.json | grep -A 5 paths
```

#### Problem: Environment variables not loading

```bash
# Error
Error: DATABASE_URL is not defined

# Solution
# Check environment file exists
ls -la .env.local

# Verify variable format (no spaces around =)
# ✅ Good: DATABASE_URL="postgresql://..."
# ❌ Bad: DATABASE_URL = "postgresql://..."

# Check Next.js environment variable rules
# Use NEXT_PUBLIC_ prefix for client-side variables
```

### Database Issues

#### Problem: Database connection timeout

```bash
# Error
Error: Connection timeout after 5000ms

# Diagnosis
pnpm db:test-connection

# Solutions
# 1. Check network connectivity
ping your-neon-host.com

# 2. Verify connection string format
echo $DATABASE_URL_DEV

# 3. Test with different environment
pnpm db:test-prod

# 4. Check Neon dashboard for database status
```

#### Problem: Vector search queries fail

```bash
# Error
ERROR: operator does not exist: halfvec <=> halfvec

# Solution
# Ensure pgvector extension is installed
pnpm db:health

# Check if vector columns exist
psql $DATABASE_URL_DEV -c "\d repositories"

# Verify HNSW indexes
psql $DATABASE_URL_DEV -c "\di"
```

#### Problem: Migration failures

```bash
# Error
Migration failed: relation "users" already exists

# Solution
# Check migration status
pnpm db:migrate:status

# Reset to clean state (CAUTION: Development only)
pnpm db:reset
pnpm db:migrate

# Or rollback specific migration
pnpm db:migrate:rollback
```

### Development Server Issues

#### Problem: Development server won't start

```bash
# Error
Error: Port 3000 is already in use

# Solution
# Find process using port
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 pnpm dev
```

#### Problem: Hot reload not working

```bash
# Error
Changes not reflecting in browser

# Solutions
# 1. Clear Next.js cache
rm -rf .next
pnpm dev

# 2. Check file permissions
ls -la src/

# 3. Restart development server
pkill -f "next dev"
pnpm dev

# 4. Clear browser cache
# Hard refresh: Ctrl+Shift+R (Linux/Windows) or Cmd+Shift+R (Mac)
```

#### Problem: Memory issues during development

```bash
# Error
JavaScript heap out of memory

# Solution
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" pnpm dev

# Or add to package.json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--max-old-space-size=4096' next dev"
  }
}
```

### Testing Issues

#### Problem: Tests failing with import errors

```bash
# Error
Cannot resolve module '@/lib/utils'

# Solution
# Check vitest.config.ts alias configuration
cat vitest.config.ts | grep -A 10 alias

# Ensure alias matches tsconfig.json
# Update vitest.config.ts
resolve: {
  alias: {
    '@': resolve(__dirname, './src'),
  },
}
```

#### Problem: Database tests failing

```bash
# Error
Connection terminated unexpectedly

# Solution
# Check test database connection
pnpm db:test-connection

# Verify test environment variables
echo $DATABASE_URL_TEST

# Use separate test database
# Create test-specific database in Neon
# Update .env.local with DATABASE_URL_TEST
```

#### Problem: MSW handlers not working

```bash
# Error
Network request failed in tests

# Solution
# Check MSW setup in tests/setup.ts
# Ensure server.listen() is called before tests
# Verify handlers are properly exported

# Debug MSW
server.use(
  http.all('*', ({ request }) => {
    console.log('Intercepted:', request.method, request.url);
    return passthrough();
  })
);
```

#### Problem: Test coverage below threshold

```bash
# Error
Coverage below 90% threshold

# Solution
# Identify uncovered code
pnpm test:coverage
open coverage/index.html

# Add meaningful tests (not coverage-driven)
# Focus on realistic scenarios
# Test error handling and edge cases

# Check for dead code to remove
# Use coverage report to find genuine gaps
```

### Code Quality Issues

#### Problem: Linting errors

```bash
# Error
Unexpected token '{'

# Solution
# Auto-fix common issues
pnpm lint:fix

# Check Biome configuration
cat biome.json

# Format code
pnpm format

# For persistent issues, check file encoding
file -bi src/problematic-file.ts
```

#### Problem: TypeScript strict mode errors

```bash
# Error
Object is possibly 'undefined'

# Solution
# Use proper null checking
// ❌ Bad
user.email.toLowerCase()

// ✅ Good
user.email?.toLowerCase()
user.email && user.email.toLowerCase()

# Use type guards
if (user && user.email) {
  user.email.toLowerCase()
}

# Update tsconfig.json if needed (not recommended)
"strictNullChecks": false  // Only as last resort
```

### API Integration Issues

#### Problem: GitHub API rate limiting

```bash
# Error
API rate limit exceeded

# Solution
# Check rate limit status
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Implement proper rate limiting
export class GitHubRateLimiter {
  async waitForAvailability() {
    // Implementation with exponential backoff
  }
}

# Use conditional requests with ETags
headers: {
  'If-None-Match': lastETag,
}
```

#### Problem: OpenAI API errors

```bash
# Error
Invalid API key provided

# Solution
# Check API key format
echo $OPENAI_API_KEY | cut -c1-7  # Should start with "sk-"

# Test API connectivity
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check usage limits in OpenAI dashboard
```

### Performance Issues

#### Problem: Slow database queries

```bash
# Error
Query execution time > 1000ms

# Diagnosis
pnpm db:slow-queries
pnpm db:performance-report

# Solutions
# 1. Check index usage
pnpm db:index-usage

# 2. Analyze query plans
EXPLAIN ANALYZE SELECT ...

# 3. Update table statistics
pnpm db:analyze

# 4. Optimize vector search
# Use pre-filtering before similarity calculation
WHERE stars >= 100 AND (1 - (embedding <=> $1)) >= 0.7
```

#### Problem: Large bundle size

```bash
# Error
Bundle size exceeds limits

# Diagnosis
pnpm build:analyze

# Solutions
# 1. Check for duplicate dependencies
pnpm analyze:duplicates

# 2. Use dynamic imports
const HeavyComponent = dynamic(() => import('./HeavyComponent'));

# 3. Remove unused dependencies
pnpm depcheck

# 4. Optimize images and assets
# Use Next.js Image optimization
import Image from 'next/image';
```

#### Problem: Memory leaks

```bash
# Error
Memory usage continuously increasing

# Diagnosis
# Monitor memory in development
NODE_OPTIONS="--inspect" pnpm dev
# Open chrome://inspect

# Solutions
# 1. Clean up event listeners
useEffect(() => {
  const handler = () => {};
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);

# 2. Cancel pending requests
useEffect(() => {
  const controller = new AbortController();
  fetch('/api/data', { signal: controller.signal });
  return () => controller.abort();
}, []);

# 3. Clear timers and intervals
useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);
}, []);
```

### AI Assistant Issues

#### Problem: Task Master AI commands fail

```bash
# Error
task-master: command not found

# Solution
# Install globally
pnpm add -g @taskmaster/cli

# Or use through pnpm
pnpm exec task-master init

# Check project root
task-master --project-root=/absolute/path/to/project
```

#### Problem: Task expansion fails

```bash
# Error
Failed to expand task: AI service unavailable

# Solution
# Check API keys
echo $OPENAI_API_KEY

# Try without research mode
task-master expand --id=1 --no-research

# Check network connectivity
curl -I https://api.openai.com

# Use fallback approach
# Manually break down complex tasks
```

#### Problem: Task dependencies corruption

```bash
# Error
Circular dependency detected

# Solution
# Validate and fix dependencies
task-master validate-dependencies
task-master fix-dependencies

# Reset if needed
rm .taskmaster/tasks/tasks.json
task-master init
task-master parse-prd
```

## Advanced Troubleshooting

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Development server
DEBUG=* pnpm dev

# Tests
DEBUG=vitest* pnpm test

# Database operations
DEBUG=pg* pnpm db:health

# Next.js
DEBUG=next* pnpm build
```

### Log Analysis

```bash
# Application logs
tail -f .next/server.log

# Database logs (if available)
pnpm db:logs

# System logs
journalctl -f  # Linux
tail -f /var/log/system.log  # macOS
```

### Performance Profiling

```bash
# Profile build process
pnpm build --profile

# Profile development server
NODE_OPTIONS="--prof" pnpm dev

# Profile tests
pnpm test --reporter=verbose
```

### Network Debugging

```bash
# Test API connectivity
curl -v https://api.github.com/rate_limit

# Check DNS resolution
nslookup your-database-host.com

# Test database connectivity
telnet your-database-host.com 5432

# Monitor network requests
# Use browser dev tools or tools like:
mitmproxy
wireshark
```

## Recovery Procedures

### Emergency Reset

Complete project reset (use with caution):

```bash
# Backup current state
git stash
git branch backup-$(date +%Y%m%d-%H%M%S)

# Clean everything
pnpm clean:all
rm -rf node_modules .next .taskmaster

# Fresh install
pnpm install
pnpm setup:dev

# Restore from backup if needed
git stash pop
```

### Database Recovery

```bash
# Create backup
pnpm db:backup

# Reset to clean state (DEVELOPMENT ONLY)
pnpm db:reset
pnpm db:migrate
pnpm db:seed

# Restore from backup
pnpm db:restore backup-file.sql
```

### Configuration Recovery

```bash
# Reset configuration files
git checkout HEAD -- tsconfig.json
git checkout HEAD -- biome.json
git checkout HEAD -- vitest.config.ts

# Verify configuration
pnpm type-check
pnpm lint
pnpm test
```

## Getting Help

### Self-Service Resources

1. **Documentation**: Check relevant docs section first
2. **Command reference**: `pnpm help` or check [Commands Reference](./commands.md)
3. **Logs**: Enable debug mode and check logs
4. **GitHub Issues**: Search existing issues

### Diagnostic Information

When reporting issues, include:

```bash
# System information
node --version
pnpm --version
git --version
uname -a  # Linux/macOS
systeminfo  # Windows

# Project information
pnpm diagnose
cat package.json | grep version
git status
git log --oneline -5

# Error information
# Copy full error message
# Include stack trace
# Note steps to reproduce
```

### Issue Templates

Use these templates when reporting problems:

#### **Bug Report**

```markdown
## Bug Description

Clear description of the issue

## Steps to Reproduce

1. Step one
2. Step two
3. Error occurs

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Environment

- Node.js version: X.X.X
- pnpm version: X.X.X
- OS: Operating System
- Browser: (if applicable)

## Additional Context

- Error logs
- Screenshots
- Related issues
```

### **Performance Issue**

```markdown
## Performance Issue

Description of slow operation

## Metrics

- Operation time: X seconds
- Memory usage: X MB
- Query execution time: X ms

## Profiling Data

Include relevant profiling output

## Environment

System specifications and configuration
```

This troubleshooting guide covers the most common issues developers encounter when working with contribux. For issues not covered here, check the specific documentation sections or create a GitHub issue with detailed information.
