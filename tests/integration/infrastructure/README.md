# Integration Test Reporting and Metrics System

This comprehensive test reporting system provides advanced metrics collection, performance analysis, and automated quality gates for integration tests.

## Features

- **Custom Vitest Reporter**: Comprehensive test reporting with metrics integration
- **Performance Analysis**: Automated performance regression detection and baseline comparison
- **Metrics Collection**: API call tracking, cache performance, memory usage, and rate limiting
- **Quality Gates**: Automated test quality validation with configurable thresholds
- **HTML Reports**: Rich, interactive HTML reports with charts and visualizations
- **CI/CD Integration**: JSON exports and automated alerting for continuous integration
- **Performance Baselines**: Trend tracking and regression detection over time

## Quick Start

### Running Integration Tests

```bash
# Run all integration tests with full reporting
pnpm test:integration

# Run in CI mode with optimized settings
pnpm test:integration:ci

# Run in watch mode for development
pnpm test:integration:watch

# Check test status and recent results
pnpm test:integration:status
```

### Analyzing Performance

```bash
# Analyze performance from latest test run
pnpm test:integration:analyze

# Generate HTML report
pnpm test:integration:report

# Clean up old reports and artifacts
pnpm test:integration:cleanup
```

## Configuration

### Environment Variables

Create a `.env.test` file or set these environment variables:

```bash
# Required
GITHUB_TEST_TOKEN=your_github_personal_access_token
GITHUB_TEST_ORG=your_test_organization

# Optional
GITHUB_TEST_REPO_PREFIX=contribux-test-
TEST_TIMEOUT=60000
TEST_CONCURRENCY=3
METRICS_ENABLED=true
MEMORY_PROFILING=true
```

### Quality Gates

Default quality gates are configured in the reporter. You can customize them:

```typescript
const config: TestSuiteConfig = {
  qualityGates: [
    {
      name: 'Test Success Rate',
      type: 'coverage',
      threshold: 95,
      operator: 'gte',
      description: 'At least 95% of tests must pass'
    },
    {
      name: 'Average Test Duration',
      type: 'performance',
      threshold: 3000,
      operator: 'lt',
      description: 'Average test duration should be under 3 seconds'
    },
    {
      name: 'Cache Hit Rate',
      type: 'metrics',
      threshold: 0.85,
      operator: 'gte',
      description: 'Cache hit rate should be at least 85%'
    }
  ]
}
```

## Architecture

### Core Components

1. **MetricsCollector** (`metrics-collector.ts`)
   - Collects API call metrics, cache performance, memory usage
   - Tracks rate limiting and provides aggregated statistics

2. **IntegrationTestReporter** (`reporter.ts`)
   - Custom Vitest reporter with metrics integration
   - Generates JSON and HTML reports
   - Evaluates quality gates and provides CI feedback

3. **PerformanceAnalyzer** (`performance-analyzer.ts`)
   - Compares performance against baselines
   - Detects regressions and improvements
   - Provides automated recommendations

4. **TestSuiteRunner** (`test-suite-runner.ts`)
   - Orchestrates test execution with reporting
   - Handles CI/CD integration and alerting
   - Manages artifacts and cleanup

### Directory Structure

```
tests/integration/
├── infrastructure/
│   ├── metrics-collector.ts       # Metrics collection
│   ├── reporter.ts                # Custom Vitest reporter
│   ├── performance-analyzer.ts    # Performance analysis
│   ├── test-suite-runner.ts       # Test orchestration
│   ├── test-config.ts             # Configuration and types
│   ├── cli.ts                     # Command-line interface
│   ├── global-setup.ts            # Global test setup
│   ├── global-teardown.ts         # Global test cleanup
│   └── README.md                  # This documentation
├── github/                        # GitHub-specific tests
│   ├── api-comprehensive.test.ts  # Example comprehensive test
│   └── ...
└── reports/                       # Generated reports
    ├── baselines/                 # Performance baselines
    ├── coverage/                  # Coverage reports
    ├── latest-report.json         # Latest test report
    ├── latest-report.html         # Latest HTML report
    └── ...
```

## Usage Examples

### Basic Test with Metrics

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { MetricsCollector } from '../infrastructure/test-config'

const metricsCollector: MetricsCollector = globalThis.__INTEGRATION_METRICS_COLLECTOR__

describe('API Performance Tests', () => {
  let startTime: number

  beforeEach(() => {
    startTime = Date.now()
  })

  afterEach(() => {
    const duration = Date.now() - startTime
    if (metricsCollector) {
      metricsCollector.recordApiCall('test-execution', duration, 200)
    }
  })

  it('should handle API calls efficiently', async () => {
    const testStart = Date.now()
    
    // Your test code here
    const response = await apiCall()
    
    const duration = Date.now() - testStart
    expect(duration).toBeLessThan(5000)
    
    if (metricsCollector) {
      metricsCollector.recordApiCall('/api/endpoint', duration, response.status)
      metricsCollector.recordCacheHit('cache-key')
    }
  })
})
```

### Custom Test Configuration

```typescript
import { createTestSuiteRunner } from './infrastructure/test-suite-runner'

const runner = createTestSuiteRunner({
  testPattern: 'tests/integration/github/**/*.test.ts',
  timeout: 120000,
  retries: 1,
  coverage: true,
  qualityGates: [
    {
      name: 'Custom Success Rate',
      type: 'coverage',
      threshold: 90,
      operator: 'gte',
      description: 'Custom success threshold'
    }
  ],
  alerting: {
    slack: {
      webhook: process.env.SLACK_WEBHOOK_URL,
      channel: '#ci-alerts'
    }
  }
})

const result = await runner.runTestSuite()
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      
      - name: Run Integration Tests
        run: pnpm test:integration:ci
        env:
          GITHUB_TEST_TOKEN: ${{ secrets.GITHUB_TEST_TOKEN }}
          GITHUB_TEST_ORG: ${{ vars.GITHUB_TEST_ORG }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
      
      - name: Upload Test Reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-reports
          path: tests/integration/reports/
```

### Performance Monitoring

The system automatically tracks performance trends and will:

1. **Detect Regressions**: Identify when tests become slower or use more memory
2. **Update Baselines**: Automatically update performance baselines for stable runs
3. **Generate Alerts**: Send notifications for critical performance issues
4. **Provide Recommendations**: Suggest specific optimizations based on metrics

### Reports and Artifacts

Generated reports include:

- **JSON Reports**: Machine-readable test results for CI/CD integration
- **HTML Reports**: Interactive reports with charts and detailed analysis
- **Coverage Reports**: Code coverage with integration-specific thresholds
- **Performance Analysis**: Trend analysis and regression detection
- **Metrics Exports**: Raw metrics data for external analysis

## Troubleshooting

### Common Issues

1. **Tests Timing Out**
   - Increase timeout in configuration
   - Check network connectivity
   - Verify GitHub token permissions

2. **Memory Issues**
   - Enable garbage collection with `--expose-gc`
   - Check for memory leaks in test code
   - Increase Node.js memory limit

3. **Rate Limiting**
   - Use test tokens with higher rate limits
   - Implement proper test data cleanup
   - Add delays between API calls

### Debug Mode

Run tests with debug output:

```bash
DEBUG=test:* pnpm test:integration
```

### Manual Analysis

```bash
# Analyze specific report file
pnpm test:integration:analyze --input reports/test-report-2024-01-01.json

# Generate HTML from JSON report
pnpm test:integration:report --input reports/latest-report.json --output custom-report.html
```

## Advanced Features

### Custom Metrics

```typescript
// Record custom performance metrics
metricsCollector.recordApiCall('custom-endpoint', duration, status)
metricsCollector.recordCacheHit('custom-cache-key')
metricsCollector.recordMemoryUsage(process.memoryUsage().heapUsed)
metricsCollector.recordRateLimit('api-resource', remaining, limit)
```

### Performance Baselines

Performance baselines are automatically managed but can be manually controlled:

```bash
# Reset baselines (useful after major performance improvements)
pnpm test:integration:cleanup --baselines

# Update baselines from specific test run
pnpm test:integration:analyze --update-baselines
```

### Alerting Configuration

Configure multiple alert channels:

```typescript
const config: TestSuiteConfig = {
  alerting: {
    slack: {
      webhook: process.env.SLACK_WEBHOOK_URL,
      channel: '#alerts'
    },
    email: {
      recipients: ['team@example.com'],
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      }
    }
  }
}
```

## Contributing

When adding new integration tests:

1. Follow the established patterns for metrics collection
2. Add appropriate performance expectations
3. Include proper cleanup in afterAll hooks
4. Document any new quality gates or thresholds
5. Test locally with `pnpm test:integration:watch`

## Support

For issues with the test reporting system:

1. Check the latest test status: `pnpm test:integration:status`
2. Review generated reports in `tests/integration/reports/`
3. Enable debug logging for detailed output
4. Check environment variable configuration