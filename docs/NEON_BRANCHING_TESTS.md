# Neon Branching for Test Isolation

This project uses Neon's database branching feature for test isolation, replacing traditional Docker-based test infrastructure. This provides faster, more reliable tests without requiring local Docker installation.

## Benefits of Neon Branching

- **No Docker Required**: Tests run without any local database setup
- **Instant Branch Creation**: Branches create in seconds, not minutes
- **Perfect Isolation**: Each test suite runs in its own database branch
- **Automatic Cleanup**: Branches are automatically deleted after tests
- **Cost Effective**: Branches pause when idle, minimizing costs
- **Production-Like**: Tests run against real Postgres, not mocks

## Setup

### 1. Get Neon Credentials

1. Sign up for a free account at [console.neon.tech](https://console.neon.tech)
2. Create a project or use an existing one
3. Get your API key from Account Settings → API Keys
4. Note your project ID from the project URL or settings

### 2. Configure Environment

Create a `.env.test` file:

```bash
# Copy from .env.test.example
cp .env.test.example .env.test
```

Fill in your Neon credentials:

```env
NEON_API_KEY=your-api-key-here
NEON_PROJECT_ID=your-project-id-here
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname
```

### 3. Run Tests

```bash
# Run all tests (uses Neon branching automatically)
pnpm test

# Run database-specific tests
pnpm test:db

# Run integration tests
pnpm test:integration

# List active test branches
pnpm neon:list-branches

# Clean up old test branches
pnpm neon:cleanup-test-branches
```

## How It Works

### Test Lifecycle

1. **Before All Tests**: A new Neon branch is created for the test suite
2. **Before Each Test**: Test data is cleaned/reset for isolation
3. **During Tests**: Tests run against the isolated branch
4. **After All Tests**: The branch is automatically deleted

### Branch Naming Convention

Test branches follow this naming pattern:
- `test-{suite-name}-{timestamp}` - For test suites
- `ci-{run-id}-{attempt}` - For CI/CD runs
- `e2e-{run-id}-{attempt}` - For E2E tests

### Code Example

```typescript
import { describe, it, expect } from 'vitest'
import { getTestSqlClient } from './neon-setup'

describe('My Database Tests', () => {
  const sql = getTestSqlClient()

  it('should query data in isolated branch', async () => {
    // This runs in a completely isolated database branch
    await sql`INSERT INTO users (name) VALUES ('Test User')`
    
    const users = await sql`SELECT * FROM users`
    expect(users).toHaveLength(1)
  })

  it('should not see data from other tests', async () => {
    // Each test has a clean slate
    const users = await sql`SELECT * FROM users`
    expect(users).toHaveLength(0)
  })
})
```

### Sub-Branches for Complex Scenarios

For tests that need even more isolation:

```typescript
import { withTestSubBranch } from './neon-setup'

it('should support sub-branches', async () => {
  await withTestSubBranch('my-scenario', async (connectionString) => {
    // This runs in a sub-branch of the test branch
    // Perfect for testing migrations or destructive operations
  })
  // Sub-branch is automatically cleaned up
})
```

## CI/CD Integration

The project includes GitHub Actions workflows that:

1. Create a Neon branch for each CI run
2. Run all tests against the isolated branch
3. Automatically clean up branches after tests
4. Support parallel test jobs with separate branches

Required GitHub Secrets:
- `NEON_API_KEY`: Your Neon API key
- `NEON_PROJECT_ID`: Your Neon project ID

## Migration from Docker

If you're migrating from Docker-based tests:

```bash
# Run the migration script
node scripts/migrate-to-neon-branching.js
```

This will:
- Remove Docker configuration files
- Update test setup files
- Create example environment files
- Update package.json scripts

## Best Practices

1. **Branch Lifecycle**: Let the test framework manage branch creation/deletion
2. **Naming**: Use descriptive branch names for debugging
3. **Cleanup**: Run `pnpm neon:cleanup-test-branches` periodically
4. **Costs**: Branches are free when paused, but active compute has costs
5. **Parallel Tests**: Each test file can have its own branch for true parallelism

## Troubleshooting

### Branch Creation Fails

- Check your API key and project ID
- Ensure you haven't hit branch limits for your plan
- Verify network connectivity to Neon

### Tests Can't Connect

- Ensure `DATABASE_URL` is set correctly
- Check if the branch was created successfully
- Verify SSL is enabled (`?sslmode=require`)

### Cleanup Issues

- Manually clean up branches: `pnpm neon:cleanup-test-branches`
- Check Neon console for stuck branches
- Ensure afterAll hooks are running

## Performance Tips

1. **Reuse Branches**: For local development, you can reuse a test branch
2. **Parallel Execution**: Run test files in parallel with separate branches
3. **Schema Caching**: The parent branch's schema is instantly available
4. **Connection Pooling**: Neon handles connection pooling automatically

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Branch Access**: Branches inherit security settings from the parent
3. **Data Isolation**: Each branch is completely isolated
4. **Cleanup**: Always clean up branches containing sensitive test data

## Costs

Neon pricing for branching:
- **Free Tier**: Includes 10 branches, perfect for development
- **Compute**: Only charged when branches are active
- **Storage**: Minimal due to copy-on-write technology
- **Idle Branches**: Automatically pause after 5 minutes of inactivity

For solo developers, the free tier is typically sufficient for all testing needs.