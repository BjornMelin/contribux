# AI Assistant Integration Guide

This guide covers working with AI assistants, particularly Claude Code and Task Master AI, for enhanced development workflow.

## Overview

contribux integrates with AI assistants to enhance developer productivity:

- **Claude Code**: AI-powered code generation and assistance
- **Task Master AI**: Intelligent task management and workflow orchestration
- **MCP Integration**: Model Context Protocol for seamless tool integration

## Claude Code Integration

### Setup and Configuration

Claude Code provides intelligent code assistance with project-specific context:

```typescript
// .claude/config.json (if applicable)
{
  "projectType": "nextjs",
  "framework": "react",
  "language": "typescript",
  "database": "postgresql",
  "testFramework": "vitest",
  "linter": "biome"
}
```

### Best Practices with Claude Code

#### Code Generation

When requesting code from Claude Code:

1. **Provide context**: Include relevant file paths and existing code
2. **Specify requirements**: Be explicit about functionality needed
3. **Include constraints**: Mention performance, security, or style requirements
4. **Request tests**: Always ask for corresponding tests

```markdown
Example prompt:
"Create a user authentication service for src/lib/auth/ that:

- Uses JWT tokens with Zod validation
- Integrates with our existing database schema
- Includes comprehensive Vitest tests
- Follows our error handling patterns from src/lib/utils/result.ts"
```

#### Code Review Assistance

Use Claude Code for code review support:

```markdown
"Review this component for:

- TypeScript best practices
- React performance optimizations
- Accessibility compliance
- Test coverage gaps"
```

### Development Workflow Integration

```mermaid
graph LR
    A[Feature Request] --> B[Claude Analysis]
    B --> C[Code Generation]
    C --> D[Test Creation]
    D --> E[Review & Refinement]
    E --> F[Implementation]
    F --> G[Task Update]
```

## Task Master AI Integration

### Core Concepts

Task Master AI provides intelligent project management through MCP tools:

- **Hierarchical tasks**: Main tasks with subtasks and dependencies
- **AI-powered analysis**: Complexity assessment and recommendation
- **Workflow automation**: Status tracking and progress monitoring

### Essential Commands

#### Project Setup

```bash
# Initialize Task Master AI
pnpm exec task-master init

# Parse requirements document
pnpm exec task-master parse-prd .taskmaster/docs/prd.txt

# Analyze project complexity
pnpm exec task-master analyze-complexity --research
```

#### Daily Workflow

```bash
# Find next available task
pnpm exec task-master next

# View task details
pnpm exec task-master show 1.2

# Update task status
pnpm exec task-master set-status --id=1.2 --status=in-progress

# Add progress notes
pnpm exec task-master update-subtask --id=1.2 --prompt="Implementation notes"
```

### MCP Tool Integration

#### Task Management Functions

```javascript
// Available through Claude Code MCP integration

// Get next task
const nextTask = await mcp__task_master_ai__next_task({
  projectRoot: "/path/to/project",
});

// Update task status
await mcp__task_master_ai__set_task_status({
  id: "1.2",
  status: "in-progress",
  projectRoot: "/path/to/project",
});

// Expand task into subtasks
await mcp__task_master_ai__expand_task({
  id: "1",
  research: true,
  projectRoot: "/path/to/project",
});
```

#### Research-Enhanced Operations

```javascript
// AI-powered task creation
await mcp__task_master_ai__add_task({
  prompt: "Implement vector search optimization",
  research: true, // Enable AI research
  projectRoot: "/path/to/project",
});

// Complex analysis with research
await mcp__task_master_ai__analyze_project_complexity({
  research: true,
  projectRoot: "/path/to/project",
});
```

### Task Structure and Organization

#### Task Hierarchy

```json
{
  "id": "1",
  "title": "Implement GitHub API Integration",
  "status": "in-progress",
  "subtasks": [
    {
      "id": "1.1",
      "title": "Design API client architecture",
      "status": "done"
    },
    {
      "id": "1.2",
      "title": "Implement repository search",
      "status": "in-progress",
      "dependencies": ["1.1"]
    },
    {
      "id": "1.3",
      "title": "Add rate limiting and caching",
      "status": "pending",
      "dependencies": ["1.2"]
    }
  ]
}
```

#### Status Management

- **pending**: Ready to work on
- **in-progress**: Currently being worked on
- **done**: Completed and verified
- **blocked**: Waiting on external factors
- **deferred**: Postponed for later
- **cancelled**: No longer needed

### Iterative Development Process

#### 1. Task Planning Phase

```javascript
// Get task details
const task = await get_task({ id: "1.2" });

// Analyze requirements
// Plan implementation approach
// Identify dependencies and risks
```

#### 2. Implementation Phase

```javascript
// Start task
await set_task_status({
  id: "1.2",
  status: "in-progress",
});

// Log implementation plan
await update_subtask({
  id: "1.2",
  prompt:
    "Implementation approach: Use Result pattern for error handling, integrate with existing database layer, add comprehensive tests",
});
```

#### 3. Progress Tracking

```javascript
// Regular progress updates
await update_subtask({
  id: "1.2",
  prompt:
    "Completed API client setup, working on rate limiting implementation. Found issue with token refresh - investigating fix.",
});
```

#### 4. Completion Phase

```javascript
// Mark task complete
await set_task_status({
  id: "1.2",
  status: "done",
});

// Document completion
await update_subtask({
  id: "1.2",
  prompt:
    "Implementation complete. Added comprehensive tests with 95% coverage. Documented API usage patterns. Ready for review.",
});
```

## Advanced Workflow Patterns

### AI-Assisted Code Review

Combine Claude Code with Task Master AI for comprehensive reviews:

```markdown
Task: Code review for GitHub API client

Claude Code prompt:
"Review the implementation in src/lib/github/ against task requirements:

- Check TypeScript strict mode compliance
- Verify error handling patterns
- Assess test coverage and quality
- Identify performance optimizations
- Validate security practices"

Update task with findings and recommendations.
```

### Complexity-Driven Development

Use AI analysis to guide development priorities:

```javascript
// Analyze project complexity
const analysis = await analyze_project_complexity({
  research: true,
});

// Review complexity report
const report = await complexity_report();

// Expand high-complexity tasks
for (const task of highComplexityTasks) {
  await expand_task({
    id: task.id,
    research: true,
  });
}
```

### Research-Enhanced Implementation

Leverage AI research for informed development:

```javascript
// Research-enhanced task updates
await update_task({
  id: "1",
  prompt:
    "Investigate latest GitHub API best practices and rate limiting strategies",
  research: true,
});

// AI-powered architecture decisions
await add_task({
  prompt:
    "Design optimal caching strategy for GitHub API responses considering rate limits and data freshness",
  research: true,
});
```

## Integration Best Practices

### Effective Prompt Engineering

#### For Code Generation

```markdown
Structure: Context + Requirements + Constraints + Examples

"Given the existing repository structure in src/lib/github/ and the Result pattern defined in src/lib/utils/result.ts, create a GitHub repository search function that:

Requirements:

- Fetches repositories matching search criteria
- Implements pagination with cursor-based navigation
- Returns typed results using Zod validation

Constraints:

- Must handle rate limiting gracefully
- Include comprehensive error handling
- Achieve 90%+ test coverage
- Follow existing code patterns

Example usage:
const result = await searchRepositories({
query: 'language:typescript stars:>1000',
limit: 50
});
"
```

#### For Task Management

```markdown
Structure: Current State + Desired Outcome + Context

"Current status: Implemented basic GitHub API client with authentication.

Desired outcome: Add sophisticated rate limiting with exponential backoff and request queuing.

Context: This is part of task 1.3 which depends on the completed API client foundation. The implementation should handle GitHub's 5000 requests/hour limit and gracefully queue additional requests."
```

### Code Quality Integration

Combine AI assistance with quality standards:

```typescript
// AI-suggested implementation with quality checks
export const createGitHubClient = (
  config: GitHubConfig
): Result<GitHubClient> => {
  // 1. Claude Code generated implementation
  // 2. Validate with Zod schemas
  // 3. Add comprehensive error handling
  // 4. Include performance monitoring
  // 5. Write corresponding tests

  const configSchema = GitHubConfigSchema.parse(config);

  return {
    success: true,
    data: new GitHubClient(configSchema),
  };
};
```

### Testing Integration

Use AI for comprehensive test creation:

```markdown
"Generate Vitest tests for the GitHub API client that cover:

Core Functionality:

- Repository search with various parameters
- Pagination handling
- Authentication flow

Edge Cases:

- Rate limiting scenarios
- Network timeouts
- Invalid responses

Integration:

- End-to-end search workflow
- Error recovery patterns
- Performance under load

Follow our testing standards:

- Use MSW for HTTP mocking
- Achieve 90%+ coverage through meaningful scenarios
- Include realistic error simulation"
```

## Performance and Monitoring

### AI-Assisted Performance Optimization

```javascript
// Use Task Master AI for performance analysis
await add_task({
  prompt:
    "Analyze and optimize GitHub API client performance, focusing on request batching and caching strategies",
  research: true,
});

// Track performance improvements
await update_subtask({
  id: "performance-task",
  prompt:
    "Implemented request batching - reduced API calls by 60%. Added intelligent caching with 5-minute TTL. Measured 2x improvement in response times.",
});
```

### Monitoring Integration

```typescript
// AI-suggested monitoring patterns
export class GitHubClientMonitor {
  private metrics = {
    requestCount: 0,
    errorRate: 0,
    averageResponseTime: 0,
    rateLimitStatus: "green" as "green" | "yellow" | "red",
  };

  logRequest(duration: number, success: boolean): void {
    // Implementation suggested by Claude Code
    // Integrated with Task Master AI progress tracking
  }
}
```

## Troubleshooting and Support

### Common AI Integration Issues

#### Task Master AI Issues

```bash
# Task management problems
pnpm exec task-master validate-dependencies  # Check for circular dependencies
pnpm exec task-master fix-dependencies      # Auto-fix dependency issues
pnpm exec task-master generate             # Regenerate task files

# Reset task state if needed
rm -rf .taskmaster/tasks/*.txt
pnpm exec task-master generate
```

#### Claude Code Context Issues

- **Stale context**: Provide updated file contents
- **Missing dependencies**: Include import statements and type definitions
- **Unclear requirements**: Break down complex requests into smaller parts

### Best Practices for AI Collaboration

1. **Incremental requests**: Start with small, focused asks
2. **Context preservation**: Maintain conversation context across sessions
3. **Validation**: Always verify AI-generated code with tests
4. **Documentation**: Update docs and comments for AI-suggested code
5. **Learning**: Use AI explanations to improve understanding

### Emergency Procedures

If AI tools become unavailable:

```bash
# Fallback to manual task management
cat .taskmaster/tasks/tasks.json | jq '.tasks[] | select(.status == "pending")'

# Manual code review checklist
pnpm lint && pnpm type-check && pnpm test

# Backup current work
git add . && git commit -m "wip: backup before AI tool restart"
```

## Advanced Features

### Custom AI Workflows

Create custom workflows combining multiple AI tools:

```typescript
// Custom workflow: Feature implementation
const implementFeature = async (featureDescription: string) => {
  // 1. Create tasks with AI analysis
  const task = await add_task({
    prompt: featureDescription,
    research: true,
  });

  // 2. Expand into subtasks
  await expand_task({
    id: task.id,
    research: true,
  });

  // 3. Generate implementation with Claude Code
  // 4. Create comprehensive tests
  // 5. Update task progress
  // 6. Verify completion
};
```

### AI-Powered Documentation

```markdown
"Generate comprehensive documentation for the GitHub API client including:

- Architecture overview with Mermaid diagrams
- Usage examples for all major functions
- Error handling patterns
- Performance considerations
- Testing strategies

Structure following our documentation standards in docs/developers/"
```

## Security Considerations

### AI Tool Security

- **Never share sensitive data**: Avoid including secrets in AI prompts
- **Validate suggestions**: Review all AI-generated code for security issues
- **Audit dependencies**: Check AI-suggested packages for vulnerabilities
- **Access control**: Limit AI tool access to necessary project areas

### Safe AI Practices

```typescript
// Safe prompt patterns
const safePrompt = {
  // ✅ Good: Generic patterns
  prompt: "Create a secure authentication flow using JWT tokens",

  // ❌ Bad: Specific secrets
  prompt: "Fix this auth code: const secret = 'sk-proj-abc123...'",
};
```

This integration of AI assistants with contribux development creates a powerful, intelligent workflow that enhances productivity while maintaining high code quality and security standards.
