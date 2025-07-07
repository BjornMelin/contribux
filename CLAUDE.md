# CLAUDE.md - CONTRIBUX PROJECT INSTRUCTIONS

**Project**: contribux - AI-powered GitHub contribution discovery platform  
**Stack**: Next.js 15, TypeScript, Neon PostgreSQL, Vector Search, AI-native serverless  
**Package Manager**: pnpm (NEVER use npm/yarn)

```bash
# Essential Commands - Run These First
pnpm install           # Install dependencies
pnpm dev              # Development server  
pnpm test             # Run all tests
pnpm lint && pnpm type-check  # Code quality validation
```

## DATABASE & ARCHITECTURE

**Database**: Neon PostgreSQL 16 + pgvector extension  
**Vector Search**: halfvec(1536) embeddings with HNSW indexes  
**Environment URLs**: `DATABASE_URL`, `DATABASE_URL_DEV`, `DATABASE_URL_TEST`  
**Monitoring**: Performance reports, health checks, vector metrics

**Essential DB Commands:**
```bash
pnpm db:test-connection    # Connection testing
pnpm db:health            # Health monitoring  
pnpm db:performance-report # Performance analysis
pnpm db:vector-metrics    # Vector search metrics
```

### DATABASE MIGRATION WORKFLOWS

**Database management workflows available on request - will provide specific instructions when needed for schema changes, performance optimization, or database operations.**

## PROJECT-SPECIFIC INSTRUCTIONS

### TECH STACK DETAILS

**Frontend**: Next.js 15 + App Router, React 19, TypeScript 5.8+  
**Styling**: Tailwind CSS 4.0+, Biome formatting  
**AI/ML**: OpenAI Agents SDK, vector embeddings  
**Testing**: Vitest 3.2+ with V8 coverage  
**Architecture**: Serverless-first, AI-native, zero maintenance

### BROWSER AUTOMATION & E2E TESTING

**CRITICAL: Use Playwright MCP for comprehensive browser testing and UI automation. Essential for full-stack validation.**

**Playwright MCP Tools:**
```
Navigation & Testing:
- mcp__playwright__playwright_navigate - Open browser and navigate to URL
- mcp__playwright__playwright_fill - Fill form inputs with test data
- mcp__playwright__playwright_click - Click buttons and links
- mcp__playwright__playwright_screenshot - Capture screenshots for verification
- mcp__playwright__playwright_console_logs - Monitor console for errors

API Testing:
- mcp__playwright__playwright_post/get - Make HTTP requests
- mcp__playwright__playwright_expect_response - Set up response expectations
- mcp__playwright__playwright_assert_response - Validate response content

Advanced:
- mcp__playwright__playwright_click_and_switch_tab - Handle OAuth flows
- mcp__playwright__playwright_evaluate - Run JS for performance metrics
- mcp__zen__testgen - Generate comprehensive E2E test suites
```

**Browser Testing Checklist:**
1. ✅ **Authentication Flow**: OAuth, login, logout, session persistence
2. ✅ **Search Functionality**: Query input, results display, filtering
3. ✅ **Repository Interaction**: Card display, details view, bookmarking
4. ✅ **Responsive Design**: Mobile, tablet, desktop viewports
5. ✅ **Performance**: Page load times, API response times
6. ✅ **Accessibility**: Screen reader compatibility, keyboard navigation
7. ✅ **Error Handling**: Network failures, API errors, validation errors
8. ✅ **Cross-Browser**: Chrome, Firefox, Safari compatibility

**CI/CD Integration:**
```bash
# Automated E2E Testing Pipeline
pnpm test:e2e           # Run Playwright tests
pnpm test:e2e:headed    # Run with browser visible (debugging)
pnpm test:e2e:ci        # CI mode with video/screenshots on failure
```

### DIRECTORY STRUCTURE

```
src/: app/, components/(features/ui), lib/(db/github/monitoring), hooks/, types/
tests/: Vitest test suites | .taskmaster/: Task Master AI files
```

### CONFIDENTIALITY & GIT WORKFLOW

**CRITICAL**: Never mention Claude Code in commit messages or PR descriptions  
**Commits**: Use conventional commit format  
**Main Branch**: main (for production)  
**TypeScript**: Always use Zod for schema validation

## SECURITY-SPECIFIC FILE PATTERNS

```bash
# Files requiring extra security review
src/lib/auth/**          # Authentication logic
src/lib/github/**        # External API integration  
src/app/api/**          # API endpoints
src/lib/db/**           # Database operations
.env*                   # Environment files (never commit secrets)
```

## TESTING STRATEGY

**Quality Standards:**
- ✅ Functional organization by business value
- ✅ User-centric test scenarios  
- ✅ Realistic edge cases and error conditions
- ✅ Public API focus (not internal implementation)
- ❌ Coverage-driven testing or line-targeting
- ❌ Artificial timing dependencies