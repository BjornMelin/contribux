/**
 * Test Failure Analysis Utility
 * Analyzes and categorizes test failures for systematic resolution
 */

interface TestAssertion {
  fullName: string
  status: string
  failureMessages?: string[]
  [key: string]: unknown
}

interface TestResult {
  name: string
  status: string
  assertionResults?: TestAssertion[]
  [key: string]: unknown
}

interface TestResultsData {
  testResults?: TestResult[]
  [key: string]: unknown
}

export interface TestFailure {
  testFile: string
  testName: string
  failureType: 'ui-component' | 'authentication' | 'load-testing' | 'assertion' | 'network'
  errorMessage: string
  category: 'infrastructure' | 'configuration' | 'test-logic' | 'dependencies'
  priority: 'critical' | 'high' | 'medium' | 'low'
  suggestedFix: string
}

export interface FailureAnalysisReport {
  totalFailures: number
  failuresByType: Record<string, number>
  failuresByCategory: Record<string, number>
  criticalFailures: TestFailure[]
  recommendations: string[]
}

/**
 * Analyze test failures from JSON test results
 */
export function analyzeTestFailures(testResults: TestResultsData): FailureAnalysisReport {
  const failures: TestFailure[] = []

  // Parse test results and categorize failures
  if (testResults.testResults) {
    for (const testResult of testResults.testResults) {
      if (testResult.status === 'failed' && testResult.assertionResults) {
        for (const assertion of testResult.assertionResults) {
          if (assertion.status === 'failed') {
            const failure = categorizeFailure(testResult.name, assertion)
            failures.push(failure)
          }
        }
      }
    }
  }

  // Generate analysis report
  const failuresByType = failures.reduce(
    (acc, f) => {
      acc[f.failureType] = (acc[f.failureType] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const failuresByCategory = failures.reduce(
    (acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const criticalFailures = failures.filter(f => f.priority === 'critical')

  return {
    totalFailures: failures.length,
    failuresByType,
    failuresByCategory,
    criticalFailures,
    recommendations: generateRecommendations(failures),
  }
}

/**
 * Categorize individual test failure
 */
function categorizeFailure(testFile: string, assertion: TestAssertion): TestFailure {
  const testName = assertion.fullName
  const errorMessage = assertion.failureMessages?.[0] || 'Unknown error'

  // Analyze error patterns to categorize
  if (errorMessage.includes('Bad credentials')) {
    return {
      testFile,
      testName,
      failureType: 'authentication',
      errorMessage,
      category: 'configuration',
      priority: 'high',
      suggestedFix: 'Configure valid GitHub token in test environment variables',
    }
  }

  if (errorMessage.includes('toHaveValue') && testFile.includes('search-components')) {
    return {
      testFile,
      testName,
      failureType: 'ui-component',
      errorMessage,
      category: 'test-logic',
      priority: 'medium',
      suggestedFix: 'Fix user event timing and async handling in component tests',
    }
  }

  if (errorMessage.includes('expected') && errorMessage.includes('to be')) {
    return {
      testFile,
      testName,
      failureType: 'assertion',
      errorMessage,
      category: 'test-logic',
      priority: 'medium',
      suggestedFix: 'Review test assertions and expected values',
    }
  }

  if (testFile.includes('load-testing')) {
    return {
      testFile,
      testName,
      failureType: 'load-testing',
      errorMessage,
      category: 'infrastructure',
      priority: 'high',
      suggestedFix: 'Optimize load testing configuration and authentication setup',
    }
  }

  // Default categorization
  return {
    testFile,
    testName,
    failureType: 'assertion',
    errorMessage,
    category: 'test-logic',
    priority: 'medium',
    suggestedFix: 'Review test implementation and fix assertion logic',
  }
}

/**
 * Generate recommendations based on failure analysis
 */
function generateRecommendations(failures: TestFailure[]): string[] {
  const recommendations: string[] = []

  const authFailures = failures.filter(f => f.failureType === 'authentication')
  if (authFailures.length > 0) {
    recommendations.push('Set up valid GitHub authentication tokens for integration tests')
  }

  const uiFailures = failures.filter(f => f.failureType === 'ui-component')
  if (uiFailures.length > 0) {
    recommendations.push('Review UI component test patterns for proper async/user event handling')
  }

  const loadTestingFailures = failures.filter(f => f.failureType === 'load-testing')
  if (loadTestingFailures.length > 0) {
    recommendations.push('Optimize load testing infrastructure and token management')
  }

  const infrastructureFailures = failures.filter(f => f.category === 'infrastructure')
  if (infrastructureFailures.length > 0) {
    recommendations.push(
      'Address infrastructure-related test failures through configuration optimization'
    )
  }

  return recommendations
}

/**
 * Generate failure resolution plan
 */
export function generateResolutionPlan(analysis: FailureAnalysisReport): {
  phase1: string[]
  phase2: string[]
  phase3: string[]
} {
  const phase1: string[] = []
  const phase2: string[] = []
  const phase3: string[] = []

  // Phase 1: Critical issues
  if (analysis.criticalFailures.length > 0) {
    phase1.push('Fix critical authentication and configuration issues')
  }
  if (analysis.failuresByCategory.infrastructure > 0) {
    phase1.push('Resolve infrastructure-related test failures')
  }

  // Phase 2: High-impact improvements
  if (analysis.failuresByType['ui-component'] > 0) {
    phase2.push('Optimize UI component test patterns and timing')
  }
  if (analysis.failuresByType['load-testing'] > 0) {
    phase2.push('Enhance load testing infrastructure and token management')
  }
  if (analysis.failuresByType.authentication > 0) {
    phase2.push('Fix authentication token configuration and validation')
  }

  // Phase 3: Final optimizations
  if (analysis.failuresByType.assertion > 0) {
    phase3.push('Review and optimize remaining assertion failures')
  }
  phase3.push('Implement comprehensive test monitoring and reporting')

  return { phase1, phase2, phase3 }
}
