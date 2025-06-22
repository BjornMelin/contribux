# Test Performance Optimization

This directory contains utilities and configurations to optimize test execution time while maintaining test coverage and reliability.

## 🚀 Quick Start

### Fast Test Mode

Run tests with reduced iterations and optimized configurations:

```bash
# Run all tests in fast mode
pnpm test:fast

# Watch mode with performance optimizations
pnpm test:fast:watch

# Run specific test files in fast mode
pnpm test:fast tests/integration/github/memory-leak-detection.test.ts
```

### Standard Test Mode

For full test coverage and CI runs:

```bash
# Standard test run
pnpm test

# Full CI test run with coverage
pnpm test:ci
```

## 📊 Performance Improvements

### Iteration Reductions

Tests use environment-aware iteration counts:

| Test Type | Standard Mode | Fast Mode | CI Mode |
|-----------|--------------|-----------|---------|
| Memory Leak Extended Ops | 20 | 5 | 20 |
| Memory High Volume Pages | 10 | 3 | 10 |
| Memory Client Count | 5 | 2 | 5 |
| Load Concurrent Requests | 100 | 20 | 100 |
| Load Token Rotation | 50 | 10 | 50 |

### Timeout Optimizations

Reduced wait times in fast mode:

| Timeout Type | Standard | Fast Mode |
|--------------|----------|-----------|
| Tick | 10ms | 5ms |
| Short | 100ms | 50ms |
| Medium | 500ms | 200ms |
| Long | 1000ms | 500ms |

## 🛠️ Configuration

### Environment Variables

- `FAST_TESTS=true` - Enable fast test mode
- `CI=true` - Use CI-appropriate settings
- `TEST_ITERATIONS_MULTIPLIER=0.2` - Reduce iterations to 20%

### Test Configuration Files

- `vitest.performance.config.ts` - Performance-optimized Vitest config
- `optimize-tests.ts` - Test optimization utilities

## 📈 Benchmarks

Typical performance improvements:

- **Memory Leak Detection**: ~80% reduction (22s → 4s)
- **Load Testing**: ~75% reduction (15s → 3s)
- **Full Test Suite**: ~60% reduction (90s → 35s)

Current test statistics (as of June 2025):
- **Total Tests**: 711 tests across 45 test files
- **Fast Mode Pass Rate**: 93% (661/711 tests passing)
- **Fast Mode Execution Time**: ~34 seconds
- **Known Timeouts**: 3 memory leak detection tests may timeout in fast mode

## 🔧 Implementation Details

### OptimizedMemoryTracker

Lightweight memory tracking for tests:

```typescript
const tracker = new OptimizedMemoryTracker()
const id = tracker.allocate(1000) // Allocate 1KB
tracker.free(id) // Free allocation
```

### Concurrent Test Utilities

Run tests in controlled batches:

```typescript
await runConcurrentTests(tasks, {
  maxConcurrency: 10,
  delay: 50
})
```

### Fast Wait Utility

Environment-aware waiting:

```typescript
await fastWait(100) // Waits 100ms normally, minimal in fast mode
```

## 🎯 Best Practices

### When to Use Fast Mode

✅ **Recommended for:**
- Local development iteration
- Quick feedback loops
- Pre-commit hooks
- Feature branch testing

❌ **Not recommended for:**
- CI/CD pipelines
- Release builds
- Performance regression testing
- Final validation

### Writing Performance-Aware Tests

1. **Use iteration constants:**
   ```typescript
   for (let i = 0; i < TEST_ITERATIONS.MEMORY_EXTENDED_OPS; i++) {
     // Test logic
   }
   ```

2. **Use timeout constants:**
   ```typescript
   await fastWait(TEST_TIMEOUTS.SHORT)
   ```

3. **Conditional expensive operations:**
   ```typescript
   if (process.env.CI) {
     // Full validation
   } else {
     // Quick validation
   }
   ```

## 🔍 Debugging

### Viewing Actual Iterations

```bash
# See what iterations are being used
DEBUG=test:iterations pnpm test:fast
```

### Performance Profiling

```bash
# Run with Node.js profiling
node --inspect node_modules/.bin/vitest run
```

### Memory Usage Analysis

```bash
# Run with garbage collection stats
node --expose-gc --trace-gc node_modules/.bin/vitest run
```

## 📋 Maintenance

### Adding New Optimizations

1. Update `TEST_ITERATIONS` in `optimize-tests.ts`
2. Update affected test files to use constants
3. Document changes in this README
4. Verify both fast and standard modes work correctly

### Monitoring Test Times

Regular benchmarking ensures optimizations remain effective:

```bash
# Time standard run
time pnpm test

# Time fast run
time pnpm test:fast

# Compare results
```

## 🚨 Troubleshooting

### Tests Failing in Fast Mode

- Check if test relies on specific iteration counts
- Verify timeout-sensitive operations
- Ensure mocks are properly configured
- Note: Some memory leak detection tests may timeout in fast mode (10s limit) - this is expected behavior

### Different Results Between Modes

- Review conditional logic based on environment
- Check for race conditions with reduced timeouts
- Validate mock responses match expectations

### Performance Not Improving

- Confirm environment variables are set
- Check if test is CPU-bound vs I/O-bound
- Profile specific test for bottlenecks