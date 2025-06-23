# GitHub Authentication Tests

This directory contains comprehensive tests for GitHub API authentication flows.

## Test Files

### `auth-integration.test.ts`
Unit tests for GitHub authentication flows that run with mocked responses. These tests verify:

- **Personal Access Token (PAT) Authentication**
  - Valid token authentication
  - Invalid token handling
  - Limited scope tokens
  - Token validation and error handling

- **GitHub App Authentication**
  - App configuration and JWT generation
  - Installation token exchange
  - Invalid credentials handling
  - Token expiration and refresh

- **OAuth Flow Simulation**
  - OAuth configuration
  - Token validation
  - Authentication header formatting

- **Token Management**
  - Token rotation strategies
  - Multi-token validation
  - Error recovery and retry logic

- **Rate Limiting**
  - REST API rate limits
  - GraphQL rate limits
  - Rate limit header parsing

- **Authentication Headers**
  - Proper header formatting
  - Context persistence across requests
  - Different authentication types

### `auth-flows.test.ts`
Integration tests that require real GitHub API credentials. These tests verify:

- Live API authentication flows
- Real rate limiting behavior
- Actual GitHub App JWT generation (if credentials provided)
- Installation token exchange (if app installed)
- OAuth token validation with GitHub

## Running Tests

### Unit Tests (Mocked)
```bash
# Run all authentication unit tests
pnpm test tests/github/auth-integration.test.ts

# Run specific test groups
pnpm test tests/github/auth-integration.test.ts -t "Personal Access Token"
pnpm test tests/github/auth-integration.test.ts -t "GitHub App"
pnpm test tests/github/auth-integration.test.ts -t "OAuth"
```

### Integration Tests (Real API)
```bash
# Set up environment variables first
export GITHUB_TEST_TOKEN="ghp_your_test_token"
export GITHUB_TEST_ORG="your-test-org"

# Optional GitHub App credentials
export GITHUB_APP_ID="123456"
export GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
export GITHUB_APP_INSTALLATION_ID="789"

# Run integration tests
pnpm test tests/integration/github/auth-flows.test.ts
```

## Environment Variables

### Required for Integration Tests
- `GITHUB_TEST_TOKEN` - GitHub Personal Access Token for testing
- `GITHUB_TEST_ORG` - GitHub organization for creating test repositories

### Optional for GitHub App Tests
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - GitHub App private key
- `GITHUB_APP_INSTALLATION_ID` - Installation ID for the app

### Test Configuration
- `GITHUB_TEST_REPO_PREFIX` - Prefix for test repositories (default: `contribux-test-`)
- `TEST_CLEANUP` - Whether to clean up test resources (default: `true`)
- `TEST_TIMEOUT` - Test timeout in milliseconds (default: `60000`)

## Test Features

### Authentication Methods Tested
1. **Personal Access Tokens**
   - Standard token authentication
   - Scope validation
   - Token expiration handling

2. **GitHub App Authentication**
   - JWT generation and validation
   - Installation token exchange
   - Multi-installation support

3. **OAuth Applications**
   - OAuth token validation
   - Client credential handling
   - Token refresh flows

### Error Scenarios Tested
- Invalid tokens
- Expired tokens
- Insufficient scopes
- Network timeouts
- Rate limiting
- Server errors (5xx)
- Authentication failures (401/403)

### Rate Limiting Tests
- REST API rate limits (5000/hour for PATs)
- GraphQL API rate limits (5000 points/hour)
- Secondary rate limits
- Rate limit header parsing
- Different limits for different auth types

### Retry Logic Tests
- Exponential backoff
- Circuit breaker patterns
- Transient failure recovery
- Network timeout handling
- Configurable retry strategies

## Best Practices

### For Unit Tests
- Use mocked responses with `nock`
- Test both success and failure scenarios
- Verify proper cleanup with `client.destroy()`
- Test authentication header formatting
- Validate rate limit header parsing

### For Integration Tests
- Use dedicated test tokens with minimal scopes
- Clean up test resources automatically
- Handle rate limiting gracefully
- Test with real GitHub App credentials when available
- Monitor test execution time and API usage

### Token Security
- Never commit real tokens to version control
- Use environment variables for credentials
- Rotate test tokens regularly
- Use minimal required scopes
- Monitor token usage and rate limits

## Troubleshooting

### Common Issues
1. **Tests skipped**: Missing environment variables
2. **Rate limited**: Too many test runs, wait for reset
3. **Authentication failures**: Invalid or expired tokens
4. **Network timeouts**: GitHub API temporary issues

### Debug Mode
```bash
# Enable verbose logging
export LOG_GITHUB_RATE_LIMITS=true
export DEBUG_TESTS=true

# Run with detailed output
pnpm test tests/github/auth-integration.test.ts --reporter=verbose
```

### Test Data Cleanup
```bash
# Manual cleanup of test repositories
pnpm test:cleanup

# Check remaining test resources
pnpm test tests/integration/github/auth-flows.test.ts --run --reporter=verbose
```