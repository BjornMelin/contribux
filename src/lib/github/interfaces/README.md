# GitHub API Interfaces

This directory contains organized interface definitions for the GitHub API client library. The interfaces are split into logical modules for better maintainability and to avoid circular dependencies.

## File Structure

### Core Client Interfaces
- **`client.ts`** - Core client configuration, authentication, and basic request/response types
- **`http.ts`** - HTTP-specific interfaces (headers, requests, responses, errors)

### Functionality-Specific Interfaces
- **`rate-limiting.ts`** - Rate limiting, throttling, and warning callback interfaces
- **`retry.ts`** - Retry logic, circuit breaker, and error handling interfaces
- **`cache.ts`** - Caching storage backends, entries, metrics, and Redis interfaces
- **`token.ts`** - Token management, rotation, and authentication interfaces

### API-Specific Interfaces
- **`graphql.ts`** - GraphQL operations, pagination, batching, and response types
- **`webhooks.ts`** - Webhook payloads, events, handlers, and validation types
- **`dataloader.ts`** - DataLoader batch loading interfaces and options

### Utility Interfaces
- **`utils.ts`** - Common utility types used across the library

### Main Export
- **`index.ts`** - Central export point that re-exports all interfaces

## Usage

### Recommended Import Patterns

```typescript
// Import from the main interfaces module
import type { GitHubClientConfig, RateLimitInfo } from '@/lib/github/interfaces'

// Or import from specific modules for better tree-shaking
import type { GitHubClientConfig } from '@/lib/github/interfaces/client'
import type { RateLimitInfo } from '@/lib/github/interfaces/rate-limiting'
```


## Design Principles

1. **Separation of Concerns** - Each file focuses on a specific aspect of the GitHub API
2. **Minimal Dependencies** - Interface files have minimal cross-dependencies to avoid circular imports
3. **Clear Documentation** - Each interface is well-documented with JSDoc comments
4. **Tree Shaking** - Consumers can import only the interfaces they need

## Migration Guide

When refactoring code to use the new interface organization:

1. **Identify the interface category** based on the table above
2. **Update import statements** to use the specific interface file
3. **Verify no circular dependencies** are introduced
4. **Test thoroughly** to ensure type compatibility

## Adding New Interfaces

When adding new interfaces:

1. **Choose the appropriate module** based on functionality
2. **Add comprehensive JSDoc documentation**
3. **Export from the main `index.ts`** for discoverability
4. **Add tests** to verify the interfaces work correctly