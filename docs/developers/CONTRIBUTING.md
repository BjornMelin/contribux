# Contributing to contribux

Welcome to contribux! This guide will help you understand how to contribute effectively to our AI-powered GitHub contribution discovery platform.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Submission Process](#submission-process)
- [AI Assistant Integration](#ai-assistant-integration)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js 18+** and **pnpm 10.11.1+**
- **Git** configured with SSH keys
- **Access** to development environment variables
- **Understanding** of the project architecture (see [Architecture Reference](./reference/architecture.md))

### Initial Setup

1. **Fork and Clone**

   ```bash
   # Fork the repository on GitHub
   git clone git@github.com:your-username/contribux.git
   cd contribux
   ```

2. **Install Dependencies**

   ```bash
   # CRITICAL: Use pnpm, not npm
   pnpm install
   ```

3. **Environment Configuration**

   ```bash
   # Copy environment template
   cp .env.example .env.local

   # Configure required variables
   # DATABASE_URL_DEV - Development database
   # OPENAI_API_KEY - OpenAI API access
   # GITHUB_TOKEN - GitHub API access
   ```

4. **Verify Setup**

   ```bash
   # Test database connections
   pnpm db:test-dev

   # Run development server
   pnpm dev

   # Run tests
   pnpm test
   ```

### Understanding the Codebase

Familiarize yourself with:

- [Quick Start Guide](./quick-start.md) - Development basics
- [Architecture Reference](./reference/architecture.md) - System design
- [Code Quality Standards](./standards/code-quality.md) - Coding conventions
- [Testing Standards](./standards/testing.md) - Testing approach

## Development Workflow

### 1. Issue Assignment

- **Browse Issues**: Check GitHub Issues for tasks needing attention
- **Claim Work**: Comment on issues you'd like to work on
- **Get Assigned**: Wait for maintainer assignment before starting work
- **Ask Questions**: Clarify requirements before beginning implementation

### 2. Branch Creation

Follow our branching strategy:

```bash
# Feature development
git checkout -b feat/your-feature-name

# Bug fixes
git checkout -b fix/bug-description

# Documentation
git checkout -b docs/documentation-update

# Maintenance
git checkout -b chore/maintenance-task
```

### 3. Development Process

#### Test-Driven Development (TDD)

We follow strict TDD practices:

1. **Write failing tests** for the feature/fix
2. **Implement minimal code** to make tests pass
3. **Refactor** while keeping tests green
4. **Repeat** until feature is complete

```typescript
// Example TDD cycle
describe("GitHubClient", () => {
  it("should search repositories with pagination", async () => {
    // 1. Write test first
    const client = new GitHubClient(config);
    const result = await client.searchRepositories({
      query: "language:typescript",
      page: 2,
      limit: 50,
    });

    expect(result.success).toBe(true);
    expect(result.data.repositories).toHaveLength(50);
    expect(result.data.pagination.page).toBe(2);
  });
});

// 2. Implement to make test pass
// 3. Refactor and improve
```

#### AI Assistant Integration

Use AI assistants effectively during development:

```bash
# Initialize Task Master AI for feature
task-master add-task --prompt="Implement GitHub repository search with pagination"
task-master expand --id=new-task-id --research

# Track progress
task-master set-status --id=subtask-id --status=in-progress
task-master update-subtask --id=subtask-id --prompt="Implementation progress notes"
```

#### Code Quality Checks

Run these before every commit:

```bash
# Quality pipeline
pnpm lint && pnpm lint:fix    # Fix linting issues
pnpm format                   # Format code
pnpm type-check              # Validate TypeScript
pnpm test                    # Run all tests
pnpm test:coverage          # Ensure 90%+ coverage
```

### 4. Implementation Standards

#### TypeScript and Zod Integration

```typescript
// Always use Zod for schema validation
import { z } from "zod";

const SearchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(30),
  language: z.string().optional(),
  minStars: z.number().int().min(0).optional(),
});

type SearchQuery = z.infer<typeof SearchQuerySchema>;

// Use Result pattern for error handling
export const searchRepositories = async (
  query: unknown
): Promise<Result<SearchResult>> => {
  try {
    const validQuery = SearchQuerySchema.parse(query);
    // Implementation...
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error as Error };
  }
};
```

#### Database Operations

```typescript
// Follow database standards
import { z } from "zod";
import { DatabaseClient } from "@/lib/db/client";

export class RepositoryService {
  constructor(private db: DatabaseClient) {}

  async createRepository(data: unknown): Promise<Result<Repository>> {
    // 1. Validate input with Zod
    const validation = RepositorySchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    // 2. Use parameterized queries
    try {
      const result = await this.db.query(
        "INSERT INTO repositories (name, owner, description) VALUES ($1, $2, $3) RETURNING *",
        [
          validation.data.name,
          validation.data.owner,
          validation.data.description,
        ]
      );

      const repository = RepositorySchema.parse(result.rows[0]);
      return { success: true, data: repository };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
}
```

#### Vector Search Implementation

```typescript
// Vector search with proper error handling
export class VectorSearchService {
  async searchSimilarRepositories(
    query: string,
    options: SearchOptions = {}
  ): Promise<Result<Repository[]>> {
    try {
      // 1. Generate embedding
      const embeddingResult = await this.embeddings.generate(query);
      if (!embeddingResult.success) {
        return embeddingResult;
      }

      // 2. Perform similarity search
      const searchResult = await this.db.query(
        `SELECT r.*, (1 - (r.embedding <=> $1)) AS similarity_score
         FROM repositories r
         WHERE (1 - (r.embedding <=> $1)) >= $2
         ORDER BY r.embedding <=> $1
         LIMIT $3`,
        [
          JSON.stringify(embeddingResult.data),
          options.threshold || 0.7,
          options.limit || 10,
        ]
      );

      const repositories = searchResult.rows.map((row) =>
        RepositorySchema.parse(row)
      );

      return { success: true, data: repositories };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
}
```

## Code Standards

### File Organization

```text
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (auth)/            # Route groups
│   └── dashboard/         # Pages
├── components/            # React components
│   ├── features/         # Feature-specific
│   └── ui/               # Reusable UI
├── lib/                  # Business logic
│   ├── services/         # Domain services
│   ├── db/               # Data access
│   ├── github/           # GitHub integration
│   └── ai/               # AI/ML services
├── hooks/                # Custom hooks
├── context/              # React context
└── types/                # Type definitions
```

### Naming Conventions

- **Files**: kebab-case (`user-profile.tsx`)
- **Components**: PascalCase (`UserProfile`)
- **Functions**: camelCase (`getUserProfile`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)
- **Types**: PascalCase (`UserProfile`)

### Import Organization

```typescript
// 1. External imports
import React from "react";
import { z } from "zod";

// 2. Internal imports with path mapping
import { DatabaseClient } from "@/lib/db/client";
import { UserSchema } from "@/types/user";
import { Button } from "@/components/ui/button";

// 3. Type-only imports (separated)
import type { User } from "@/types/user";
import type { ComponentProps } from "react";
```

## Testing Requirements

### Coverage Standards

- **Minimum 90% coverage** across all metrics
- **Meaningful scenarios** over artificial line-targeting
- **Real-world usage patterns** in test cases
- **Comprehensive error handling** validation

### Test Organization

```text
tests/
├── features/                    # Feature-based tests
│   ├── auth/
│   │   ├── auth-core.test.ts
│   │   ├── auth-edge-cases.test.ts
│   │   └── auth-integration.test.ts
│   └── github/
│       ├── github-core.test.ts
│       ├── github-edge-cases.test.ts
│       └── github-comprehensive.test.ts
├── database/                    # Database tests
└── setup.ts                    # Test configuration
```

### Testing Patterns

```typescript
// Example comprehensive test
describe("GitHub Repository Search", () => {
  describe("Core Functionality", () => {
    it("should search repositories with valid parameters", async () => {
      // Arrange
      const searchQuery = {
        query: "language:typescript stars:>1000",
        limit: 30,
        page: 1,
      };

      // Act
      const result = await githubService.searchRepositories(searchQuery);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.repositories).toHaveLength(30);
      expect(result.data.repositories[0]).toMatchObject({
        name: expect.any(String),
        owner: expect.any(String),
        stars: expect.any(Number),
        language: "TypeScript",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle API rate limiting gracefully", async () => {
      // Mock rate limit response
      mockGitHubAPI.onGet().reply(429, {
        message: "API rate limit exceeded",
      });

      const result = await githubService.searchRepositories(validQuery);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(result.error.retryAfter).toBeGreaterThan(0);
    });
  });
});
```

### MSW for HTTP Mocking

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const githubHandlers = [
  http.get("https://api.github.com/search/repositories", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");

    return HttpResponse.json({
      total_count: 100,
      items: [
        {
          id: 1,
          name: "test-repo",
          owner: { login: "test-owner" },
          stargazers_count: 1500,
          language: "TypeScript",
        },
      ],
    });
  }),
];
```

## Submission Process

### 1. Pre-submission Checklist

Before creating a pull request:

- [ ] All tests pass (`pnpm test`)
- [ ] 90%+ test coverage achieved through meaningful tests
- [ ] Code quality checks pass (`pnpm lint && pnpm type-check`)
- [ ] Code is formatted (`pnpm format`)
- [ ] Database tests pass (`pnpm test:db`)
- [ ] No TypeScript errors or warnings
- [ ] All AI assistant tasks updated with progress
- [ ] Documentation updated if needed

### 2. Pull Request Creation

**Title Format**: Use conventional commits format

```text
feat(github): add repository search with pagination
fix(db): resolve connection pool exhaustion
docs(api): update authentication endpoints
```

**PR Description Template**:

```markdown
## Description

Brief description of changes and motivation.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Changes Made

- Detailed list of changes
- Include any database schema changes
- Note any breaking changes

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Database tests pass

## Task Management

- Task Master AI task: #[task-id]
- Progress notes: [brief summary]

## Database Changes

- [ ] No database changes
- [ ] Schema migrations included
- [ ] Backward compatibility maintained

## Performance Impact

- [ ] No performance impact
- [ ] Performance improved
- [ ] Performance impact assessed and acceptable

## Security Considerations

- [ ] No security implications
- [ ] Security review completed
- [ ] No sensitive data exposed

## Checklist

- [ ] Code follows project standards
- [ ] Tests achieve 90%+ coverage through meaningful scenarios
- [ ] Documentation updated
- [ ] No breaking changes (or properly documented)
- [ ] Self-review completed
```

### 3. Review Process

#### **Automated Checks**

- Continuous Integration tests
- Code quality validation
- Type checking
- Test coverage verification
- Security scanning

#### **Code Review Criteria**

Reviewers will check:

- Code quality and standards compliance
- Test coverage and quality
- Performance implications
- Security considerations
- Documentation completeness
- Breaking change handling

#### **Addressing Feedback**

- Respond to all review comments
- Make requested changes promptly
- Update tests as needed
- Request re-review when ready

### 4. Merge Requirements

- **All CI checks** must pass
- **At least one approval** from maintainer
- **Conflicts resolved** with target branch
- **Branch up to date** with main
- **Conventional commit** format followed

## AI Assistant Integration - Task Master AI

### Task Management During Development

```bash
# Start new feature
task-master add-task --prompt="Implement GitHub webhook integration"
task-master expand --id=new-task --research

# Track development progress
task-master set-status --id=subtask --status=in-progress
task-master update-subtask --id=subtask --prompt="Completed webhook endpoint, working on validation"

# Complete tasks
task-master set-status --id=subtask --status=done
task-master update-subtask --id=subtask --prompt="Implementation complete with comprehensive tests"
```

### Using Claude Code for Development

When working with Claude Code:

- Provide clear context about the feature being implemented
- Include relevant file paths and existing code patterns
- Request comprehensive tests alongside implementation
- Ask for code that follows project standards

Example prompt:

```text
Implement a GitHub webhook handler for the contribux platform that:

Context:
- Uses the existing Result pattern from src/lib/utils/result.ts
- Follows database patterns in src/lib/db/
- Integrates with Zod validation like other API endpoints

Requirements:
- Handle repository events (created, updated, deleted)
- Validate webhook signatures
- Update repository data in database
- Include comprehensive Vitest tests

Constraints:
- Must achieve 90%+ test coverage
- Follow existing error handling patterns
- Use TypeScript strict mode
- Include realistic edge case testing
```

## Community Guidelines

### Code of Conduct

- **Be respectful** and professional in all interactions
- **Help others** learn and grow
- **Give constructive** feedback
- **Be patient** with newcomers
- **Focus on the code**, not the person

### Communication

- **Use GitHub Issues** for bug reports and feature requests
- **Use Pull Requests** for code discussions
- **Be clear and detailed** in descriptions
- **Ask questions** when requirements are unclear
- **Share knowledge** through code comments and documentation

### Recognition

Contributors are recognized through:

- Git commit attribution
- Contributors section in README
- Release notes acknowledgments
- Community recognition for significant contributions

## Getting Help

### Documentation Resources

- [Quick Start Guide](./quick-start.md)
- [Architecture Reference](./reference/architecture.md)
- [Testing Standards](./standards/testing.md)
- [Command Reference](./reference/commands.md)

### Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Code Comments**: Implementation-specific questions
- **Pull Request Reviews**: Code-related discussions

### Common Issues

#### **Setup Problems**

```bash
# Clear cache and reinstall
pnpm clean && pnpm install

# Test database connection
pnpm db:test-dev

# Verify environment variables
echo $DATABASE_URL_DEV
```

#### **Test Failures**

```bash
# Run specific test file
pnpm test github-core.test.ts

# Debug test with verbose output
pnpm test --reporter=verbose

# Check test coverage
pnpm test:coverage
```

#### **Type Errors**

```bash
# Run type checker
pnpm type-check

# Check specific file
npx tsc --noEmit src/lib/github/client.ts
```

Thank you for contributing to contribux! Your contributions help make AI-powered contribution discovery better for developers everywhere.
