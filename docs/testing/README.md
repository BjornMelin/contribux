# Testing Documentation

This directory contains comprehensive testing guides and infrastructure documentation for the Contribux project.

## Testing Guides

- [nextauth-v5-testing-guide.md](nextauth-v5-testing-guide.md) - Complete NextAuth.js v5 authentication testing guide with 95%+ coverage
- [component-testing-best-practices.md](component-testing-best-practices.md) - Best practices for React component testing
- [testing-infrastructure.md](testing-infrastructure.md) - Database testing infrastructure with PGlite and Neon branching

## Testing Stack

- **Test Runner**: Vitest 3.2+ with V8 coverage
- **API Testing**: MSW (Mock Service Worker) for HTTP mocking
- **Database Testing**: PGlite for in-memory PostgreSQL, Neon branching for staging
- **E2E Testing**: Playwright for browser automation
- **Coverage**: 95%+ target for authentication modules

## Quick Navigation

- **Authentication Testing?** See [nextauth-v5-testing-guide.md](nextauth-v5-testing-guide.md)
- **Component Testing?** Check [component-testing-best-practices.md](component-testing-best-practices.md)
- **Database Testing Setup?** Review [testing-infrastructure.md](testing-infrastructure.md)
- **API Testing?** See [../features/api-testing-guide.md](../features/api-testing-guide.md)

## Commands

```bash
pnpm test              # Run all tests
pnpm test:auth         # Run authentication tests
pnpm test:e2e          # Run end-to-end tests
pnpm test:coverage     # Run tests with coverage
pnpm test:db:pglite    # Run database tests with PGlite
```