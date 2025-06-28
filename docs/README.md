# Contribux Documentation

Welcome to the comprehensive documentation for the Contribux platform - an AI-powered GitHub contribution
discovery platform built with Next.js 15, TypeScript, and Neon PostgreSQL.

## 📚 Documentation Structure

This documentation is organized by role and purpose to help you find information quickly and efficiently.

### 🛠 Development

Technical implementation guides and standards for developers.

- **[Implementation Guide](./development/implementation-guide.md)** -
  Comprehensive guide for implementing features following KISS principles
- **[Memory Optimization](./development/memory-optimization.md)** -
  Complete memory optimization strategies, results, and monitoring tools
- **[Solo Developer Guide](./development/solo-developer-guide.md)** - Complete maintenance guide for solo developers
- **[Testing Infrastructure](./testing-infrastructure.md)** -
  Complete database testing guide with PGlite, Neon branching, and troubleshooting

### ⚡ Features

Documentation for platform features and capabilities.

- **[Authentication System](./features/authentication.md)** - Multi-provider OAuth with NextAuth.js, including WebAuthn simplification
- **[API Documentation](./features/api-documentation.md)** -
  Complete REST API reference with endpoints, authentication, and examples

### 🔄 Processes

Workflow and process documentation for project management.

- **[Pull Request Workflow](./processes/pull-request-workflow.md)** - PR splitting strategies, templates, and review guidelines
- **[Deployment Guide](./processes/deployment.md)** - Environment setup, deployment process, and monitoring

### 📊 Reports

Analysis reports and project status documentation.

- **[Cleanup Reports](./reports/cleanup-reports.md)** - Parallel cleanup efforts, test improvements, and E2E testing results

## 🚀 Quick Start

### For New Developers

1. Read the [Implementation Guide](./development/implementation-guide.md) to understand the architecture
2. Follow the [Authentication documentation](./features/authentication.md) to understand the OAuth system
3. Review the [Testing Infrastructure](./testing-infrastructure.md) for PGlite and Neon testing patterns
4. Check the [Solo Developer Guide](./development/solo-developer-guide.md) for maintenance workflows
5. Review the [Deployment Guide](./processes/deployment.md) for environment setup

### For Contributors

1. Review the [Pull Request Workflow](./processes/pull-request-workflow.md) for contribution guidelines
2. Understand the [API Documentation](./features/api-documentation.md) for integration work
3. Follow testing standards in [Testing Infrastructure](./testing-infrastructure.md)

### For Operators/DevOps

1. Follow the [Deployment Guide](./processes/deployment.md) for production deployment
2. Review [Memory Optimization](./development/memory-optimization.md) for performance monitoring
3. Check [Cleanup Reports](./reports/cleanup-reports.md) for current system status

## 🏗 Architecture Overview

### Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5.8+
- **Styling**: Tailwind CSS 4.0+, Biome for formatting/linting
- **Database**: Neon PostgreSQL 16 with pgvector extension for vector search
- **AI/ML**: OpenAI Agents SDK, halfvec embeddings (1536 dimensions)
- **Authentication**: NextAuth.js v5 with GitHub OAuth (simplified from WebAuthn)
- **Testing**: Vitest 3.2+ with V8 coverage provider, MSW 2.x for HTTP mocking
- **Package Manager**: pnpm 10.11.1 (strictly enforced)

### Key Principles

- **KISS (Keep It Simple, Stupid)** - Prefer straightforward solutions over clever abstractions
- **YAGNI (You Aren't Gonna Need It)** - Implement only what's explicitly needed
- **DRY (Don't Repeat Yourself)** - Factor common logic into clear helpers
- **Test-Driven Development** - Write tests first, implement to make them pass
- **Zero-Trust Security** - Never trust, always verify

## 📈 Current Status

### Test Coverage

- **Pass Rate**: 89.5% (598 passing, 70 failing out of 668 total tests)
- **Recent Improvement**: +4.4% pass rate increase (31 fewer failing tests)
- **Coverage Target**: 90%+ through meaningful tests, not line-targeting

### Key Achievements

- ✅ **Core GitHub API Client** implemented with Octokit v5
- ✅ **Authentication Simplified** to GitHub OAuth only (removed WebAuthn complexity)
- ✅ **Comprehensive Test Infrastructure** with MSW 2.x and Vitest
- ✅ **Memory Optimized** to 4.22 MB heap usage (excellent efficiency)
- ✅ **Security Implementation** with zero-trust architecture
- ✅ **Documentation Organized** into role-based structure

### Recent Changes

- **Documentation Consolidation**: Moved from scattered root files to organized structure
- **Import Fixes**: Resolved Lucide React compatibility issues
- **E2E Testing**: Comprehensive OAuth sign-in flow validation
- **Performance Optimization**: Bundle size reduction and memory monitoring
- **Test Reliability**: Improved from 85.1% to 89.5% pass rate

## 🔍 Finding Information

### By Role

- **Developers**: Start with [Implementation Guide](./development/implementation-guide.md)
- **QA/Testers**: Review [Testing Infrastructure](./testing-infrastructure.md)
- **DevOps**: Check [Deployment Guide](./processes/deployment.md)
- **API Users**: See [API Documentation](./features/api-documentation.md)
- **Security**: Review [Authentication System](./features/authentication.md)

### By Task

- **Setting up development**: [Implementation Guide](./development/implementation-guide.md) + [Authentication](./features/authentication.md)
- **Writing tests**: [Testing Infrastructure](./testing-infrastructure.md)
- **Optimizing performance**: [Memory Optimization](./development/memory-optimization.md)
- **Creating PRs**: [Pull Request Workflow](./processes/pull-request-workflow.md)
- **Deploying**: [Deployment Guide](./processes/deployment.md)
- **Understanding APIs**: [API Documentation](./features/api-documentation.md)

### By Problem

- **Authentication issues**: [Authentication System](./features/authentication.md)
- **Test failures**: [Testing Infrastructure](./testing-infrastructure.md) + [Cleanup Reports](./reports/cleanup-reports.md)
- **Performance problems**: [Memory Optimization](./development/memory-optimization.md)
- **Deployment issues**: [Deployment Guide](./processes/deployment.md)
- **PR review bottlenecks**: [Pull Request Workflow](./processes/pull-request-workflow.md)

## 📞 Support

- **Issues**: Create GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Documentation Issues**: Report documentation problems as GitHub issues
- **Security Issues**: Follow responsible disclosure in SECURITY.md

## 🤝 Contributing

1. Read the [Pull Request Workflow](./processes/pull-request-workflow.md)
2. Follow the [Implementation Guide](./development/implementation-guide.md) standards
3. Ensure tests pass and maintain 90%+ coverage
4. Update documentation for new features
5. Follow the conventional commit format

## 📝 Documentation Standards

This documentation follows these principles:

- **Role-based organization** for quick navigation
- **Task-oriented structure** within each document
- **Cross-references** between related documents
- **Code examples** for all technical concepts
- **Regular updates** to maintain accuracy

---

_This documentation structure was established on 2025-06-24 as part of the comprehensive project organization effort._
