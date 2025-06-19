# Contributing to contribux 🤝

Thank you for your interest in contributing to contribux! We're excited to have you help us build the future of AI-powered open source contribution discovery.

## Table of Contents

- [🎯 Vision & Mission](#-vision--mission)
- [🚀 Getting Started](#-getting-started)
- [💡 Ways to Contribute](#-ways-to-contribute)
- [🔧 Development Setup](#-development-setup)
- [📝 Contribution Guidelines](#-contribution-guidelines)
- [🎨 Code Style & Standards](#-code-style--standards)
- [🧪 Testing Requirements](#-testing-requirements)
- [📋 Pull Request Process](#-pull-request-process)
- [🔍 Code Review Guidelines](#-code-review-guidelines)
- [🐛 Bug Reports](#-bug-reports)
- [✨ Feature Requests](#-feature-requests)
- [📚 Documentation](#-documentation)
- [🤖 AI Agent Development](#-ai-agent-development)
- [🏆 Recognition](#-recognition)
- [📞 Getting Help](#-getting-help)

---

## 🎯 Vision & Mission

contribux aims to democratize open source contribution discovery through intelligent AI-powered analysis. We believe that:

- **🚀 Innovation should be accessible**: Everyone deserves tools that help them grow their technical careers
- **🤖 AI should enhance, not replace**: Technology should amplify human decision-making
- **🌍 Open source builds community**: Collaborative development makes everyone stronger
- **⚡ Efficiency matters**: Developer time is precious and should be optimized

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed
- **Git** for version control
- **PostgreSQL 16+** (or Neon account for cloud database)
- **GitHub account** with Personal Access Token
- **OpenAI API key** for AI agent functionality

### Quick Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/contribux.git
   cd contribux
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```
5. **Initialize the database**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
6. **Start the development server**:
   ```bash
   npm run dev
   ```

---

## 💡 Ways to Contribute

### 🐛 **Bug Fixes**
- Fix existing issues from our [Issues page](https://github.com/BjornMelin/contribux/issues)
- Improve error handling and edge cases
- Optimize performance bottlenecks

### ✨ **New Features**
- Implement features from our [roadmap](https://github.com/BjornMelin/contribux/projects)
- Add new AI agent capabilities
- Enhance user experience and interface
- Expand notification channels and integrations

### 📚 **Documentation**
- Improve code comments and documentation
- Write tutorials and how-to guides
- Update API documentation
- Create video walkthroughs

### 🧪 **Testing**
- Add unit tests for untested code
- Write integration tests for API endpoints
- Create E2E tests for user workflows
- Improve test coverage and reliability

### 🎨 **Design & UX**
- Improve UI components and layouts
- Enhance mobile responsiveness
- Optimize user experience flows
- Create new design assets

### 🔧 **Infrastructure**
- Optimize database queries and schema
- Improve CI/CD pipelines
- Enhance monitoring and observability
- Optimize serverless functions

---

## 🔧 Development Setup

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/contribux"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
GITHUB_TOKEN="ghp_your_github_token"

# AI Services
OPENAI_API_KEY="sk-your-openai-key"

# Notifications
RESEND_API_KEY="re_your_resend_key"
TELNYX_API_KEY="your_telnyx_key"

# Background Jobs
UPSTASH_QSTASH_URL="your_qstash_url"
UPSTASH_QSTASH_TOKEN="your_qstash_token"
```

### Development Commands

```bash
# Development
npm run dev                    # Start development server
npm run build                  # Create production build
npm run start                  # Start production server

# Database
npm run db:migrate            # Run database migrations
npm run db:seed               # Seed development data
npm run db:studio             # Open database GUI (Prisma Studio)
npm run db:reset              # Reset database

# Code Quality
npm run lint                  # Run ESLint
npm run lint:fix              # Fix ESLint issues
npm run type-check            # TypeScript type checking
npm run format                # Format code with Prettier

# Testing
npm run test                  # Run unit tests
npm run test:watch            # Run tests in watch mode
npm run test:coverage         # Generate coverage report
npm run test:e2e              # Run E2E tests
npm run test:integration      # Run integration tests

# AI Agents
npm run agents:test           # Test AI agent functionality
npm run agents:validate       # Validate agent configurations
npm run agents:deploy         # Deploy agent definitions
```

---

## 📝 Contribution Guidelines

### Branch Naming Convention

Use descriptive branch names following this pattern:

```
<type>/<short-description>

Examples:
feature/ai-analysis-improvements
bugfix/notification-delivery-issue
docs/api-documentation-update
refactor/database-query-optimization
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(agents): add complexity scoring for Python repositories

fix(notifications): resolve email delivery failures for large batches

docs(api): update GraphQL schema documentation

test(scanner): add integration tests for GitHub API rate limiting
```

### Issue Linking

Always link your PR to relevant issues:

```
Closes #123
Fixes #456
Relates to #789
```

---

## 🎨 Code Style & Standards

### TypeScript Guidelines

- **Strict mode enabled**: Use strict TypeScript configuration
- **Type safety**: Avoid `any` types; use proper type annotations
- **Interface naming**: Use PascalCase for interfaces (`UserPreferences`)
- **Enum naming**: Use PascalCase for enums (`ContributionType`)

### React Component Guidelines

```typescript
// ✅ Good: Functional component with proper typing
interface OpportunityCardProps {
  opportunity: Opportunity;
  onClaim: (id: string) => void;
  className?: string;
}

export const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  onClaim,
  className
}) => {
  // Component implementation
};

// ✅ Good: Use React hooks appropriately
const [isLoading, setIsLoading] = useState(false);
const { data, error } = useSWR('/api/opportunities', fetcher);
```

### Database Guidelines

- **Use Prisma schema**: Define all models in `prisma/schema.prisma`
- **Migration naming**: Use descriptive migration names
- **Index optimization**: Add indexes for commonly queried fields
- **Type safety**: Use Prisma Client for type-safe database operations

### AI Agent Guidelines

- **Agent naming**: Use `Contribux` prefix (e.g., `ContribuxAnalyzer`)
- **Tool definitions**: Provide clear descriptions and parameter schemas
- **Error handling**: Implement robust error handling and fallbacks
- **Cost optimization**: Monitor token usage and implement limits

---

## 🧪 Testing Requirements

### Test Coverage Goals

- **Unit Tests**: 90% line coverage minimum
- **Integration Tests**: All API endpoints
- **E2E Tests**: Critical user workflows
- **Performance Tests**: Key pages and API endpoints

### Testing Patterns

```typescript
// ✅ Good: Unit test example
describe('OpportunityAnalyzer', () => {
  it('should correctly analyze documentation opportunities', async () => {
    const analyzer = new OpportunityAnalyzer();
    const mockIssue = createMockIssue({ type: 'documentation' });
    
    const result = await analyzer.analyze(mockIssue);
    
    expect(result.complexity).toBeLessThan(3);
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.type).toBe('documentation');
  });
});

// ✅ Good: Integration test example
describe('/api/opportunities', () => {
  it('should return filtered opportunities', async () => {
    const response = await request(app)
      .get('/api/opportunities')
      .query({ type: 'bug', minScore: 7 })
      .expect(200);
    
    expect(response.body.opportunities).toBeDefined();
    expect(response.body.opportunities.length).toBeGreaterThan(0);
  });
});
```

### Test Data Management

- **Mock data**: Use factories for generating test data
- **Database isolation**: Each test should use a clean database state
- **External services**: Mock external API calls (GitHub, OpenAI)

---

## 📋 Pull Request Process

### Before Submitting

1. **Sync with main**: Ensure your branch is up-to-date
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run all checks**:
   ```bash
   npm run lint
   npm run type-check
   npm run test
   npm run build
   ```

3. **Update documentation**: Ensure docs reflect your changes

### PR Template

When creating a PR, use this template:

```markdown
## 📝 Description
Brief description of the changes and their purpose.

## 🎯 Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## 🧪 Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## 📋 Checklist
- [ ] Code follows the project's style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No breaking changes or properly documented
```

### Review Process

1. **Automated checks**: All CI checks must pass
2. **Code review**: At least one maintainer approval required
3. **Testing**: Manual testing for significant changes
4. **Documentation**: Ensure documentation is updated

---

## 🔍 Code Review Guidelines

### For Reviewers

- **Be constructive**: Provide specific, actionable feedback
- **Consider impact**: Evaluate performance, security, and maintainability
- **Check tests**: Ensure adequate test coverage
- **Verify documentation**: Confirm docs are updated

### Review Checklist

- [ ] Code follows project conventions
- [ ] Tests are comprehensive and pass
- [ ] Performance impact is considered
- [ ] Security implications are addressed
- [ ] Documentation is updated
- [ ] Breaking changes are documented

---

## 🐛 Bug Reports

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Try the latest version** to see if the bug is fixed
3. **Gather information** about your environment

### Bug Report Template

```markdown
## 🐛 Bug Description
A clear description of the bug.

## 🔄 Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## ✅ Expected Behavior
What you expected to happen.

## ❌ Actual Behavior
What actually happened.

## 🌍 Environment
- OS: [e.g., macOS 12.0]
- Browser: [e.g., Chrome 91]
- Node.js: [e.g., 18.16.0]
- contribux version: [e.g., 2.0.0]

## 📸 Screenshots
If applicable, add screenshots.

## 📄 Additional Context
Any other context about the problem.
```

---

## ✨ Feature Requests

### Feature Request Template

```markdown
## 🚀 Feature Request
A clear description of the feature you'd like to see.

## 🎯 Problem Statement
What problem does this feature solve?

## 💡 Proposed Solution
How should this feature work?

## 🔄 Alternatives Considered
What other solutions did you consider?

## 📈 Impact
Who would benefit from this feature?

## 🛠️ Implementation Notes
Any technical considerations or suggestions.
```

---

## 📚 Documentation

### Documentation Types

- **Code Comments**: Inline documentation for complex logic
- **API Documentation**: OpenAPI/GraphQL schema documentation
- **User Guides**: Step-by-step tutorials
- **Developer Docs**: Architecture and setup guides

### Documentation Standards

- **Clear and concise**: Use simple language
- **Code examples**: Include working code snippets
- **Keep updated**: Update docs with code changes
- **Link appropriately**: Reference related documentation

---

## 🤖 AI Agent Development

### Agent Architecture

contribux uses the OpenAI Agents SDK v1.0 for AI agent orchestration. Each agent has a specific role:

```typescript
// Example agent structure
const ContribuxAnalyzer = new Agent({
  name: "ContribuxAnalyzer",
  model: "gpt-4o-mini-2025-06",
  instructions: "You analyze GitHub issues for contribution viability...",
  tools: [
    {
      type: "function",
      function: {
        name: "analyze_complexity",
        description: "Estimate issue complexity",
        parameters: { /* schema */ }
      }
    }
  ],
  handoffs: ["ContribuxStrategist"]
});
```

### Agent Guidelines

- **Single responsibility**: Each agent should have a focused role
- **Clear instructions**: Provide specific, actionable instructions
- **Tool definitions**: Define tools with proper schemas
- **Cost monitoring**: Track token usage and optimize prompts
- **Error handling**: Implement fallbacks for agent failures

### Testing Agents

```typescript
// Test agent functionality
describe('ContribuxAnalyzer', () => {
  it('should analyze issue complexity correctly', async () => {
    const result = await agent.run({
      messages: [{ role: 'user', content: mockIssueText }]
    });
    
    expect(result.analysis).toBeDefined();
    expect(result.complexity).toBeGreaterThan(0);
    expect(result.complexity).toBeLessThanOrEqual(10);
  });
});
```

---

## 🏆 Recognition

### Contributors Hall of Fame

We recognize contributors in several ways:

- **README acknowledgments**: Top contributors listed in README
- **Release notes**: Contributions highlighted in release notes
- **Social media**: Contributions shared on project social accounts
- **Contributor badges**: Special GitHub badges for significant contributions

### Contribution Levels

- **First-time contributor**: Your first merged PR
- **Regular contributor**: 5+ merged PRs
- **Core contributor**: 15+ merged PRs + consistent participation
- **Maintainer**: Trusted with repository management

---

## 📞 Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Discord**: Real-time chat (coming soon)
- **Email**: maintainers@contribux.dev

### When to Ask for Help

- **Unclear requirements**: Not sure what needs to be done
- **Technical blockers**: Stuck on implementation details
- **Design decisions**: Need input on architecture choices
- **Testing strategy**: Unsure how to test your changes

### Getting Quick Responses

1. **Be specific**: Provide context and details
2. **Include code**: Share relevant code snippets
3. **Describe attempts**: What you've already tried
4. **Tag appropriately**: Use relevant GitHub labels

---

## 🙏 Thank You

Your contributions make contribux better for everyone. Whether you're fixing a typo, adding a feature, or improving documentation, every contribution matters.

**Happy contributing!** 🚀

---

*For questions about this guide, please [open an issue](https://github.com/BjornMelin/contribux/issues/new) or reach out to the maintainers.*
