#!/usr/bin/env node

/**
 * Test Data Seeding Script for contribux
 * Generates realistic test data with proper embeddings for vector search testing
 */

const { neon } = require('@neondatabase/serverless')
const _crypto = require('node:crypto')

class TestDataSeeder {
  constructor(databaseUrl) {
    this.sql = neon(databaseUrl)
  }

  async seedAll() {
    try {
      // Clear existing data
      await this.clearTestData()

      // Seed data in dependency order
      const users = await this.seedUsers()
      const repositories = await this.seedRepositories()
      const opportunities = await this.seedOpportunities(repositories)
      await this.seedUserPreferences(users)
      await this.seedUserRepositoryInteractions(users, repositories)
      await this.seedNotifications(users, opportunities)
      await this.seedContributionOutcomes(users, opportunities)
      await this.generateSummary()
    } catch (_error) {
      process.exit(1)
    }
  }

  async clearTestData() {
    const clearSQL = `
      TRUNCATE user_repository_interactions CASCADE;
      TRUNCATE contribution_outcomes CASCADE;
      TRUNCATE notifications CASCADE;
      TRUNCATE user_preferences CASCADE;
      TRUNCATE opportunities CASCADE;
      TRUNCATE repositories CASCADE;
      TRUNCATE users CASCADE;
    `

    await this.sql.unsafe(clearSQL)
  }

  async seedUsers() {
    const testUsers = [
      {
        github_id: 1001,
        github_username: 'alice-dev',
        github_name: 'Alice Johnson',
        email: 'alice@example.com',
        bio: 'Full-stack developer passionate about open source and AI',
        company: 'TechCorp',
        location: 'San Francisco, CA',
        role: 'developer',
        preferred_languages: ['JavaScript', 'TypeScript', 'Python'],
        skill_level: 'advanced',
        availability_hours: 20,
      },
      {
        github_id: 1002,
        github_username: 'bob-ml',
        github_name: 'Bob Chen',
        email: 'bob@example.com',
        bio: 'Machine learning engineer transitioning to AI research',
        company: 'AI Labs',
        location: 'Seattle, WA',
        role: 'developer',
        preferred_languages: ['Python', 'R', 'Julia'],
        skill_level: 'expert',
        availability_hours: 15,
      },
      {
        github_id: 1003,
        github_username: 'carol-backend',
        github_name: 'Carol Smith',
        email: 'carol@example.com',
        bio: 'Backend engineer with focus on distributed systems',
        company: 'CloudTech',
        location: 'Austin, TX',
        role: 'developer',
        preferred_languages: ['Go', 'Rust', 'Java'],
        skill_level: 'advanced',
        availability_hours: 12,
      },
      {
        github_id: 1004,
        github_username: 'david-frontend',
        github_name: 'David Kim',
        email: 'david@example.com',
        bio: 'Frontend developer interested in modern web technologies',
        company: 'WebStudio',
        location: 'New York, NY',
        role: 'developer',
        preferred_languages: ['JavaScript', 'TypeScript', 'CSS'],
        skill_level: 'intermediate',
        availability_hours: 25,
      },
      {
        github_id: 1005,
        github_username: 'eva-devops',
        github_name: 'Eva Rodriguez',
        email: 'eva@example.com',
        bio: 'DevOps engineer passionate about infrastructure as code',
        company: 'Infrastructure Inc',
        location: 'Denver, CO',
        role: 'developer',
        preferred_languages: ['Python', 'Bash', 'YAML'],
        skill_level: 'advanced',
        availability_hours: 18,
      },
    ]

    const insertedUsers = []

    for (const user of testUsers) {
      // Generate a fake embedding (in real app, this would come from OpenAI)
      const embedding = this.generateFakeEmbedding()

      const result = await this.sql`
        INSERT INTO users (
          github_id, github_username, github_name, email, bio, company, location,
          role, preferred_languages, skill_level, availability_hours, profile_embedding,
          last_github_sync, total_contributions, streak_days
        ) VALUES (
          ${user.github_id}, ${user.github_username}, ${user.github_name}, 
          ${user.email}, ${user.bio}, ${user.company}, ${user.location},
          ${user.role}::user_role, ${user.preferred_languages}, ${user.skill_level}::skill_level, 
          ${user.availability_hours}, ${embedding},
          NOW() - INTERVAL '1 hour', ${Math.floor(Math.random() * 500) + 50}, ${Math.floor(Math.random() * 100)}
        ) RETURNING id, github_username
      `

      insertedUsers.push(result[0])
    }
    return insertedUsers
  }

  async seedRepositories() {
    const testRepos = [
      {
        github_id: 2001,
        full_name: 'ai-tools/vector-search',
        name: 'vector-search',
        description: 'High-performance vector similarity search engine with PostgreSQL integration',
        owner_login: 'ai-tools',
        language: 'Python',
        topics: ['machine-learning', 'vector-search', 'postgresql', 'ai'],
        stars_count: 1250,
        forks_count: 180,
        open_issues_count: 23,
        complexity_level: 'advanced',
        contributor_friendliness: 85,
        learning_potential: 90,
      },
      {
        github_id: 2002,
        full_name: 'webdev/react-components',
        name: 'react-components',
        description: 'Modern React component library with TypeScript and Storybook',
        owner_login: 'webdev',
        language: 'TypeScript',
        topics: ['react', 'typescript', 'components', 'ui-library'],
        stars_count: 3200,
        forks_count: 420,
        open_issues_count: 45,
        complexity_level: 'intermediate',
        contributor_friendliness: 92,
        learning_potential: 85,
      },
      {
        github_id: 2003,
        full_name: 'backend/microservices-toolkit',
        name: 'microservices-toolkit',
        description: 'Comprehensive toolkit for building microservices with Go',
        owner_login: 'backend',
        language: 'Go',
        topics: ['microservices', 'golang', 'distributed-systems', 'docker'],
        stars_count: 890,
        forks_count: 125,
        open_issues_count: 18,
        complexity_level: 'advanced',
        contributor_friendliness: 78,
        learning_potential: 88,
      },
      {
        github_id: 2004,
        full_name: 'devtools/cli-builder',
        name: 'cli-builder',
        description: 'Easy-to-use CLI application builder for Node.js developers',
        owner_login: 'devtools',
        language: 'JavaScript',
        topics: ['cli', 'nodejs', 'developer-tools', 'automation'],
        stars_count: 560,
        forks_count: 89,
        open_issues_count: 12,
        complexity_level: 'beginner',
        contributor_friendliness: 95,
        learning_potential: 75,
      },
      {
        github_id: 2005,
        full_name: 'infrastructure/k8s-operator',
        name: 'k8s-operator',
        description: 'Kubernetes operator for managing PostgreSQL clusters',
        owner_login: 'infrastructure',
        language: 'Go',
        topics: ['kubernetes', 'operator', 'postgresql', 'devops'],
        stars_count: 2100,
        forks_count: 310,
        open_issues_count: 35,
        complexity_level: 'expert',
        contributor_friendliness: 70,
        learning_potential: 95,
      },
    ]

    const insertedRepos = []

    for (const repo of testRepos) {
      // Generate fake embedding for description
      const embedding = this.generateFakeEmbedding()

      // Calculate health scores
      const healthScore = Math.min(
        100,
        repo.stars_count / 50 + repo.contributor_friendliness * 0.3 + repo.learning_potential * 0.2
      )

      const result = await this.sql`
        INSERT INTO repositories (
          github_id, full_name, name, description, url, clone_url,
          owner_login, owner_type, language, topics, stars_count, forks_count,
          open_issues_count, health_score, activity_score, community_score,
          description_embedding, complexity_level, contributor_friendliness,
          learning_potential, first_time_contributor_friendly, last_activity
        ) VALUES (
          ${repo.github_id}, ${repo.full_name}, ${repo.name}, ${repo.description},
          ${`https://github.com/${repo.full_name}`}, ${`https://github.com/${repo.full_name}.git`},
          ${repo.owner_login}, 'Organization', ${repo.language}, ${repo.topics},
          ${repo.stars_count}, ${repo.forks_count}, ${repo.open_issues_count},
          ${healthScore}, ${Math.random() * 30 + 70}, ${Math.random() * 20 + 80},
          ${embedding}, ${repo.complexity_level}::skill_level, ${repo.contributor_friendliness},
          ${repo.learning_potential}, ${repo.contributor_friendliness > 85},
          NOW() - INTERVAL '2 hours'
        ) RETURNING id, full_name
      `

      insertedRepos.push(result[0])
    }
    return insertedRepos
  }

  async seedOpportunities(repositories) {
    const opportunityTypes = ['bug_fix', 'feature', 'documentation', 'test', 'refactor']
    const difficulties = ['beginner', 'intermediate', 'advanced']

    const opportunities = []

    for (const repo of repositories) {
      // Create 3-5 opportunities per repository
      const numOpportunities = Math.floor(Math.random() * 3) + 3

      for (let i = 0; i < numOpportunities; i++) {
        const type = opportunityTypes[Math.floor(Math.random() * opportunityTypes.length)]
        const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)]

        const opportunity = {
          repository_id: repo.id,
          github_issue_number: Math.floor(Math.random() * 1000) + 100,
          title: this.generateOpportunityTitle(type),
          description: this.generateOpportunityDescription(type),
          type: type,
          difficulty: difficulty,
          estimated_hours: Math.floor(Math.random() * 16) + 2,
          priority: Math.floor(Math.random() * 61) + 40, // 40-100
          good_first_issue: difficulty === 'beginner' && Math.random() > 0.5,
          help_wanted: Math.random() > 0.6,
          mentorship_available: Math.random() > 0.7,
        }

        // Generate embeddings for title and description
        const titleEmbedding = this.generateFakeEmbedding()
        const descriptionEmbedding = this.generateFakeEmbedding()

        const result = await this.sql`
          INSERT INTO opportunities (
            repository_id, github_issue_number, title, description, url,
            type, difficulty, estimated_hours, priority, title_embedding,
            description_embedding, complexity_score, learning_value, impact_score,
            good_first_issue, help_wanted, mentorship_available,
            required_skills, technologies
          ) VALUES (
            ${opportunity.repository_id}, ${opportunity.github_issue_number},
            ${opportunity.title}, ${opportunity.description},
            ${`https://github.com/example/repo/issues/${opportunity.github_issue_number}`},
            ${opportunity.type}::contribution_type, ${opportunity.difficulty}::skill_level,
            ${opportunity.estimated_hours}, ${opportunity.priority}, ${titleEmbedding},
            ${descriptionEmbedding}, ${Math.random() * 40 + 30}, ${Math.random() * 40 + 40},
            ${Math.random() * 30 + 50}, ${opportunity.good_first_issue}, ${opportunity.help_wanted},
            ${opportunity.mentorship_available}, ${this.getSkillsForType(type)}, ${this.getTechForType(type)}
          ) RETURNING id, title
        `

        opportunities.push(result[0])
      }
    }
    return opportunities
  }

  async seedUserPreferences(users) {
    let _count = 0
    for (const user of users) {
      await this.sql`
        INSERT INTO user_preferences (
          user_id, preferred_contribution_types, preferred_difficulty,
          preferred_languages, min_stars, max_estimated_hours,
          require_mentorship, prefer_good_first_issues,
          notification_frequency, max_notifications_per_day
        ) VALUES (
          ${user.id}, ${['bug_fix', 'feature']}, ${['intermediate', 'advanced']},
          ${['JavaScript', 'TypeScript', 'Python']}, ${Math.floor(Math.random() * 500)},
          ${Math.floor(Math.random() * 20) + 5}, ${Math.random() > 0.8}, ${Math.random() > 0.6},
          ${Math.floor(Math.random() * 24) + 12}, ${Math.floor(Math.random() * 8) + 3}
        )
      `
      _count++
    }
  }

  async seedUserRepositoryInteractions(users, repositories) {
    let _count = 0
    for (const user of users) {
      // Each user interacts with 2-4 repositories
      const numInteractions = Math.floor(Math.random() * 3) + 2
      const selectedRepos = this.shuffleArray([...repositories]).slice(0, numInteractions)

      for (const repo of selectedRepos) {
        await this.sql`
          INSERT INTO user_repository_interactions (
            user_id, repository_id, starred, visited, visit_count,
            time_spent_seconds, opportunities_viewed, opportunities_applied
          ) VALUES (
            ${user.id}, ${repo.id}, ${Math.random() > 0.7}, true,
            ${Math.floor(Math.random() * 10) + 1}, ${Math.floor(Math.random() * 3600) + 300},
            ${Math.floor(Math.random() * 5) + 1}, ${Math.floor(Math.random() * 3)}
          )
        `
        _count++
      }
    }
  }

  async seedNotifications(users, opportunities) {
    let _count = 0
    for (const user of users) {
      // Each user gets 2-5 notifications
      const numNotifications = Math.floor(Math.random() * 4) + 2
      const selectedOpportunities = this.shuffleArray([...opportunities]).slice(0, numNotifications)

      for (const opportunity of selectedOpportunities) {
        await this.sql`
          INSERT INTO notifications (
            user_id, opportunity_id, type, title, message,
            read_at, delivery_status
          ) VALUES (
            ${user.id}, ${opportunity.id}, 'email', 
            ${`New opportunity: ${opportunity.title}`},
            ${'A new contribution opportunity matching your preferences is available.'},
            ${Math.random() > 0.5 ? this.sql`NOW() - INTERVAL '${Math.floor(Math.random() * 48)} hours'` : null},
            'delivered'
          )
        `
        _count++
      }
    }
  }

  async seedContributionOutcomes(users, opportunities) {
    const statuses = ['pending', 'accepted', 'merged', 'rejected']
    let _count = 0

    for (const user of users) {
      // Each user has 1-3 contribution outcomes
      const numOutcomes = Math.floor(Math.random() * 3) + 1
      const selectedOpportunities = this.shuffleArray([...opportunities]).slice(0, numOutcomes)

      for (const opportunity of selectedOpportunities) {
        const status = statuses[Math.floor(Math.random() * statuses.length)]
        const completed = status !== 'pending'

        await this.sql`
          INSERT INTO contribution_outcomes (
            user_id, opportunity_id, status, completed_at,
            github_pr_url, difficulty_rating, learning_rating,
            would_recommend, feedback, time_to_completion
          ) VALUES (
            ${user.id}, ${opportunity.id}, ${status}::outcome_status,
            ${completed ? this.sql`NOW() - INTERVAL '${Math.floor(Math.random() * 168)} hours'` : null},
            ${completed ? `https://github.com/example/repo/pull/${Math.floor(Math.random() * 1000)}` : null},
            ${Math.floor(Math.random() * 5) + 1}, ${Math.floor(Math.random() * 5) + 1},
            ${Math.random() > 0.3}, ${`Great learning experience with ${Math.random() > 0.5 ? 'helpful' : 'challenging'} aspects.`},
            ${completed ? Math.floor(Math.random() * 72) + 4 : null}
          )
        `
        _count++
      }
    }
  }

  async generateSummary() {
    const counts = await this.sql`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM repositories) as repositories,
        (SELECT COUNT(*) FROM opportunities) as opportunities,
        (SELECT COUNT(*) FROM user_preferences) as preferences,
        (SELECT COUNT(*) FROM notifications) as notifications,
        (SELECT COUNT(*) FROM contribution_outcomes) as outcomes,
        (SELECT COUNT(*) FROM user_repository_interactions) as interactions
    `

    const _summary = counts[0]
  }

  // Helper methods
  generateFakeEmbedding() {
    // Generate a 1536-dimensional vector with values between -1 and 1
    const embedding = []
    for (let i = 0; i < 1536; i++) {
      embedding.push((Math.random() - 0.5) * 2)
    }
    return embedding
  }

  generateOpportunityTitle(type) {
    const titles = {
      bug_fix: [
        'Fix memory leak in vector search indexing',
        'Resolve pagination bug in API responses',
        'Fix race condition in concurrent requests',
        'Correct timezone handling in date calculations',
      ],
      feature: [
        'Add support for batch vector operations',
        'Implement dark mode for user interface',
        'Create advanced filtering for search results',
        'Add export functionality for user data',
      ],
      documentation: [
        'Update API documentation with new endpoints',
        'Create comprehensive setup guide',
        'Add examples for common use cases',
        'Improve code comments and inline docs',
      ],
      test: [
        'Add unit tests for authentication module',
        'Create integration tests for API endpoints',
        'Implement performance benchmarks',
        'Add end-to-end testing scenarios',
      ],
      refactor: [
        'Refactor database connection management',
        'Optimize vector similarity algorithms',
        'Simplify component architecture',
        'Improve error handling patterns',
      ],
    }

    const typesTitles = titles[type] || titles.bug_fix
    return typesTitles[Math.floor(Math.random() * typesTitles.length)]
  }

  generateOpportunityDescription(type) {
    const descriptions = {
      bug_fix:
        'This issue involves identifying and fixing a bug that affects system stability and user experience. Good debugging skills and attention to detail required.',
      feature:
        'We need to implement a new feature that will enhance user functionality. This involves design, implementation, and testing of new capabilities.',
      documentation:
        'Help improve our documentation to make the project more accessible to new contributors and users. Clear writing and technical communication skills needed.',
      test: 'Strengthen our test coverage by adding comprehensive tests. Knowledge of testing frameworks and best practices is beneficial.',
      refactor:
        'Code refactoring to improve maintainability and performance. Good understanding of software architecture principles required.',
    }

    return descriptions[type] || descriptions.bug_fix
  }

  getSkillsForType(type) {
    const skills = {
      bug_fix: ['debugging', 'problem-solving', 'testing'],
      feature: ['full-stack-development', 'ui-design', 'api-design'],
      documentation: ['technical-writing', 'markdown', 'communication'],
      test: ['testing-frameworks', 'automation', 'quality-assurance'],
      refactor: ['software-architecture', 'performance-optimization', 'code-review'],
    }

    return skills[type] || skills.bug_fix
  }

  getTechForType(type) {
    const technologies = {
      bug_fix: ['git', 'debugging-tools', 'logging'],
      feature: ['react', 'nodejs', 'postgresql', 'api'],
      documentation: ['markdown', 'git', 'documentation-tools'],
      test: ['jest', 'vitest', 'cypress', 'testing-library'],
      refactor: ['git', 'code-analysis', 'performance-tools'],
    }

    return technologies[type] || technologies.bug_fix
  }

  shuffleArray(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }
}

// CLI Interface
async function main() {
  const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

  if (!databaseUrl) {
    process.exit(1)
  }

  const seeder = new TestDataSeeder(databaseUrl)
  await seeder.seedAll()
}

if (require.main === module) {
  main()
}

module.exports = { TestDataSeeder }
