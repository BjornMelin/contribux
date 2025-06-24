# Command Reference

Complete reference for all development commands available in the contribux project.

## Package Management Commands

### Core Commands (pnpm)

#### **Installation and Dependencies**

```bash
# Install all dependencies
pnpm install

# Add dependencies
pnpm add <package>                    # Production dependency
pnpm add -D <package>                # Development dependency
pnpm add -g <package>                # Global package

# Remove dependencies
pnpm remove <package>                # Remove package
pnpm remove -D <package>             # Remove dev dependency

# Update dependencies
pnpm update                          # Update all packages
pnpm update <package>                # Update specific package
pnpm outdated                        # Check outdated packages
```

#### **Package Information**

```bash
# List dependencies
pnpm list                            # Show dependency tree
pnpm list --depth=0                  # Show top-level only
pnpm list --prod                     # Production dependencies only

# Package details
pnpm info <package>                  # Package information
pnpm why <package>                   # Why package is installed
```

## Development Commands

### Server and Build

```bash
# Development server
pnpm dev                             # Start Next.js development server
pnpm dev:turbo                       # Start with Turbo optimization
pnpm dev:debug                       # Start with debugging enabled

# Production build
pnpm build                           # Build for production
pnpm start                           # Start production server
pnpm preview                         # Preview production build locally

# Build analysis
pnpm build:analyze                   # Analyze bundle size
pnpm build:stats                     # Generate build statistics
```

### Code Quality

```bash
# Linting (Biome)
pnpm lint                            # Check for linting issues
pnpm lint:fix                        # Auto-fix linting issues
pnpm lint:check                      # Check configuration
pnpm lint:ci                         # CI-specific linting

# Formatting (Biome)
pnpm format                          # Format all files
pnpm format:check                    # Check if files need formatting
pnpm format:write                    # Format and write changes

# Type checking
pnpm type-check                      # Run TypeScript compiler
pnpm type-check:watch                # Watch mode for type checking
```

### Testing Commands

```bash
# Basic testing
pnpm test                            # Run all tests
pnpm test:watch                      # Watch mode for tests
pnpm test:ui                         # Test UI interface
pnpm test:run                        # Run tests once (no watch)

# Coverage and reporting
pnpm test:coverage                   # Generate coverage report
pnpm test:coverage:open              # Open coverage report in browser
pnpm test:ci                         # CI mode with verbose output

# Specific test types
pnpm test:db                         # Database-related tests
pnpm test:unit                       # Unit tests only
pnpm test:integration                # Integration tests only
pnpm test:e2e                        # End-to-end tests

# Test utilities
pnpm test:clear                      # Clear test cache
pnpm test:debug                      # Debug tests with inspector
```

### Database Commands

#### **Connection Testing**

```bash
# Test database connections
pnpm db:test-connection              # Test current environment
pnpm db:test-dev                     # Test development database
pnpm db:test-prod                    # Test production database
pnpm db:test-all                     # Test all environments
```

#### **Health and Monitoring**

```bash
# Database health
pnpm db:health                       # Overall health check
pnpm db:status                       # Connection status
pnpm db:ping                         # Simple connectivity test

# Performance monitoring
pnpm db:performance-report           # Comprehensive performance report
pnpm db:slow-queries                 # Identify slow queries
pnpm db:query-stats                  # Query execution statistics
pnpm db:connection-stats             # Connection pool statistics
```

#### **Vector Search Operations**

```bash
# Vector search metrics
pnpm db:vector-metrics               # Vector search performance
pnpm db:embedding-stats              # Embedding coverage statistics
pnpm db:similarity-test              # Test similarity search performance
```

#### **Index Management**

```bash
# Index operations
pnpm db:indexes                      # List all indexes
pnpm db:index-usage                  # Index usage statistics
pnpm db:unused-indexes               # Find unused indexes
pnpm db:analyze                      # Update table statistics
```

#### **Migration and Schema**

```bash
# Schema operations
pnpm db:schema                       # Show current schema
pnpm db:tables                       # List all tables
pnpm db:describe <table>             # Describe table structure

# Migration operations
pnpm db:migrate                      # Run pending migrations
pnpm db:migrate:status               # Show migration status
pnpm db:migrate:rollback             # Rollback last migration
```

## Task Management Commands

### Task Master AI Integration

#### **Project Setup**

```bash
# Initialize Task Master AI
task-master init                     # Initialize in current directory
task-master init --project-root=/path # Initialize in specific path

# Parse requirements
task-master parse-prd docs/prd.txt  # Parse PRD file
task-master parse-prd --append      # Append to existing tasks
task-master parse-prd --research    # Enable AI research
```

#### **Daily Workflow**

```bash
# Task discovery
task-master next                     # Find next available task
task-master list                     # Show all tasks
task-master list --status=pending   # Filter by status
task-master list --with-subtasks    # Include subtasks

# Task details
task-master show <id>                # Show task details
task-master show 1.2                # Show subtask details
task-master show --with-subtasks    # Include all subtasks
```

#### **Task Status Management**

```bash
# Update status
task-master set-status --id=1.2 --status=in-progress
task-master set-status --id=1 --status=done
task-master set-status --id=1.2,1.3 --status=pending

# Bulk status updates
task-master set-status --status=done --from=1 --to=5
task-master set-status --status=deferred --tag=feature-x
```

#### **Task Creation and Modification**

```bash
# Add tasks
task-master add-task --prompt="Implement user auth"
task-master add-task --prompt="Add caching" --research
task-master add-task --priority=high --dependencies=1,2

# Expand tasks
task-master expand --id=1           # Expand specific task
task-master expand --id=1 --research # With AI research
task-master expand --all            # Expand all pending tasks
task-master expand --all --research # Expand all with research
```

#### **Task Updates**

```bash
# Update tasks
task-master update-task --id=1 --prompt="New requirements"
task-master update-subtask --id=1.2 --prompt="Progress notes"
task-master update --from=3 --prompt="Architecture changes"

# Research-enhanced updates
task-master update-task --id=1 --research --prompt="Latest best practices"
```

#### **Analysis and Organization**

```bash
# Complexity analysis
task-master analyze-complexity       # Analyze all tasks
task-master analyze-complexity --research # With AI research
task-master complexity-report        # View analysis results

# Dependencies
task-master add-dependency --id=2 --depends-on=1
task-master remove-dependency --id=2 --depends-on=1
task-master validate-dependencies    # Check for issues
task-master fix-dependencies        # Auto-fix issues

# Organization
task-master move --from=2 --to=5    # Move task position
task-master remove --id=3           # Remove task
task-master clear-subtasks --id=1   # Clear subtasks
```

#### **Tag Management**

```bash
# Tag operations
task-master list-tags               # Show all tags
task-master add-tag --name=feature-auth
task-master use-tag --name=feature-auth
task-master delete-tag --name=old-feature

# Tag with context
task-master add-tag --name=api --description="API development tasks"
task-master copy-tag --from=main --to=backup
```

#### **File Management**

```bash
# Generate files
task-master generate                # Regenerate task files
task-master generate --output=tasks/ # Custom output directory

# Research
task-master research --query="Redis vs in-memory cache"
task-master research --query="Auth patterns" --save-to=1.2
```

## Utility Commands

### Project Maintenance

```bash
# Clean build artifacts
pnpm clean                          # Clean all build outputs
pnpm clean:build                    # Clean build directory only
pnpm clean:cache                    # Clean cache directories
pnpm clean:deps                     # Clean node_modules
pnpm clean:all                      # Clean everything and reinstall

# Reset project state
pnpm reset                          # Reset to clean state
pnpm fresh                          # Fresh install (clean + install)
```

### Development Tools

```bash
# Code generation
pnpm generate                       # Run code generators
pnpm generate:types                 # Generate TypeScript types
pnpm generate:api                   # Generate API client
pnpm generate:docs                  # Generate documentation

# Development helpers
pnpm dev:reset                      # Reset development state
pnpm dev:seed                       # Seed development database
pnpm dev:mock                       # Start with mock data
```

## Environment-Specific Commands

### Development Environment

```bash
# Development setup
pnpm setup:dev                      # Setup development environment
pnpm setup:env                      # Setup environment variables
pnpm setup:db                       # Setup development database

# Development utilities
pnpm dev:logs                       # Show development logs
pnpm dev:profile                    # Profile development build
pnpm dev:bundle                     # Analyze development bundle
```

### Production Environment

```bash
# Production build and deployment
pnpm build:prod                     # Production build
pnpm deploy:staging                 # Deploy to staging
pnpm deploy:prod                    # Deploy to production

# Production checks
pnpm check:prod                     # Pre-production checks
pnpm validate:build                 # Validate production build
pnpm security:audit                 # Security audit
```

### Testing Environments

```bash
# Test environment setup
pnpm test:setup                     # Setup test environment
pnpm test:seed                      # Seed test database
pnpm test:teardown                  # Cleanup test environment

# Specific test environments
pnpm test:dev                       # Run tests against dev DB
pnpm test:staging                   # Run tests against staging
pnpm test:isolated                  # Run with isolated test DB
```

## Git and Version Control

### Git Workflow Commands

```bash
# Branch management
git checkout -b feat/feature-name   # Create feature branch
git checkout -b fix/bug-description # Create fix branch
git checkout -b chore/maintenance   # Create maintenance branch

# Commit workflow
git add .                           # Stage changes
git commit -m "feat: add new feature" # Commit with conventional format
git push -u origin branch-name      # Push and set upstream

# Branch cleanup
git branch -d feature-branch        # Delete local branch
git push origin --delete branch-name # Delete remote branch
git remote prune origin             # Clean up remote references
```

### Pre-commit Validation

```bash
# Quality checks (run before commits)
pnpm pre-commit                     # Run all pre-commit checks
pnpm pre-commit:lint                # Linting only
pnpm pre-commit:test                # Tests only
pnpm pre-commit:types               # Type checking only

# Full validation pipeline
pnpm validate                       # Complete validation
pnpm validate:quick                 # Quick validation (skip slow tests)
pnpm validate:ci                    # CI-style validation
```

## Debugging and Diagnostics

### Development Debugging

```bash
# Debug modes
pnpm dev:debug                      # Development with debugger
pnpm test:debug                     # Debug tests
pnpm build:debug                    # Debug build process

# Diagnostic tools
pnpm diagnose                       # Run diagnostics
pnpm diagnose:deps                  # Dependency diagnostics
pnpm diagnose:config                # Configuration diagnostics
pnpm diagnose:env                   # Environment diagnostics
```

### Performance Analysis

```bash
# Performance profiling
pnpm profile                        # Profile application
pnpm profile:build                  # Profile build process
pnpm profile:test                   # Profile test execution

# Bundle analysis
pnpm analyze                        # Analyze bundle size
pnpm analyze:dependencies           # Analyze dependency sizes
pnpm analyze:duplicates             # Find duplicate dependencies
```

### Logging and Monitoring

```bash
# Log management
pnpm logs                           # Show application logs
pnpm logs:error                     # Show error logs only
pnpm logs:debug                     # Show debug logs
pnpm logs:clear                     # Clear log files

# Monitoring
pnpm monitor                        # Start monitoring
pnpm monitor:performance            # Performance monitoring
pnpm monitor:memory                 # Memory usage monitoring
```

## Custom Scripts and Aliases

### Project-Specific Scripts

```bash
# Custom development workflows
pnpm workflow:feature               # Complete feature workflow
pnpm workflow:hotfix                # Hotfix workflow
pnpm workflow:release               # Release workflow

# Quality assurance
pnpm qa                             # Full QA pipeline
pnpm qa:quick                       # Quick QA checks
pnpm qa:full                        # Comprehensive QA

# Automation
pnpm auto:fix                       # Auto-fix all issues
pnpm auto:update                    # Auto-update dependencies
pnpm auto:optimize                  # Auto-optimize configuration
```

### Aliased Commands

```bash
# Common aliases (if configured)
tm                                  # task-master alias
tm next                            # task-master next
tm show 1.2                        # task-master show 1.2

# Development aliases
d                                   # pnpm dev
t                                   # pnpm test
b                                   # pnpm build
l                                   # pnpm lint
```

## Emergency and Recovery Commands

### Quick Recovery

```bash
# Reset to working state
pnpm emergency:reset                # Emergency reset
pnpm emergency:backup               # Create emergency backup
pnpm emergency:restore              # Restore from backup

# Database recovery
pnpm db:emergency:backup            # Emergency DB backup
pnpm db:emergency:restore           # Emergency DB restore
pnpm db:emergency:reset             # Reset DB to clean state
```

### Troubleshooting

```bash
# Common fixes
pnpm fix:deps                       # Fix dependency issues
pnpm fix:cache                      # Fix cache issues
pnpm fix:types                      # Fix TypeScript issues
pnpm fix:lint                       # Fix linting issues

# System checks
pnpm check:system                   # Check system requirements
pnpm check:config                   # Check configuration
pnpm check:env                      # Check environment variables
```

## Command Composition

### Chained Commands

```bash
# Quality pipeline
pnpm lint && pnpm type-check && pnpm test

# Development workflow
pnpm clean && pnpm install && pnpm dev

# Release preparation
pnpm lint:fix && pnpm format && pnpm test:coverage && pnpm build

# Full validation
pnpm lint && pnpm type-check && pnpm test:coverage && pnpm build && pnpm db:health
```

### Conditional Commands

```bash
# Test-dependent deployment
pnpm test && pnpm build && pnpm deploy:staging

# Quality gates
pnpm lint || (echo "Linting failed" && exit 1)
pnpm test:coverage || (echo "Coverage below threshold" && exit 1)

# Environment-specific
NODE_ENV=production pnpm build
NODE_ENV=test pnpm test:db
```

This command reference provides comprehensive coverage of all available commands for effective development, testing, and maintenance of the contribux platform.
