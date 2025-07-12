/**
 * Enterprise Zod 3.x Validation Test Suite
 * Comprehensive testing of modern validation patterns
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createEnterpriseValidationMiddleware,
  formatValidationErrorsForAPI,
  GitHubIssueSchema,
  GitHubRepositorySchema,
  getValidationMetrics,
  getValidationSchema,
  PathTraversalProtectedSchema,
  registerValidationSchema,
  resetValidationMetrics,
  SQLInjectionProtectedSchema,
  trackValidationPerformance,
  versionManager,
  XSSProtectedStringSchema,
} from '../../../src/lib/validation/enterprise-schemas'

import {
  AdvancedSearchRequestSchema,
  createTypeSafeApiResponse,
  createTypeSafeErrorResponse,
  DynamicFormSchema,
  UserRegistrationSchema,
} from '../../../src/lib/validation/zod-examples'

describe('Enterprise Zod Validation Schemas', () => {
  beforeEach(() => {
    resetValidationMetrics()
  })

  afterEach(() => {
    resetValidationMetrics()
  })

  describe('Security Validation Schemas', () => {
    describe('XSSProtectedStringSchema', () => {
      it('should accept safe strings', () => {
        const safeInputs = [
          'Hello World',
          'This is a normal sentence.',
          'Email: user@example.com',
          'Numbers: 123456',
        ]

        for (const input of safeInputs) {
          expect(() => XSSProtectedStringSchema.parse(input)).not.toThrow()
        }
      })

      it('should reject XSS attack patterns', () => {
        const maliciousInputs = [
          '<script>alert("xss")</script>',
          'javascript:alert("xss")',
          '<iframe src="malicious.com"></iframe>',
          'onload="malicious()"',
          'data:text/html,<script>alert("xss")</script>',
          'vbscript:msgbox("xss")',
        ]

        for (const input of maliciousInputs) {
          expect(() => XSSProtectedStringSchema.parse(input)).toThrow()
        }
      })

      it('should HTML encode special characters', () => {
        const input = 'Test & <tag> "quotes" \'apostrophes\''
        const result = XSSProtectedStringSchema.parse(input)
        expect(result).toBe('Test &amp; &lt;tag&gt; &quot;quotes&quot; &#39;apostrophes&#39;')
      })

      it('should trim whitespace', () => {
        const result = XSSProtectedStringSchema.parse('  trimmed  ')
        expect(result).toBe('trimmed')
      })
    })

    describe('SQLInjectionProtectedSchema', () => {
      it('should accept safe strings', () => {
        const safeInputs = ['normal search term', 'product name', 'user123']

        for (const input of safeInputs) {
          expect(() => SQLInjectionProtectedSchema.parse(input)).not.toThrow()
        }
      })

      it('should reject SQL injection patterns', () => {
        const maliciousInputs = [
          "'; DROP TABLE users; --",
          '1 OR 1=1',
          'UNION SELECT * FROM passwords',
          '/* comment */ SELECT',
          "admin'--",
          'user"; DELETE FROM',
        ]

        for (const input of maliciousInputs) {
          expect(() => SQLInjectionProtectedSchema.parse(input)).toThrow()
        }
      })
    })

    describe('PathTraversalProtectedSchema', () => {
      it('should accept safe paths', () => {
        const safePaths = ['documents/file.txt', 'images/photo.jpg', 'folder/subfolder/file.pdf']

        for (const path of safePaths) {
          expect(() => PathTraversalProtectedSchema.parse(path)).not.toThrow()
        }
      })

      it('should reject path traversal attempts', () => {
        const maliciousPaths = [
          '../../../etc/passwd',
          '..\\..\\windows\\system32',
          '~/../../secret',
          '/../../etc/hosts',
          '%2e%2e%2fpasswd',
          '%2f%2e%2e%2f',
        ]

        for (const path of maliciousPaths) {
          expect(() => PathTraversalProtectedSchema.parse(path)).toThrow()
        }
      })
    })
  })

  describe('GitHub Integration Schemas', () => {
    describe('GitHubRepositorySchema', () => {
      const validRepository = {
        id: 123456,
        node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY=',
        name: 'test-repo',
        full_name: 'owner/test-repo',
        owner: {
          login: 'owner',
          id: 789,
          type: 'User' as const,
          avatar_url: 'https://github.com/avatar.jpg',
        },
        description: 'A test repository',
        html_url: 'https://github.com/owner/test-repo',
        clone_url: 'https://github.com/owner/test-repo.git',
        ssh_url: 'git@github.com:owner/test-repo.git',
        default_branch: 'main',
        language: 'TypeScript',
        languages_url: 'https://api.github.com/repos/owner/test-repo/languages',
        topics: ['typescript', 'testing'],
        visibility: 'public' as const,
        archived: false,
        disabled: false,
        fork: false,
        forks_count: 5,
        stargazers_count: 25,
        watchers_count: 25,
        open_issues_count: 3,
        size: 1024,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-12-01T00:00:00Z',
        pushed_at: '2023-12-01T00:00:00Z',
        license: {
          key: 'mit',
          name: 'MIT License',
          spdx_id: 'MIT',
        },
      }

      it('should validate a complete repository object', () => {
        expect(() => GitHubRepositorySchema.parse(validRepository)).not.toThrow()
      })

      it('should reject invalid repository names', () => {
        const invalidRepo = { ...validRepository, name: 'invalid name with spaces' }
        expect(() => GitHubRepositorySchema.parse(invalidRepo)).toThrow()
      })

      it('should validate business logic for archived repositories', () => {
        const archivedRepoWithIssues = {
          ...validRepository,
          archived: true,
          open_issues_count: 5,
        }
        expect(() => GitHubRepositorySchema.parse(archivedRepoWithIssues)).toThrow()
      })

      it('should validate fork repositories cannot have forks', () => {
        const forkWithForks = {
          ...validRepository,
          fork: true,
          forks_count: 2,
        }
        expect(() => GitHubRepositorySchema.parse(forkWithForks)).toThrow()
      })
    })

    describe('GitHubIssueSchema', () => {
      const validIssue = {
        id: 987654,
        node_id: 'MDU6SXNzdWU5ODc2NTQ=',
        number: 42,
        title: 'Test issue title',
        body: 'This is a test issue body',
        user: {
          login: 'testuser',
          id: 123,
          type: 'User' as const,
          avatar_url: 'https://github.com/avatar.jpg',
        },
        labels: [
          {
            id: 1,
            name: 'bug',
            color: 'ff0000',
            description: 'Something is broken',
          },
        ],
        state: 'open' as const,
        state_reason: null,
        assignees: [],
        milestone: null,
        comments: 2,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-12-01T00:00:00Z',
        closed_at: null,
        html_url: 'https://github.com/owner/repo/issues/42',
        repository_url: 'https://api.github.com/repos/owner/repo',
      }

      it('should validate a complete issue object', () => {
        const result = GitHubIssueSchema.parse(validIssue)
        expect(result).toBeDefined()
        expect(result.label_names).toEqual(['bug'])
        expect(result.is_good_first_issue).toBe(false)
        expect(result.age_days).toBeGreaterThan(0)
      })

      it('should detect good first issue labels', () => {
        const goodFirstIssue = {
          ...validIssue,
          labels: [
            {
              id: 2,
              name: 'good first issue',
              color: '00ff00',
              description: 'Good for newcomers',
            },
          ],
        }
        const result = GitHubIssueSchema.parse(goodFirstIssue)
        expect(result.is_good_first_issue).toBe(true)
      })

      it('should validate AI analysis if present', () => {
        const issueWithAI = {
          ...validIssue,
          ai_analysis: {
            difficulty_score: 5,
            impact_score: 7,
            confidence_score: 0.85,
            recommended_skills: ['typescript', 'react'],
            estimated_time_hours: 4.5,
            complexity_factors: ['API integration', 'State management'],
            good_first_issue: false,
            mentorship_available: true,
            analysis_timestamp: '2023-12-01T00:00:00Z',
            model_version: 'gpt-4-1106-preview',
          },
        }
        expect(() => GitHubIssueSchema.parse(issueWithAI)).not.toThrow()
      })
    })
  })

  describe('Advanced User Registration Schema', () => {
    const validUserData = {
      email: 'user@example.com',
      username: 'testuser123',
      password: 'StrongP@ssw0rd123',
      confirmPassword: 'StrongP@ssw0rd123',
      dateOfBirth: '1995-01-01T00:00:00Z',
      accountType: 'individual' as const,
      firstName: 'John',
      lastName: 'Doe',
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: false,
    }

    it('should validate individual user registration', () => {
      expect(() => UserRegistrationSchema.parse(validUserData)).not.toThrow()
    })

    it('should require organization fields for organization accounts', () => {
      const orgData = {
        ...validUserData,
        accountType: 'organization' as const,
        firstName: undefined,
        lastName: undefined,
      }
      expect(() => UserRegistrationSchema.parse(orgData)).toThrow()

      const completeOrgData = {
        ...orgData,
        organizationName: 'Test Corp',
        organizationTaxId: '12-3456789',
      }
      expect(() => UserRegistrationSchema.parse(completeOrgData)).not.toThrow()
    })

    it('should validate password confirmation', () => {
      const mismatchedPassword = {
        ...validUserData,
        confirmPassword: 'DifferentPassword123!',
      }
      expect(() => UserRegistrationSchema.parse(mismatchedPassword)).toThrow(/do not match/)
    })

    it('should enforce age restriction', () => {
      const underage = {
        ...validUserData,
        dateOfBirth: '2015-01-01T00:00:00Z', // Too young
      }
      expect(() => UserRegistrationSchema.parse(underage)).toThrow(/13 years old/)
    })

    it('should require terms acceptance', () => {
      const noTerms = {
        ...validUserData,
        acceptTerms: false,
      }
      expect(() => UserRegistrationSchema.parse(noTerms)).toThrow(/terms of service/)
    })
  })

  describe('Advanced Search Request Schema', () => {
    it('should parse basic search parameters', () => {
      const searchParams = {
        query: 'test search',
        page: '2',
        limit: '30',
        sortBy: 'date',
        sortOrder: 'asc',
      }

      const result = AdvancedSearchRequestSchema.parse(searchParams)
      expect(result.page).toBe(2)
      expect(result.limit).toBe(30)
      expect(result.offset).toBe(30) // (page - 1) * limit
      expect(result.query).toBe('test search')
    })

    it('should parse comma-separated arrays', () => {
      const searchParams = {
        categories: 'bug,feature,documentation',
        tags: 'typescript,react,testing',
        languages: 'javascript,python',
      }

      const result = AdvancedSearchRequestSchema.parse(searchParams)
      expect(result.categories).toEqual(['bug', 'feature', 'documentation'])
      expect(result.tags).toEqual(['typescript', 'react', 'testing'])
      expect(result.languages).toEqual(['javascript', 'python'])
    })

    it('should validate date ranges', () => {
      const validDateRange = {
        dateFrom: '2023-01-01T00:00:00Z',
        dateTo: '2023-12-31T23:59:59Z',
      }
      expect(() => AdvancedSearchRequestSchema.parse(validDateRange)).not.toThrow()

      const invalidDateRange = {
        dateFrom: '2023-12-31T23:59:59Z',
        dateTo: '2023-01-01T00:00:00Z',
      }
      expect(() => AdvancedSearchRequestSchema.parse(invalidDateRange)).toThrow()
    })

    it('should validate star count ranges', () => {
      const validStarRange = {
        minStars: '10',
        maxStars: '100',
      }
      expect(() => AdvancedSearchRequestSchema.parse(validStarRange)).not.toThrow()

      const invalidStarRange = {
        minStars: '100',
        maxStars: '10',
      }
      expect(() => AdvancedSearchRequestSchema.parse(invalidStarRange)).toThrow()
    })

    it('should limit number of active filters', () => {
      const tooManyFilters = {
        categories: 'bug,feature',
        tags: 'typescript,react',
        difficulty: 'advanced',
        minStars: '10',
        maxStars: '100',
        languages: 'javascript,python',
        goodFirstIssue: 'true',
        hasMentorship: 'true',
      }
      expect(() => AdvancedSearchRequestSchema.parse(tooManyFilters)).toThrow(/Too many filters/)
    })
  })

  describe('Dynamic Form Schema', () => {
    it('should validate basic form type', () => {
      const basicForm = {
        formType: 'basic' as const,
        name: 'John Doe',
        email: 'john@example.com',
      }
      expect(() => DynamicFormSchema.parse(basicForm)).not.toThrow()
    })

    it('should require additional fields for advanced form', () => {
      const advancedFormIncomplete = {
        formType: 'advanced' as const,
        name: 'John Doe',
        email: 'john@example.com',
      }
      expect(() => DynamicFormSchema.parse(advancedFormIncomplete)).toThrow()

      const advancedFormComplete = {
        ...advancedFormIncomplete,
        company: 'Tech Corp',
        industry: 'technology' as const,
      }
      expect(() => DynamicFormSchema.parse(advancedFormComplete)).not.toThrow()
    })

    it('should require all fields for enterprise form', () => {
      const enterpriseForm = {
        formType: 'enterprise' as const,
        name: 'John Doe',
        email: 'john@example.com',
        company: 'Big Corp',
        website: 'https://bigcorp.com',
        phone: '+1-555-0123',
        industry: 'technology' as const,
        employeeCount: '201-1000' as const,
        annualRevenue: '10M-100M' as const,
      }
      expect(() => DynamicFormSchema.parse(enterpriseForm)).not.toThrow()
    })
  })

  describe('Performance Monitoring', () => {
    it('should track validation performance', () => {
      const testSchema = z.string().min(1).max(100)

      trackValidationPerformance('test-schema', () => {
        return testSchema.parse('test string')
      })

      const metrics = getValidationMetrics()
      expect(metrics['test-schema']).toBeDefined()
      expect(metrics['test-schema'].count).toBe(1)
      expect(metrics['test-schema'].avgTime).toBeGreaterThan(0)
    })

    it('should track validation errors', () => {
      const testSchema = z.string().min(10)

      expect(() => {
        trackValidationPerformance('error-schema', () => {
          return testSchema.parse('short')
        })
      }).toThrow()

      const metrics = getValidationMetrics()
      expect(metrics['error-schema']).toBeDefined()
      expect(metrics['error-schema'].count).toBe(1)
    })
  })

  describe('Schema Registry and Versioning', () => {
    it('should register and retrieve schemas', () => {
      const testSchema = z.object({ test: z.string() })
      registerValidationSchema('test-schema', testSchema)

      const retrieved = getValidationSchema('test-schema')
      expect(retrieved).toBe(testSchema)
    })

    it('should manage schema versions', () => {
      const v1Schema = z.object({ name: z.string() })
      const v2Schema = z.object({ name: z.string(), age: z.number() })

      versionManager.registerVersion('user', 'v1.0.0', v1Schema)
      versionManager.registerVersion('user', 'v2.0.0', v2Schema)

      const v1 = versionManager.getSchema('user', 'v1.0.0')
      const v2 = versionManager.getSchema('user', 'v2.0.0')
      const latest = versionManager.getLatestSchema('user')

      expect(v1).toBe(v1Schema)
      expect(v2).toBe(v2Schema)
      expect(latest).toBe(v2Schema) // Latest should be v2.0.0
    })

    it('should validate with fallback versions', () => {
      const v1Data = { name: 'John' }
      const v2Data = { name: 'John', age: 30 }

      // Should work with appropriate version
      const result1 = versionManager.validateWithFallback('user', 'v1.0.0', v1Data)
      expect(result1.version).toBe('v1.0.0')

      const result2 = versionManager.validateWithFallback('user', 'v2.0.0', v2Data)
      expect(result2.version).toBe('v2.0.0')
    })
  })

  describe('Error Formatting', () => {
    it('should format validation errors for API responses', () => {
      try {
        UserRegistrationSchema.parse({
          email: 'invalid-email',
          username: 'ab', // too short
          password: 'weak',
          confirmPassword: 'different',
          acceptTerms: false,
        })
      } catch (error) {
        if (error instanceof z.ZodError) {
          const formatted = formatValidationErrorsForAPI(error)
          expect(formatted.field_errors).toBeDefined()
          expect(formatted.field_errors.email).toContain('Please enter a valid email address')
          expect(formatted.field_errors.username).toContain(
            'Username must be at least 3 characters'
          )
        }
      }
    })
  })

  describe('Type-Safe API Responses', () => {
    it('should create paginated responses', () => {
      const mockData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]

      const itemSchema = z.object({
        id: z.number(),
        name: z.string(),
      })

      const response = createTypeSafeApiResponse(
        mockData,
        itemSchema,
        { page: 1, per_page: 10, total: 2 },
        { request_id: '123e4567-e89b-12d3-a456-426614174000', response_time_ms: 150 }
      )

      expect(response.data).toEqual(mockData)
      expect(response.pagination.total_pages).toBe(1)
      expect(response.pagination.has_next).toBe(false)
      expect(response.pagination.has_prev).toBe(false)
      expect(response.metadata.request_id).toBe('123e4567-e89b-12d3-a456-426614174000')
    })

    it('should create type-safe error responses', () => {
      const zodError = new z.ZodError([
        {
          code: z.ZodIssueCode.too_small,
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          message: 'String must contain at least 1 character(s)',
          path: ['name'],
        },
      ])

      const errorResponse = createTypeSafeErrorResponse(
        zodError,
        'validation',
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(errorResponse.success).toBe(false)
      expect(errorResponse.error.code).toBe('VALIDATION_FAILED')
      expect(errorResponse.error.type).toBe('validation')
      expect(errorResponse.error.field_errors).toBeDefined()
      expect(errorResponse.metadata.request_id).toBe('123e4567-e89b-12d3-a456-426614174000')
    })
  })

  describe('Middleware Integration', () => {
    it('should create validation middleware with error handling', async () => {
      let successCalled = false
      let errorCalled = false

      const middleware = createEnterpriseValidationMiddleware(
        z.object({ name: z.string().min(1) }),
        {
          onValidationSuccess: () => {
            successCalled = true
          },
          onValidationError: () => {
            errorCalled = true
          },
        }
      )

      // Test successful validation
      const result = await middleware({ name: 'Test' })
      expect(result.name).toBe('Test')
      expect(successCalled).toBe(true)

      // Test validation error
      try {
        await middleware({ name: '' })
      } catch (_error) {
        expect(errorCalled).toBe(true)
      }
    })
  })
})
