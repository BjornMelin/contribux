# Code Quality Standards

This document outlines the code quality standards and tools used in the contribux project.

## Overview

contribux maintains high code quality through automated tooling and strict standards:

- **Linting**: Biome with strict TypeScript rules
- **Type Safety**: Strict TypeScript with Zod validation
- **Formatting**: Biome with consistent code style
- **Package Management**: pnpm 10.11.1 (strictly enforced)

## Package Management

### pnpm Requirements

**CRITICAL: Always use `pnpm` instead of `npm` for all package management and script execution.**

```bash
# Installation
pnpm install

# Script execution
pnpm <script-name>

# Adding dependencies
pnpm add <package>
pnpm add -D <dev-package>
```

**Never use npm or yarn** - this ensures consistent lockfile format and dependency resolution.

## TypeScript Configuration

### Strict Mode Settings

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2017",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Type Safety Requirements

- **Zod validation**: Use for all schema validation and typing
- **Path mapping**: Use `@/*` for src/ imports
- **No any types**: Explicit typing required
- **Strict null checks**: Handle undefined/null explicitly

### Zod Integration

```typescript
import { z } from "zod";

// Define schemas for validation
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

// Infer types from schemas
type User = z.infer<typeof UserSchema>;

// Validate at runtime
const validateUser = (data: unknown): User => {
  return UserSchema.parse(data);
};
```

## Biome Configuration

### Formatting Rules

```json
{
  "formatter": {
    "lineWidth": 100,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double"
    }
  }
}
```

### Linting Standards

- **Line width**: 100 characters maximum
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single for JS, double for JSX
- **Import organization**: Automatic with type imports separated

### Daily Commands

```bash
# Linting (always run before commits)
pnpm lint          # Check for issues
pnpm lint:fix      # Auto-fix issues

# Formatting
pnpm format        # Format all files

# Type checking
pnpm type-check    # Validate TypeScript
```

## Code Organization

### Directory Structure

```text
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── features/          # Feature-specific components
│   └── ui/                # Reusable UI components
├── lib/                   # Utilities and configurations
│   ├── db/                # Database configuration
│   └── monitoring/        # Monitoring utilities
├── context/               # React context providers
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions
```

### Import Conventions

```typescript
// External imports first
import React from "react";
import { z } from "zod";

// Internal imports with path mapping
import { DatabaseClient } from "@/lib/db/client";
import { UserSchema } from "@/types/user";
import { Button } from "@/components/ui/button";

// Type-only imports separated
import type { User } from "@/types/user";
import type { ComponentProps } from "react";
```

### Naming Conventions

- **Files**: kebab-case (`user-profile.tsx`)
- **Components**: PascalCase (`UserProfile`)
- **Functions**: camelCase (`getUserProfile`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)
- **Types**: PascalCase (`UserProfile`)

## Performance Standards

### Bundle Optimization

- **Dynamic imports**: Use for large components
- **Tree shaking**: Import only what you need
- **Code splitting**: Automatic with Next.js App Router

```typescript
// Good: Tree-shakable import
import { formatDate } from "@/lib/utils/date";

// Bad: Imports entire library
import * as utils from "@/lib/utils";

// Good: Dynamic import for large components
const HeavyComponent = dynamic(() => import("@/components/heavy-component"));
```

### Memory Management

- **Cleanup effects**: Always clean up subscriptions
- **Memoization**: Use React.memo, useMemo, useCallback appropriately
- **Avoid memory leaks**: Clean up timers, listeners, and subscriptions

```typescript
useEffect(() => {
  const subscription = observable.subscribe(handleData);

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

## Quality Checklist

Before committing code, ensure:

- [ ] `pnpm lint` passes without errors
- [ ] `pnpm format` has been run
- [ ] `pnpm type-check` passes
- [ ] All tests pass (`pnpm test`)
- [ ] No console.log statements in production code
- [ ] Error handling is implemented
- [ ] TypeScript strict mode compliance
- [ ] Zod schemas for data validation
- [ ] Path mapping used for internal imports

## Error Handling

### Result Pattern

Use the Result pattern for error handling:

```typescript
import { z } from "zod";

type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

const fetchUser = async (id: string): Promise<Result<User>> => {
  try {
    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();
    const user = UserSchema.parse(data);
    return { success: true, data: user };
  } catch (error) {
    return { success: false, error: error as Error };
  }
};
```

### Error Boundaries

Implement error boundaries for React components:

```typescript
"use client";

import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-4 border border-red-200 rounded">
      <h2>Something went wrong:</h2>
      <pre className="text-red-600">{error.message}</pre>
    </div>
  );
}

export function WithErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
  );
}
```

## Security Standards

### Environment Variables

- Use `.env.local` for development secrets
- Never commit secrets to version control
- Validate environment variables with Zod

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

### Data Sanitization

- Sanitize user inputs
- Use Zod for input validation
- Escape HTML content when rendering

```typescript
import { z } from "zod";
import DOMPurify from "dompurify";

const CommentSchema = z.object({
  content: z.string().max(1000),
  authorId: z.string().uuid(),
});

const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html);
};
```
