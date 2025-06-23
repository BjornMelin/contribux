# GitGuardian Configuration Guide

This document explains the GitGuardian setup for the contribux project to prevent false positives while maintaining security.

## Overview

GitGuardian is configured to scan for secrets and sensitive data in our codebase while ignoring test files and mock data that commonly trigger false positives.

## Configuration File

The configuration is defined in `.gitguardian.yml` at the project root.

### Key Features

#### 🚫 Excluded Paths

- All test files (`tests/**/*`, `**/*.test.ts`, `**/*.spec.ts`)
- Build artifacts (`coverage/**/*`, `.next/**/*`, `dist/**/*`)
- Documentation files (`**/*.md`, `docs/**/*`)
- Database schema files (`database/**/*.sql`)
- Configuration files with test data

#### 🎯 Ignored Patterns

- Test JWT secrets: `test-jwt-secret-for-unit-tests-only-32-chars-minimum`
- Mock tokens: `token1`, `token2`, `token3`
- Test database URLs: `postgresql://test:test@localhost`
- Fake RSA keys with obvious test patterns
- Generic test patterns: `test.*secret`, `mock.*token`, etc.

#### 🔍 Custom Detectors

- Production Neon database URLs
- GitHub Personal Access Tokens (`ghp_*`)
- OpenAI API keys (`sk-*`)
- High-entropy strings (with test exclusions)

## Usage

### Local Testing

```bash
# Install GitGuardian CLI
pip install gitguardian

# Scan with our configuration
ggshield secret scan . --config-path .gitguardian.yml

# Validate configuration
./scripts/validate-gitguardian.sh
```

### CI/CD Integration

The configuration automatically applies when GitGuardian runs in CI/CD pipelines that detect the `.gitguardian.yml` file.

## Common False Positives Handled

### 1. Test Secrets

- **Pattern**: JWT secrets in test files
- **Solution**: Excluded via `matches-ignore` and test file exclusions

### 2. Mock API Tokens

- **Pattern**: GitHub API tokens like `token1`, `token2` in tests
- **Solution**: Specific pattern exclusions for mock tokens

### 3. Test Database URLs

- **Pattern**: Local PostgreSQL URLs in test configurations
- **Solution**: Pattern exclusions for localhost test databases

### 4. Sample RSA Keys

- **Pattern**: Fake private keys in authentication tests
- **Solution**: Exclusions for keys with obvious test markers

## Adding New Exclusions

### For Test Files

Add patterns to `paths-ignore` section:

```yaml
paths-ignore:
  - "new-test-directory/**/*"
  - "**/*.new-test-type.ts"
```

### For Specific Patterns

Add regex patterns to `matches-ignore` section:

```yaml
matches-ignore:
  - "your.*new.*test.*pattern"
  - "another-specific-mock-value"
```

## Best Practices

### ✅ Do

- Use clearly marked test values: `test-*`, `mock-*`, `fake-*`
- Include "test" or "mock" in variable names
- Keep test data in dedicated test directories
- Use descriptive secret names that indicate their test nature

### ❌ Don't

- Use production-like values in tests
- Commit actual API keys or secrets (even expired ones)
- Use ambiguous variable names for test data
- Skip the GitGuardian check when adding legitimate secrets

## Troubleshooting

### False Positive Still Triggered

1. **Check if pattern is covered**: Review existing `matches-ignore` patterns
2. **Add specific exclusion**: Add the exact pattern to `matches-ignore`
3. **Exclude file path**: Add file/directory to `paths-ignore` if it's test-related
4. **Test configuration**: Run `./scripts/validate-gitguardian.sh`

### Real Secret Not Detected

1. **Check exclusions**: Ensure the secret doesn't match any ignore patterns
2. **Verify file inclusion**: Make sure the file type is in the `scan` section
3. **Test manually**: Run `ggshield secret scan path/to/file`

## Configuration Validation

Run the validation script to verify your configuration:

```bash
./scripts/validate-gitguardian.sh
```

This script:

- ✅ Validates YAML syntax
- ✅ Tests GitGuardian CLI integration
- ✅ Runs sample scans with test patterns
- ✅ Provides configuration summary

## Support

For configuration issues or questions about GitGuardian setup, please:

1. Check this documentation
2. Review the `.gitguardian.yml` comments
3. Run the validation script for debugging
4. Create an issue with configuration details

## Security Note

⚠️ **Important**: This configuration is designed to reduce false positives from test data. Always ensure that:

- Real production secrets are never committed
- Test values are clearly marked as non-production
- Regular security audits are performed
- Team members understand the difference between test and production data

The GitGuardian configuration helps maintain security while allowing productive development with comprehensive test coverage.
