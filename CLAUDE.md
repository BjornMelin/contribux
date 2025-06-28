# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

contribux is an AI-powered GitHub contribution discovery platform built with Next.js 15, TypeScript, and Neon PostgreSQL. The platform intelligently surfaces high-impact open source opportunities for senior developers transitioning to AI Engineering roles. This is a serverless-first, AI-native architecture designed for zero maintenance and ultra-low costs.

## Core Development Standards

### Package Management (Strictly Enforced)

**CRITICAL: Always use `pnpm` instead of `npm` for all package management and script execution (version 10.11.1 as specified in package.json).**

- **ALWAYS use pnpm**: Never use npm or yarn
- **Installation**: `pnpm install` for dependencies
- **Scripts**: `pnpm <script-name>` for all package.json scripts

### Code Quality & Standards

- **Linting**: Biome with strict TypeScript rules
- **Type safety**: Strict TypeScript with Zod validation throughout
- **Testing**: Comprehensive Vitest coverage with meaningful test scenarios
- **Performance**: Database performance monitoring and vector index optimization

### Database & AI/ML Integration

- **Branch strategy**: Use appropriate DATABASE_URL for environment (dev/test/prod)
- **Vector operations**: halfvec(1536) embeddings for semantic similarity
- **Search**: Hybrid approach combining text and vector search with HNSW indexes
- **Monitoring**: Regular performance reports, health checks, and vector metrics
- **Agents**: OpenAI Agents SDK for intelligent task orchestration

## Essential Commands

### Development & Build

```bash
# Development server with Turbo
pnpm dev

# Production build and start
pnpm build
pnpm start

# Code quality (always run before commits)
pnpm lint          # Biome linting
pnpm lint:fix      # Auto-fix linting issues
pnpm format        # Format code with Biome
pnpm type-check    # TypeScript validation

# Clean build artifacts
pnpm clean
```

### Testing (Vitest Framework)

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Coverage reporting
pnpm test:coverage

# Database-specific tests
pnpm test:db

# Test UI interface
pnpm test:ui

# CI mode with verbose output
pnpm test:ci
```

### Database (Neon PostgreSQL)

```bash
# Connection testing
pnpm db:test-connection
pnpm db:test-dev
pnpm db:test-prod

# Database health and monitoring
pnpm db:health
pnpm db:performance-report
pnpm db:slow-queries
pnpm db:vector-metrics
pnpm db:indexes
pnpm db:analyze
```

## Architecture Overview

### Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5.8+
- **Styling**: Tailwind CSS 4.0+, Biome for formatting/linting
- **Database**: Neon PostgreSQL 16 with pgvector extension for vector search
- **AI/ML**: OpenAI Agents SDK, halfvec embeddings (1536 dimensions)
- **Testing**: Vitest 3.2+ with V8 coverage provider
- **Package Manager**: pnpm 10.11.1 (strictly enforced)

### Key Directories

```text
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── features/          # Feature-specific components
│   └── ui/                # Reusable UI components
├── lib/                   # Utilities and configurations
│   ├── db/                # Database configuration and client
│   └── monitoring/        # Database monitoring utilities
├── context/               # React context providers
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions

tests/
├── database/              # Database-related tests
└── setup.ts              # Vitest test configuration
```

### Database Architecture

**Core Schema:**
The database uses a sophisticated schema with vector embeddings for AI-powered search:

- **users**: User profiles with GitHub integration
- **repositories**: Repository metadata with health scoring
- **opportunities**: Contribution opportunities with AI analysis
- **user_preferences**: Personalized filtering and notification settings
- **notifications**: Multi-channel notification system
- **contribution_outcomes**: Success tracking and analytics
- **user_repository_interactions**: User engagement tracking

**Vector Search Features:**

- **halfvec(1536) embeddings** for semantic similarity
- **HNSW indexes** for efficient vector search
- **Hybrid search functions** combining text and vector search
- **Performance monitoring** with comprehensive metrics

**Environment Configuration:**
Database connections use branch-specific URLs:

- `DATABASE_URL` - Production/main branch
- `DATABASE_URL_DEV` - Development branch
- `DATABASE_URL_TEST` - Testing branch

### Configuration Standards

**TypeScript Configuration:**

- **Strict mode enabled** with comprehensive type checking
- **Path mapping**: Use `@/*` for src/ imports
- **Target**: ES2017 for broad compatibility
- **Additional strictness**: noUncheckedIndexedAccess, exactOptionalPropertyTypes

**Biome Configuration:**

- **Line width**: 100 characters
- **Indentation**: 2 spaces
- **Quote style**: Single quotes for JS, double for JSX
- **Import organization**: Automatic with type imports

**Testing Strategy & Quality Standards:**

_Framework & Configuration:_

- **Framework**: Vitest 3.2+ with V8 coverage provider
- **Coverage targets**: 90% across all metrics through meaningful tests (not line-targeting)
- **Test organization**: Feature-based in tests/ directory, logically grouped by functionality
- **Global APIs**: Enabled for Jest-like syntax without imports

_Mandatory Quality Standards:_

- **Functional Organization**: Group tests by business functionality, never by coverage metrics
- **Realistic Scenarios**: Test real-world usage patterns that mirror production behavior
- **Modern Patterns**: Use MSW 2.x for HTTP mocking, property-based testing for edge cases
- **Proper Isolation**: Comprehensive setup/teardown with proper async/await patterns
- **Meaningful Coverage**: Achieve coverage through valuable tests, not artificial line-targeting

## Development Best Practices

### Test-Driven Development (TDD)

- Always develop using a TDD test-first approach with Vitest
- Write tests for new features/functionality before implementation
- Implement code to make tests pass until all requirements are met
- Ensure complete feature implementation matching task and subtask requirements

### Testing Anti-Patterns to AVOID

❌ **Coverage-Driven Testing**: Never create tests solely to hit coverage metrics or line numbers  
❌ **Artificial Error Scenarios**: Avoid fabricated edge cases that wouldn't occur in real usage  
❌ **Internal Implementation Testing**: Don't test private methods or implementation details  
❌ **Line-Number Targeting**: Never write tests with comments like "covers lines X-Y"  
❌ **Metric-Named Tests**: Avoid test names like "coverage-boost" or "final-coverage-push"  
❌ **Timing-Dependent Tests**: Don't rely on real timers or timing for cache/async tests

### Testing Best Practices to FOLLOW

✅ **Functional Organization**: Structure tests by business functionality (Core, Edge Cases, Integration)  
✅ **User-Centric Scenarios**: Test from the perspective of actual API consumers and end users  
✅ **Realistic Edge Cases**: Test boundary conditions and error scenarios that mirror production  
✅ **Public API Focus**: Test through public interfaces, not internal implementation details  
✅ **Modern Test Patterns**: Use MSW for HTTP mocking, Vitest async utilities, property-based testing  
✅ **Proper Test Isolation**: Comprehensive beforeEach/afterEach with enhanced test isolation helpers  
✅ **Meaningful Test Names**: Descriptive names that explain business value, not technical coverage

### Test File Organization Standards

```text
Feature Tests Structure:
├── feature-core.test.ts        # Basic initialization, configuration, defaults
├── feature-edge-cases.test.ts  # Error handling, boundary conditions, realistic failures
├── feature-integration.test.ts # End-to-end flows, multi-service integration
├── feature-comprehensive.test.ts # Full API testing, happy path scenarios
└── specialized files as needed (errors, utilities, etc.)
```

### Test Quality Checklist (Use for ALL tests)

- [ ] Tests organized by functionality, not coverage metrics
- [ ] All test scenarios represent realistic usage patterns
- [ ] MSW used for HTTP mocking with proper setup/teardown
- [ ] Proper async/await patterns throughout
- [ ] No artificial timing dependencies or internal method testing
- [ ] Test names describe business value and expected behavior
- [ ] 90%+ coverage achieved through meaningful scenarios, not line-targeting
- [ ] Each test file has clear, logical sections with descriptive describe blocks

### Development Workflow

**Git Workflow:**

- **Main branch**: `main` (for production releases)
- **Feature branches**: Follow `feat/description` pattern
- **Current branch**: `feat/task-3-github-api-client`
- **Commits**: Use conventional commit format, comprehensive test coverage required

**Performance Considerations:**

- **Serverless architecture**: Optimized for Vercel Edge Functions
- **Vector operations**: Efficient HNSW indexing for fast similarity search
- **Connection pooling**: Built-in Neon serverless pooling
- **Monitoring**: Comprehensive database performance tracking

## Project Management & Confidentiality

### Task Management

- Always keep both todo list and task-master-ai task/subtask statuses updated throughout work
- Use Task Master AI MCP integration for enhanced workflow management

### Confidentiality Guidelines

- **NEVER MENTION CLAUDE CODE IN COMMIT OR PULL REQUEST MESSAGES OR DESCRIPTIONS**

### TypeScript Validation

- **Always use Zod for all TypeScript Schema validation and typing throughout the app**

---

## Task Master AI - Claude Code Integration Guide

### Key Files & Project Structure

#### Core Files

- `.taskmaster/tasks/tasks.json` - Main task data file (auto-managed)
- `.taskmaster/docs/prd.txt` - Product Requirements Document for parsing
- `.taskmaster/tasks/*.txt` - Individual task files (auto-generated from tasks.json)

## Task Master AI - MCP Integration

**Essential MCP Tools & CLI Commands:**

```javascript
// === PROJECT SETUP ===
initialize_project; // task-master init
parse_prd; // task-master parse-prd .taskmaster/docs/prd.txt
parse_prd({ append: true }); // task-master parse-prd --append (for additional PRDs)

// === DAILY WORKFLOW ===
next_task; // task-master next (find next available task)
get_task({ id: "1.2" }); // task-master show 1.2 (view task details)
set_task_status({ id: "1.2", status: "in-progress" }); // task-master set-status --id=1.2 --status=in-progress
set_task_status({ id: "1.2", status: "done" }); // task-master set-status --id=1.2 --status=done

// === TASK MANAGEMENT ===
get_tasks; // task-master list (show all tasks)
add_task({ prompt: "description", research: true }); // task-master add-task --prompt="..." --research
expand_task({ id: "1", research: true }); // task-master expand --id=1 --research
expand_all({ research: true }); // task-master expand --all --research
update_task({ id: "1", prompt: "changes" }); // task-master update-task --id=1 --prompt="..."
update_subtask({ id: "1.2", prompt: "notes" }); // task-master update-subtask --id=1.2 --prompt="..."
update({ from: "3", prompt: "changes" }); // task-master update --from=3 --prompt="..."

// === ANALYSIS & ORGANIZATION ===
analyze_project_complexity({ research: true }); // task-master analyze-complexity --research
complexity_report; // task-master complexity-report
add_dependency({ id: "2", dependsOn: "1" }); // task-master add-dependency --id=2 --depends-on=1
move_task({ from: "2", to: "3" }); // task-master move --from=2 --to=3

// === MAINTENANCE ===
generate; // task-master generate (regenerate task files)
validate_dependencies; // task-master validate-dependencies
fix_dependencies; // task-master fix-dependencies
help; // shows available commands
```

**Quick Start Workflow:**

1. `initialize_project` → `parse_prd` → `analyze_project_complexity` → `expand_all`
2. Daily: `next_task` → `get_task` → work → `update_subtask` → `set_task_status`

## Task Structure & IDs

### Task ID Format

- Main tasks: `1`, `2`, `3`, etc.
- Subtasks: `1.1`, `1.2`, `2.1`, etc.
- Sub-subtasks: `1.1.1`, `1.1.2`, etc.

### Task Status Values

- `pending` - Ready to work on
- `in-progress` - Currently being worked on
- `done` - Completed and verified
- `deferred` - Postponed
- `cancelled` - No longer needed
- `blocked` - Waiting on external factors

### Task Fields

```json
{
  "id": "1.2",
  "title": "Implement user authentication",
  "description": "Set up JWT-based auth system",
  "status": "pending",
  "priority": "high",
  "dependencies": ["1.1"],
  "details": "Use bcrypt for hashing, JWT for tokens...",
  "testStrategy": "Unit tests for auth functions, integration tests for login flow",
  "subtasks": []
}
```

## Implementation Workflow

**Iterative Development Process:**

1. `get_task({id: "subtask-id"})` - Understand requirements
2. Explore codebase and plan implementation
3. `update_subtask({id: "1.2", prompt: "detailed plan"})` - Log plan
4. `set_task_status({id: "1.2", status: "in-progress"})` - Start work
5. Implement code following logged plan
6. `update_subtask({id: "1.2", prompt: "what worked/didn't work"})` - Log progress
7. `set_task_status({id: "1.2", status: "done"})` - Complete task

## Important Notes

**AI-Powered Operations** (may take up to a minute): `parse_prd`, `analyze_project_complexity`, `expand_task`, `expand_all`, `add_task`, `update`, `update_task`, `update_subtask`

**File Management:**

- Never manually edit `tasks.json` or `.taskmaster/config.json`
- Task markdown files are auto-generated
- Use `generate` to regenerate task files after manual changes

**Research Mode:** Add `{research: true}` to any MCP call for enhanced AI analysis

---

## Serena MCP Server Integration

**CRITICAL: Serena is a specialized code analysis and editing system. Always follow this workflow for optimal code understanding and modification.**

### Essential Workflow (ALWAYS Follow This Order)

**Startup Sequence:**
1. `mcp__serena__initial_instructions` - Get project instructions (ALWAYS call first)
2. `mcp__serena__check_onboarding_performed` - Check if onboarding completed
3. `mcp__serena__onboarding` - Perform onboarding if needed
4. `mcp__serena__list_memories` - Check existing project knowledge

### Project Analysis & Navigation

**Overview Tools:**
- `mcp__serena__get_current_config` - Current configuration, projects, tools, modes
- `mcp__serena__list_dir` - List files/directories (use `recursive: true` for deep exploration)
- `mcp__serena__find_file` - Find files by name/pattern mask
- `mcp__serena__get_symbols_overview` - Get code symbol overview (classes, functions, etc.)

**Code Discovery:**
- `mcp__serena__find_symbol` - Find symbols by name path pattern
  - Use patterns like `"ClassName"`, `"method"`, or `"/ClassName/method"` for absolute paths
  - Add `depth: 1` to get children (methods of a class)
  - Use `substring_matching: true` for partial matches
- `mcp__serena__find_referencing_symbols` - Find what references a symbol
- `mcp__serena__search_for_pattern` - Regex search across project files

**Analysis Checkpoints:**
- `mcp__serena__think_about_collected_information` - ALWAYS call after search sequences
- `mcp__serena__think_about_task_adherence` - ALWAYS call before making code changes

### File Operations

**Reading:**
- `mcp__serena__read_file` - Read file content or chunks
  - Prefer symbolic operations when you know the symbol name
  - Use `start_line` and `end_line` for large files

**Creating:**
- `mcp__serena__create_text_file` - Create new files
  - **Only use for new files**; prefer symbolic operations for existing files

### Code Editing (Prefer Symbolic Operations)

**Symbol-Level Editing (PREFERRED):**
- `mcp__serena__replace_symbol_body` - Replace entire function/class body
- `mcp__serena__insert_after_symbol` - Insert after symbol definition
- `mcp__serena__insert_before_symbol` - Insert before symbol definition

**Pattern-Based Editing:**
- `mcp__serena__replace_regex` - Use with wildcards for complex replacements
  - **CRITICAL: Use wildcards (`.*?`) to avoid specifying exact content**
  - Example: `"function.*?{.*?}"` instead of full function text

**Line-Based Editing (Last Resort):**
- `mcp__serena__delete_lines` - Delete line ranges (requires prior read_file)
- `mcp__serena__replace_lines` - Replace line ranges (requires prior read_file)
- `mcp__serena__insert_at_line` - Insert at specific line

### System Operations

**Shell Commands:**
- `mcp__serena__execute_shell_command` - Execute shell commands
  - **ALWAYS check memories first** for suggested commands
  - Read "suggested shell commands" memory before using

**Language Server:**
- `mcp__serena__restart_language_server` - Restart on errors/inconsistencies

### Memory Management

**Project Knowledge:**
- `mcp__serena__write_memory` - Store important project insights
  - Use during onboarding and when discovering key patterns
  - Short, focused memories are better than large ones
- `mcp__serena__read_memory` - Read stored memory by filename
- `mcp__serena__list_memories` - List all available memories
- `mcp__serena__delete_memory` - Delete memory (only on explicit user request)

### Quality Assurance Workflow

**Before Code Changes:**
1. `mcp__serena__think_about_task_adherence` - Verify alignment with task
2. Make changes using symbolic operations
3. `mcp__serena__think_about_whether_you_are_done` - Evaluate completion
4. `mcp__serena__summarize_changes` - Document what was changed

**Common Patterns:**

```javascript
// Code Discovery Pattern
get_symbols_overview → find_symbol → find_referencing_symbols → think_about_collected_information

// Editing Pattern  
think_about_task_adherence → replace_symbol_body → think_about_whether_you_are_done → summarize_changes

// Search Pattern
search_for_pattern → find_symbol → read_file → think_about_collected_information
```

**Key Rules:**
- **Always prefer symbolic operations** over direct file editing
- **Use wildcards in regex** to avoid brittle exact matches
- **Call think_about_* tools** at workflow checkpoints
- **Store project insights** in memories during discovery
- **Check memories before shell commands** for project-specific commands
