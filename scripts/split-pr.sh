#!/bin/bash
# PR Split Script - Break down large PR into 3 reviewable chunks
# Run each section after the previous PR is merged

set -e

echo "PR Split Helper Script"
echo "====================="
echo "This script helps split the large PR into 3 focused PRs"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to confirm action
confirm() {
    read -p "$1 (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Cancelled${NC}"
        exit 1
    fi
}

# Function to check if branch exists
branch_exists() {
    git show-ref --verify --quiet refs/heads/$1
}

echo -e "${YELLOW}Choose PR to create:${NC}"
echo "1) PR 1: Core GitHub Client Implementation"
echo "2) PR 2: Authentication Simplification"
echo "3) PR 3: Test Infrastructure & CI"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo -e "${GREEN}Creating PR 1: Core GitHub Client${NC}"
        
        # Ensure we're on main and up to date
        git checkout main
        git pull origin main
        
        # Create new branch
        BRANCH_NAME="feat/github-client-core"
        if branch_exists $BRANCH_NAME; then
            echo -e "${RED}Branch $BRANCH_NAME already exists!${NC}"
            confirm "Delete existing branch and recreate?"
            git branch -D $BRANCH_NAME
        fi
        
        git checkout -b $BRANCH_NAME
        
        echo "Applying GitHub client files..."
        
        # Core GitHub Client files
        git checkout feat/task-3-github-api-client -- src/lib/github/
        
        # Essential test files
        git checkout feat/task-3-github-api-client -- tests/github/github-client-api.test.ts
        git checkout feat/task-3-github-api-client -- tests/github/github-client-comprehensive.test.ts
        git checkout feat/task-3-github-api-client -- tests/github/github-errors.test.ts
        git checkout feat/task-3-github-api-client -- tests/github/test-helpers.ts
        git checkout feat/task-3-github-api-client -- tests/helpers/github-mocks.ts
        
        # Partially apply setup.ts changes (manual review needed)
        echo -e "${YELLOW}Note: Review tests/setup.ts for necessary changes${NC}"
        git checkout -p feat/task-3-github-api-client -- tests/setup.ts
        
        echo -e "${GREEN}Files staged. Review changes and commit:${NC}"
        echo "git add ."
        echo "git commit -m \"feat: implement core GitHub API client with Octokit v5"
        echo ""
        echo "- Core GitHub client with REST and GraphQL support"
        echo "- GitHub App authentication with automatic token rotation"
        echo "- Built-in rate limiting and retry logic"
        echo "- Comprehensive error handling"
        echo "- Full TypeScript types and Zod validation"
        echo "- Unit tests with 95%+ coverage\""
        echo ""
        echo "git push origin $BRANCH_NAME"
        ;;
        
    2)
        echo -e "${GREEN}Creating PR 2: Authentication Simplification${NC}"
        
        confirm "Has PR 1 been merged to main?"
        
        # Ensure we're on main and up to date
        git checkout main
        git pull origin main
        
        # Create new branch
        BRANCH_NAME="feat/simplified-auth"
        if branch_exists $BRANCH_NAME; then
            echo -e "${RED}Branch $BRANCH_NAME already exists!${NC}"
            confirm "Delete existing branch and recreate?"
            git branch -D $BRANCH_NAME
        fi
        
        git checkout -b $BRANCH_NAME
        
        echo "Applying authentication files..."
        
        # Auth implementation
        git checkout feat/task-3-github-api-client -- src/lib/auth/oauth.ts
        git checkout feat/task-3-github-api-client -- src/lib/auth/middleware.ts
        git checkout feat/task-3-github-api-client -- database/auth-schema.sql
        
        # Auth tests
        if [[ -d "tests/auth" ]]; then
            git checkout feat/task-3-github-api-client -- tests/auth/
        fi
        git checkout feat/task-3-github-api-client -- tests/integration/github/auth-flows.test.ts 2>/dev/null || true
        
        # Documentation
        git checkout feat/task-3-github-api-client -- docs/api/authentication.md
        git checkout feat/task-3-github-api-client -- docs/api/endpoints/auth.md
        git checkout feat/task-3-github-api-client -- docs/adrs/adr-003-authentication-strategy.md
        
        # Environment updates
        git checkout -p feat/task-3-github-api-client -- .env.test.example
        
        # Remove WebAuthn if it exists
        if [[ -f "src/lib/auth/webauthn-config.ts" ]]; then
            git rm src/lib/auth/webauthn-config.ts
            echo -e "${YELLOW}Remember to remove WebAuthn code from oauth.ts and middleware.ts${NC}"
        fi
        
        echo -e "${GREEN}Files staged. Review changes and commit:${NC}"
        echo "git add ."
        echo "git commit -m \"feat: simplify authentication to GitHub OAuth only"
        echo ""
        echo "- Remove WebAuthn complexity for MVP"
        echo "- Streamline auth middleware"
        echo "- Add GitHub OAuth database schema"
        echo "- Comprehensive auth testing"
        echo "- Clear authentication documentation\""
        echo ""
        echo "git push origin $BRANCH_NAME"
        ;;
        
    3)
        echo -e "${GREEN}Creating PR 3: Test Infrastructure & CI${NC}"
        
        confirm "Have PR 1 and PR 2 been merged to main?"
        
        # Ensure we're on main and up to date
        git checkout main
        git pull origin main
        
        # Create new branch
        BRANCH_NAME="feat/test-infrastructure"
        if branch_exists $BRANCH_NAME; then
            echo -e "${RED}Branch $BRANCH_NAME already exists!${NC}"
            confirm "Delete existing branch and recreate?"
            git branch -D $BRANCH_NAME
        fi
        
        git checkout -b $BRANCH_NAME
        
        echo "Applying test infrastructure files..."
        
        # Test infrastructure - apply everything then remove duplicates
        git checkout feat/task-3-github-api-client -- tests/
        git checkout feat/task-3-github-api-client -- vitest*.config.ts
        git checkout feat/task-3-github-api-client -- .github/workflows/
        git checkout feat/task-3-github-api-client -- .gitguardian.yml
        git checkout feat/task-3-github-api-client -- docker-compose.test.yml
        git checkout feat/task-3-github-api-client -- database/init/
        git checkout feat/task-3-github-api-client -- tsconfig.src.json
        
        # Documentation
        git checkout feat/task-3-github-api-client -- docs/
        git checkout feat/task-3-github-api-client -- PARALLEL_CLEANUP_REPORT.md
        
        # Package.json updates
        git checkout -p feat/task-3-github-api-client -- package.json
        
        echo "Removing files from PR 1 and PR 2..."
        
        # Remove files already in PR 1
        git rm -f tests/github/github-client-api.test.ts 2>/dev/null || true
        git rm -f tests/github/github-client-comprehensive.test.ts 2>/dev/null || true
        git rm -f tests/github/github-errors.test.ts 2>/dev/null || true
        git rm -f tests/github/test-helpers.ts 2>/dev/null || true
        git rm -f tests/helpers/github-mocks.ts 2>/dev/null || true
        
        # Remove files already in PR 2
        git rm -rf tests/auth/ 2>/dev/null || true
        git rm -f tests/integration/github/auth-flows.test.ts 2>/dev/null || true
        git rm -f docs/api/authentication.md 2>/dev/null || true
        git rm -f docs/api/endpoints/auth.md 2>/dev/null || true
        git rm -f docs/adrs/adr-003-authentication-strategy.md 2>/dev/null || true
        
        echo -e "${GREEN}Files staged. Review changes and commit:${NC}"
        echo "git add ."
        echo "git commit -m \"test: comprehensive test infrastructure with MSW 2.x"
        echo ""
        echo "- MSW 2.x setup with type-safe mocking"
        echo "- Specialized Vitest configurations"
        echo "- GitHub Actions CI/CD pipelines"
        echo "- Docker Compose for integration testing"
        echo "- Test utilities and helpers"
        echo "- GitGuardian security scanning"
        echo "- 90%+ test coverage\""
        echo ""
        echo "git push origin $BRANCH_NAME"
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the staged changes carefully"
echo "2. Make any necessary adjustments"
echo "3. Commit with the suggested message"
echo "4. Push to origin and create PR"
echo "5. Add appropriate PR description from PR_SPLIT_PLAN.md"