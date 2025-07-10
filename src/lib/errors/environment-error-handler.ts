/**
 * Environment Error Handler for Contribux Application
 * Specialized error handling for configuration and environment issues
 */

import { ErrorHandler } from './enhanced-error-handler'
import { z } from 'zod'

// Environment validation schema
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z
    .string()
    .regex(/^sk-[a-zA-Z0-9]{48}$/)
    .optional(),
  REDIS_URL: z.string().url().optional(),
})

// Configuration validation with detailed error messages
export function validateEnvironment() {
  try {
    return environmentSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path.join('.'))

      const invalidVars = error.errors
        .filter(e => e.code !== 'invalid_type' || e.received !== 'undefined')
        .map(e => ({
          field: e.path.join('.'),
          issue: e.message,
          received: 'received' in e ? e.received : 'unknown',
        }))

      throw ErrorHandler.createError(
        'ENVIRONMENT_VALIDATION_ERROR',
        'Application configuration is invalid. Please check environment variables.',
        'configuration',
        'critical',
        {
          context: {
            missingVariables: missingVars,
            invalidVariables: invalidVars,
            environment: process.env.NODE_ENV,
            totalErrors: error.errors.length,
          },
          actionableSteps: [
            'Check your .env file exists and is properly configured',
            'Ensure all required environment variables are set',
            'Verify environment variable values match the expected format',
            'Restart the application after fixing configuration issues',
          ],
          developmentDetails: `Environment validation failed with ${error.errors.length} errors. Missing: ${missingVars.join(', ')}. Invalid: ${invalidVars.map(v => `${v.field} (${v.issue})`).join(', ')}`,
          documentationLinks: [
            '/docs/deployment#environment-variables',
            '/docs/configuration#required-variables',
          ],
          productionMessage: 'Application configuration error. Please contact support.',
        }
      )
    }

    throw error
  }
}

// Database connection validation with specific guidance
export function validateDatabaseConnection(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL

  if (!url) {
    throw ErrorHandler.createError(
      'DATABASE_URL_MISSING',
      'Database configuration is missing.',
      'configuration',
      'critical',
      {
        actionableSteps: [
          'Set the DATABASE_URL environment variable',
          'Ensure the database URL is properly formatted',
          'Check if you are using the correct environment file',
        ],
        developmentDetails:
          'DATABASE_URL environment variable is not set. Required for database connections.',
        documentationLinks: ['/docs/database#connection-setup'],
        productionMessage: 'Database configuration error. Please contact support.',
      }
    )
  }

  try {
    const parsedUrl = new URL(url)

    // Validate protocol
    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
      throw ErrorHandler.createError(
        'DATABASE_PROTOCOL_INVALID',
        'Database URL protocol is invalid.',
        'configuration',
        'high',
        {
          context: {
            protocol: parsedUrl.protocol,
            expectedProtocols: ['postgres:', 'postgresql:'],
          },
          actionableSteps: [
            'Ensure DATABASE_URL starts with postgres:// or postgresql://',
            'Check the database URL format in your configuration',
            'Verify you are not using HTTP/HTTPS protocols for database connections',
          ],
          developmentDetails: `Invalid database protocol: ${parsedUrl.protocol}. Must be postgres:// or postgresql://`,
          documentationLinks: ['/docs/database#connection-format'],
          productionMessage: 'Database configuration error. Please contact support.',
        }
      )
    }

    // Validate host is present
    if (!parsedUrl.hostname) {
      throw ErrorHandler.createError(
        'DATABASE_HOST_MISSING',
        'Database host is missing from connection URL.',
        'configuration',
        'high',
        {
          actionableSteps: [
            'Ensure your DATABASE_URL includes a valid hostname',
            'Check if the database server address is correct',
            'Verify the connection URL format',
          ],
          developmentDetails:
            'Database URL is missing hostname. URL format should be postgres://user:pass@host:port/db',
          documentationLinks: ['/docs/database#connection-format'],
          productionMessage: 'Database configuration error. Please contact support.',
        }
      )
    }

    // Validate database name is present
    if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
      throw ErrorHandler.createError(
        'DATABASE_NAME_MISSING',
        'Database name is missing from connection URL.',
        'configuration',
        'high',
        {
          actionableSteps: [
            'Add the database name to the end of your DATABASE_URL',
            'Ensure the URL format is postgres://user:pass@host:port/database_name',
            'Check if the database exists on your server',
          ],
          developmentDetails:
            'Database URL is missing database name. Add database name after the host: postgres://user:pass@host:port/database_name',
          documentationLinks: ['/docs/database#connection-format'],
          productionMessage: 'Database configuration error. Please contact support.',
        }
      )
    }

    return {
      isValid: true,
      host: parsedUrl.hostname,
      port: parsedUrl.port || '5432',
      database: parsedUrl.pathname.slice(1),
      protocol: parsedUrl.protocol,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'correlationId' in error) {
      throw error // Re-throw enhanced errors
    }

    throw ErrorHandler.createError(
      'DATABASE_URL_INVALID',
      'Database URL format is invalid.',
      'configuration',
      'high',
      {
        originalError: error,
        context: { databaseUrl: url },
        actionableSteps: [
          'Check the DATABASE_URL format: postgres://user:pass@host:port/database',
          'Ensure special characters in the password are URL-encoded',
          'Verify the database URL is a valid URL format',
        ],
        developmentDetails: `Invalid DATABASE_URL format: ${error instanceof Error ? error.message : String(error)}`,
        documentationLinks: ['/docs/database#connection-troubleshooting'],
        productionMessage: 'Database configuration error. Please contact support.',
      }
    )
  }
}

// API key validation with security considerations
export function validateApiKeys() {
  const errors: string[] = []

  // GitHub API key validation
  if (!process.env.GITHUB_CLIENT_ID) {
    errors.push('GITHUB_CLIENT_ID is required for GitHub integration')
  }

  if (!process.env.GITHUB_CLIENT_SECRET) {
    errors.push('GITHUB_CLIENT_SECRET is required for GitHub integration')
  }

  // NextAuth secret validation
  if (!process.env.NEXTAUTH_SECRET) {
    errors.push('NEXTAUTH_SECRET is required for authentication')
  } else if (process.env.NEXTAUTH_SECRET.length < 32) {
    errors.push('NEXTAUTH_SECRET must be at least 32 characters long')
  }

  // OpenAI API key validation (optional but format check if present)
  if (process.env.OPENAI_API_KEY && !/^sk-[a-zA-Z0-9]{48}$/.test(process.env.OPENAI_API_KEY)) {
    errors.push('OPENAI_API_KEY format is invalid (should start with sk- and be 51 characters)')
  }

  if (errors.length > 0) {
    throw ErrorHandler.createError(
      'API_KEYS_INVALID',
      'One or more API keys are missing or invalid.',
      'configuration',
      'critical',
      {
        context: {
          errors,
          environment: process.env.NODE_ENV,
          keyCount: errors.length,
        },
        actionableSteps: [
          'Check all required API keys are set in your environment',
          'Ensure API keys have the correct format and length',
          'Verify API keys are not expired or revoked',
          'Check the documentation for the correct key format',
        ],
        developmentDetails: `API key validation failed: ${errors.join(', ')}`,
        documentationLinks: ['/docs/configuration#api-keys'],
        productionMessage: 'API configuration error. Please contact support.',
      }
    )
  }

  return true
}

// Development environment specific validations
export function validateDevelopmentEnvironment() {
  if (process.env.NODE_ENV !== 'development') {
    return true // Skip development-specific checks
  }

  const warnings: string[] = []

  // Check for development-specific configurations
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.startsWith('http://localhost')) {
    warnings.push('NEXTAUTH_URL should use localhost in development')
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('prod')) {
    warnings.push('DATABASE_URL appears to point to production in development environment')
  }

  if (warnings.length > 0) {
    // Log warnings but don't throw errors for development issues
    console.warn('Development Environment Warnings:', warnings)
  }

  return true
}

// Production environment specific validations
export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') {
    return true // Skip production-specific checks
  }

  const errors: string[] = []

  // Production-specific requirements
  if (!process.env.NEXTAUTH_URL) {
    errors.push('NEXTAUTH_URL is required in production')
  } else if (!process.env.NEXTAUTH_URL.startsWith('https://')) {
    errors.push('NEXTAUTH_URL must use HTTPS in production')
  }

  if (process.env.NEXTAUTH_SECRET === 'development-secret-key-at-least-32-characters-long') {
    errors.push('NEXTAUTH_SECRET must not use the default development value in production')
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')) {
    errors.push('DATABASE_URL should not use localhost in production')
  }

  if (errors.length > 0) {
    throw ErrorHandler.createError(
      'PRODUCTION_CONFIG_INVALID',
      'Production environment configuration is insecure or invalid.',
      'configuration',
      'critical',
      {
        context: {
          errors,
          environment: 'production',
          securityIssues: errors.length,
        },
        actionableSteps: [
          'Update production environment variables with secure values',
          'Use HTTPS URLs for all external services',
          'Generate strong, unique secrets for production',
          'Verify database connections use production endpoints',
        ],
        developmentDetails: `Production security validation failed: ${errors.join(', ')}`,
        documentationLinks: ['/docs/deployment#production-security'],
        productionMessage:
          'Production configuration security error. Please contact support immediately.',
      }
    )
  }

  return true
}

// Comprehensive environment validation
export function validateCompleteEnvironment() {
  try {
    const env = validateEnvironment()
    validateDatabaseConnection()
    validateApiKeys()
    validateDevelopmentEnvironment()
    validateProductionEnvironment()

    return {
      isValid: true,
      environment: env.NODE_ENV,
      validatedAt: new Date().toISOString(),
    }
  } catch (error) {
    // Log critical configuration errors
    console.error('Environment validation failed:', error)
    throw error
  }
}
