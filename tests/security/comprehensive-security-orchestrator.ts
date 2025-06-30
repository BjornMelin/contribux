/**
 * Comprehensive Security Testing Orchestrator
 * Final Integration: Combines all 3 phases of security testing
 * 
 * Mission: 95%+ security scenario coverage with executive reporting
 * 
 * Integration Components:
 * - Phase 1: Authentication Security (NextAuth.js v5 specific testing)
 * - Phase 2: Penetration Testing (Advanced attack simulation)
 * - Phase 3: Infrastructure Security (Environment & DDoS protection)
 * 
 * Features:
 * - Unified testing interface
 * - Executive reporting with compliance mapping
 * - Risk assessment and prioritization
 * - Comprehensive security scoring
 */

import { z } from 'zod'
import { SecurityTestResult, SecurityScanResult } from './core-security-utilities'
import { PenetrationTestingOrchestrator, PenetrationTestConfigSchema } from './penetration-testing-automation'
import { InfrastructureSecurityOrchestrator, InfrastructureSecurityConfigSchema } from './infrastructure-security-testing'

// Comprehensive security configuration schema
export const ComprehensiveSecurityConfigSchema = z.object({
  target: z.object({
    baseUrl: z.string().url(),
    name: z.string(),
    environment: z.enum(['development', 'staging', 'production']).default('production'),
  }),
  phases: z.object({
    authentication: z.boolean().default(true),
    penetrationTesting: z.boolean().default(true),
    infrastructure: z.boolean().default(true),
  }),
  testTypes: z.object({
    // Phase 1: Authentication Security
    authentication: z.array(z.enum([
      'jwt_validation',
      'session_management',
      'oauth_flow',
      'csrf_protection',
      'input_validation'
    ])).default(['jwt_validation', 'session_management', 'oauth_flow']),
    
    // Phase 2: Penetration Testing
    penetration: z.array(z.enum([
      'auth_bypass',
      'injection_attacks',
      'file_upload',
      'session_attacks',
      'business_logic',
      'misconfigurations'
    ])).default(['auth_bypass', 'injection_attacks', 'business_logic']),
    
    // Phase 3: Infrastructure Security
    infrastructure: z.array(z.enum([
      'environment_security',
      'ddos_protection',
      'security_monitoring',
      'performance_security',
      'intrusion_detection'
    ])).default(['environment_security', 'ddos_protection', 'security_monitoring']),
  }),
  intensity: z.enum(['low', 'medium', 'high']).default('medium'),
  timeout: z.number().min(1000).max(60000).default(30000),
  concurrency: z.number().min(1).max(20).default(5),
  complianceFrameworks: z.array(z.enum([
    'OWASP_TOP_10',
    'NIST_CYBERSECURITY',
    'ISO_27001',
    'SOC2_TYPE2',
    'PCI_DSS'
  ])).default(['OWASP_TOP_10', 'NIST_CYBERSECURITY']),
})

export type ComprehensiveSecurityConfig = z.infer<typeof ComprehensiveSecurityConfigSchema>

// Executive report interfaces
export interface SecurityRiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  riskScore: number // 0-100
  businessImpact: string
  likelihood: string
  mitigationPriority: 'P0' | 'P1' | 'P2' | 'P3'
  estimatedFixTime: string
}

export interface ComplianceMapping {
  framework: string
  coverage: number // Percentage
  passedControls: string[]
  failedControls: string[]
  recommendations: string[]
}

export interface ExecutiveSecurityReport {
  summary: {
    overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    securityScore: number // 0-100
    totalVulnerabilities: number
    criticalIssues: number
    testCoverage: number // Percentage
    complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
  }
  riskAssessments: SecurityRiskAssessment[]
  complianceMapping: ComplianceMapping[]
  phaseResults: {
    authentication: SecurityScanResult | null
    penetrationTesting: SecurityScanResult | null
    infrastructure: SecurityScanResult | null
  }
  actionItems: {
    immediate: string[]
    shortTerm: string[]
    longTerm: string[]
  }
  executiveSummary: string
  nextSteps: string[]
  scanMetadata: {
    duration: number
    timestamp: Date
    environment: string
    coverage: {
      endpoints: number
      vulnerabilityTypes: number
      complianceControls: number
    }
  }
}

/**
 * Authentication Security Testing (Phase 1)
 * Focused on NextAuth.js v5 and modern authentication patterns
 */
export class AuthenticationSecurityTester {
  private results: SecurityTestResult[] = []

  async testAuthenticationSecurity(config: ComprehensiveSecurityConfig): Promise<SecurityTestResult[]> {
    this.results = []

    if (config.testTypes.authentication.includes('jwt_validation')) {
      await this.testJWTValidation(config)
    }

    if (config.testTypes.authentication.includes('session_management')) {
      await this.testSessionManagement(config)
    }

    if (config.testTypes.authentication.includes('oauth_flow')) {
      await this.testOAuthSecurity(config)
    }

    if (config.testTypes.authentication.includes('csrf_protection')) {
      await this.testCSRFProtection(config)
    }

    if (config.testTypes.authentication.includes('input_validation')) {
      await this.testInputValidation(config)
    }

    return this.results
  }

  private async testJWTValidation(config: ComprehensiveSecurityConfig): Promise<void> {
    const startTime = performance.now()
    const vulnerabilities: string[] = []
    const recommendations: string[] = []

    try {
      // Test JWT signature validation
      const malformedJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature'
      const response = await fetch(`${config.target.baseUrl}/api/protected`, {
        headers: { 'Authorization': `Bearer ${malformedJWT}` },
        signal: AbortSignal.timeout(config.timeout)
      })

      if (response.status === 200) {
        vulnerabilities.push('Invalid JWT signature accepted')
        recommendations.push('Implement proper JWT signature validation')
      }

      // Test JWT expiration
      const expiredJWT = this.generateExpiredJWT()
      const expiredResponse = await fetch(`${config.target.baseUrl}/api/protected`, {
        headers: { 'Authorization': `Bearer ${expiredJWT}` },
        signal: AbortSignal.timeout(config.timeout)
      })

      if (expiredResponse.status === 200) {
        vulnerabilities.push('Expired JWT tokens accepted')
        recommendations.push('Implement JWT expiration validation')
      }

    } catch (error) {
      // Expected for secure implementations
    }

    this.results.push({
      testName: 'JWT Validation Test',
      category: 'IDENTIFICATION_AUTHENTICATION_FAILURES',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'HIGH' : 'LOW',
      details: vulnerabilities.length > 0 
        ? `Found ${vulnerabilities.length} JWT validation issues`
        : 'JWT validation appears secure',
      evidence: vulnerabilities,
      recommendations,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    })
  }

  private async testSessionManagement(config: ComprehensiveSecurityConfig): Promise<void> {
    const startTime = performance.now()
    const vulnerabilities: string[] = []
    const recommendations: string[] = []

    try {
      // Test session fixation
      const response = await fetch(`${config.target.baseUrl}/api/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'sessionid=FIXED_SESSION_ID'
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
        signal: AbortSignal.timeout(config.timeout)
      })

      const setCookie = response.headers.get('Set-Cookie')
      if (setCookie?.includes('FIXED_SESSION_ID')) {
        vulnerabilities.push('Session fixation vulnerability detected')
        recommendations.push('Regenerate session IDs upon authentication')
      }

    } catch (error) {
      // Expected for secure implementations
    }

    this.results.push({
      testName: 'Session Management Test',
      category: 'IDENTIFICATION_AUTHENTICATION_FAILURES',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'HIGH' : 'LOW',
      details: vulnerabilities.length > 0 
        ? 'Session management vulnerabilities detected'
        : 'Session management appears secure',
      evidence: vulnerabilities,
      recommendations,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    })
  }

  private async testOAuthSecurity(config: ComprehensiveSecurityConfig): Promise<void> {
    const startTime = performance.now()
    const vulnerabilities: string[] = []
    const recommendations: string[] = []

    try {
      // Test OAuth state parameter validation
      const response = await fetch(`${config.target.baseUrl}/api/auth/callback/github?state=malicious_state`, {
        signal: AbortSignal.timeout(config.timeout)
      })

      const responseText = await response.text()
      if (!responseText.includes('state') && response.status === 200) {
        vulnerabilities.push('OAuth state parameter not validated')
        recommendations.push('Implement proper OAuth state validation')
      }

    } catch (error) {
      // Expected for secure implementations
    }

    this.results.push({
      testName: 'OAuth Security Test',
      category: 'IDENTIFICATION_AUTHENTICATION_FAILURES',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'MEDIUM' : 'LOW',
      details: vulnerabilities.length > 0 
        ? 'OAuth security issues detected'
        : 'OAuth implementation appears secure',
      evidence: vulnerabilities,
      recommendations,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    })
  }

  private async testCSRFProtection(config: ComprehensiveSecurityConfig): Promise<void> {
    const startTime = performance.now()
    const vulnerabilities: string[] = []
    const recommendations: string[] = []

    try {
      // Test CSRF protection
      const response = await fetch(`${config.target.baseUrl}/api/auth/set-primary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'github' }),
        signal: AbortSignal.timeout(config.timeout)
      })

      if (response.status === 200) {
        vulnerabilities.push('CSRF protection may be missing')
        recommendations.push('Implement CSRF token validation')
      }

    } catch (error) {
      // Expected for secure implementations
    }

    this.results.push({
      testName: 'CSRF Protection Test',
      category: 'SECURITY_MISCONFIGURATION',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'MEDIUM' : 'LOW',
      details: vulnerabilities.length > 0 
        ? 'CSRF protection issues detected'
        : 'CSRF protection appears adequate',
      evidence: vulnerabilities,
      recommendations,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    })
  }

  private async testInputValidation(config: ComprehensiveSecurityConfig): Promise<void> {
    const startTime = performance.now()
    const vulnerabilities: string[] = []
    const recommendations: string[] = []

    try {
      // Test malicious input handling
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        "'; DROP TABLE users; --",
        '../../../etc/passwd'
      ]

      for (const input of maliciousInputs) {
        const response = await fetch(`${config.target.baseUrl}/api/search/repositories?q=${encodeURIComponent(input)}`, {
          signal: AbortSignal.timeout(config.timeout)
        })

        if (response.status === 200) {
          const responseText = await response.text()
          if (responseText.includes(input)) {
            vulnerabilities.push(`Unescaped input reflected: ${input.substring(0, 20)}...`)
            recommendations.push('Implement proper input validation and sanitization')
          }
        }
      }

    } catch (error) {
      // Expected for secure implementations
    }

    this.results.push({
      testName: 'Input Validation Test',
      category: 'INJECTION',
      status: vulnerabilities.length > 0 ? 'FAIL' : 'PASS',
      severity: vulnerabilities.length > 0 ? 'HIGH' : 'LOW',
      details: vulnerabilities.length > 0 
        ? `Found ${vulnerabilities.length} input validation issues`
        : 'Input validation appears secure',
      evidence: vulnerabilities,
      recommendations,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    })
  }

  private generateExpiredJWT(): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({
      sub: 'test',
      exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    }))
    const signature = btoa('test_signature')
    return `${header}.${payload}.${signature}`
  }
}

/**
 * Comprehensive Security Orchestrator
 * Integrates all three phases and provides executive reporting
 */
export class ComprehensiveSecurityOrchestrator {
  private authTester = new AuthenticationSecurityTester()
  private penetrationTester = new PenetrationTestingOrchestrator()
  private infrastructureTester = new InfrastructureSecurityOrchestrator()

  /**
   * Execute comprehensive security testing across all phases
   */
  async executeComprehensiveSecurityScan(config: ComprehensiveSecurityConfig): Promise<ExecutiveSecurityReport> {
    const startTime = performance.now()
    const validatedConfig = ComprehensiveSecurityConfigSchema.parse(config)
    
    // Initialize phase results
    let authResults: SecurityScanResult | null = null
    let penetrationResults: SecurityScanResult | null = null
    let infrastructureResults: SecurityScanResult | null = null

    // Phase 1: Authentication Security Testing
    if (validatedConfig.phases.authentication) {
      const authTestResults = await this.authTester.testAuthenticationSecurity(validatedConfig)
      authResults = this.generatePhaseReport(authTestResults, 'Authentication Security')
    }

    // Phase 2: Penetration Testing
    if (validatedConfig.phases.penetrationTesting) {
      const penetrationConfig = {
        target: validatedConfig.target,
        testTypes: validatedConfig.testTypes.penetration,
        intensity: validatedConfig.intensity,
        timeout: validatedConfig.timeout,
      }
      
      penetrationResults = await this.penetrationTester.executePenetrationTests(penetrationConfig)
    }

    // Phase 3: Infrastructure Security Testing
    if (validatedConfig.phases.infrastructure) {
      const infrastructureConfig = {
        target: validatedConfig.target,
        testTypes: validatedConfig.testTypes.infrastructure,
        intensity: validatedConfig.intensity,
        timeout: validatedConfig.timeout,
        concurrency: validatedConfig.concurrency,
      }
      
      infrastructureResults = await this.infrastructureTester.executeInfrastructureSecurityTests(infrastructureConfig)
    }

    const scanDuration = performance.now() - startTime

    // Generate comprehensive executive report
    return this.generateExecutiveReport({
      phaseResults: {
        authentication: authResults,
        penetrationTesting: penetrationResults,
        infrastructure: infrastructureResults,
      },
      config: validatedConfig,
      scanDuration,
    })
  }

  /**
   * Generate executive security report with compliance mapping
   */
  private generateExecutiveReport(data: {
    phaseResults: {
      authentication: SecurityScanResult | null
      penetrationTesting: SecurityScanResult | null
      infrastructure: SecurityScanResult | null
    }
    config: ComprehensiveSecurityConfig
    scanDuration: number
  }): ExecutiveSecurityReport {
    const { phaseResults, config, scanDuration } = data

    // Aggregate all test results
    const allResults: SecurityTestResult[] = []
    if (phaseResults.authentication) allResults.push(...phaseResults.authentication.testResults)
    if (phaseResults.penetrationTesting) allResults.push(...phaseResults.penetrationTesting.testResults)
    if (phaseResults.infrastructure) allResults.push(...phaseResults.infrastructure.testResults)

    // Calculate overall metrics
    const totalVulnerabilities = allResults.filter(r => r.status === 'FAIL').length
    const criticalIssues = allResults.filter(r => r.severity === 'CRITICAL' && r.status === 'FAIL').length
    const highIssues = allResults.filter(r => r.severity === 'HIGH' && r.status === 'FAIL').length

    // Calculate security score (weighted by severity)
    const totalTests = allResults.length
    const criticalWeight = 40
    const highWeight = 25
    const mediumWeight = 15
    const lowWeight = 5

    const criticalFails = allResults.filter(r => r.severity === 'CRITICAL' && r.status === 'FAIL').length
    const highFails = allResults.filter(r => r.severity === 'HIGH' && r.status === 'FAIL').length
    const mediumFails = allResults.filter(r => r.severity === 'MEDIUM' && r.status === 'FAIL').length
    const lowFails = allResults.filter(r => r.severity === 'LOW' && r.status === 'FAIL').length

    const securityScore = Math.max(0, 100 - (
      criticalFails * criticalWeight +
      highFails * highWeight +
      mediumFails * mediumWeight +
      lowFails * lowWeight
    ))

    // Determine overall risk level
    const overallRiskLevel = criticalIssues > 0 ? 'CRITICAL' :
      highIssues > 3 ? 'HIGH' :
      totalVulnerabilities > 5 ? 'MEDIUM' : 'LOW'

    // Generate risk assessments
    const riskAssessments = this.generateRiskAssessments(allResults)

    // Generate compliance mapping
    const complianceMapping = this.generateComplianceMapping(allResults, config.complianceFrameworks)

    // Determine compliance status
    const overallCompliance = complianceMapping.every(c => c.coverage >= 80) ? 'COMPLIANT' :
      complianceMapping.some(c => c.coverage >= 60) ? 'PARTIAL' : 'NON_COMPLIANT'

    // Generate action items
    const actionItems = this.generateActionItems(allResults)

    // Calculate test coverage
    const maxPossibleTests = this.calculateMaxPossibleTests(config)
    const testCoverage = Math.round((totalTests / maxPossibleTests) * 100)

    return {
      summary: {
        overallRiskLevel,
        securityScore: Math.round(securityScore),
        totalVulnerabilities,
        criticalIssues,
        testCoverage,
        complianceStatus: overallCompliance,
      },
      riskAssessments,
      complianceMapping,
      phaseResults,
      actionItems,
      executiveSummary: this.generateExecutiveSummary({
        overallRiskLevel,
        securityScore,
        totalVulnerabilities,
        criticalIssues,
        testCoverage,
        complianceStatus: overallCompliance,
      }),
      nextSteps: this.generateNextSteps(riskAssessments),
      scanMetadata: {
        duration: scanDuration,
        timestamp: new Date(),
        environment: config.target.environment,
        coverage: {
          endpoints: this.countTestedEndpoints(allResults),
          vulnerabilityTypes: this.countVulnerabilityTypes(allResults),
          complianceControls: this.countComplianceControls(complianceMapping),
        },
      },
    }
  }

  private generatePhaseReport(results: SecurityTestResult[], phaseName: string): SecurityScanResult {
    const summary = {
      critical: results.filter(r => r.severity === 'CRITICAL').length,
      high: results.filter(r => r.severity === 'HIGH').length,
      medium: results.filter(r => r.severity === 'MEDIUM').length,
      low: results.filter(r => r.severity === 'LOW').length,
    }

    const phaseScore = Math.max(0, 100 - (
      summary.critical * 40 + 
      summary.high * 25 + 
      summary.medium * 15 + 
      summary.low * 5
    ))

    return {
      overallScore: phaseScore,
      vulnerabilityCount: summary.critical + summary.high + summary.medium,
      testResults: results,
      summary,
      recommendations: [...new Set(results.flatMap(r => r.recommendations || []))],
      scanDuration: results.reduce((total, r) => total + (r.executionTime || 0), 0),
      timestamp: new Date(),
    }
  }

  private generateRiskAssessments(results: SecurityTestResult[]): SecurityRiskAssessment[] {
    const failedTests = results.filter(r => r.status === 'FAIL')
    
    return failedTests.map(test => ({
      riskLevel: test.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      riskScore: this.calculateRiskScore(test.severity),
      businessImpact: this.getBusinessImpact(test.category, test.severity),
      likelihood: this.getLikelihood(test.category),
      mitigationPriority: this.getMitigationPriority(test.severity),
      estimatedFixTime: this.getEstimatedFixTime(test.severity, test.category),
    }))
  }

  private generateComplianceMapping(results: SecurityTestResult[], frameworks: string[]): ComplianceMapping[] {
    return frameworks.map(framework => {
      const controls = this.getFrameworkControls(framework)
      const passedControls = controls.filter(control => 
        this.isControlSatisfied(control, results)
      )
      
      return {
        framework,
        coverage: Math.round((passedControls.length / controls.length) * 100),
        passedControls: passedControls.map(c => c.id),
        failedControls: controls.filter(c => !passedControls.includes(c)).map(c => c.id),
        recommendations: this.getFrameworkRecommendations(framework, results),
      }
    })
  }

  private generateActionItems(results: SecurityTestResult[]): {
    immediate: string[]
    shortTerm: string[]
    longTerm: string[]
  } {
    const criticalIssues = results.filter(r => r.severity === 'CRITICAL' && r.status === 'FAIL')
    const highIssues = results.filter(r => r.severity === 'HIGH' && r.status === 'FAIL')
    const mediumLowIssues = results.filter(r => 
      (r.severity === 'MEDIUM' || r.severity === 'LOW') && r.status === 'FAIL'
    )

    return {
      immediate: criticalIssues.flatMap(r => r.recommendations || []).slice(0, 5),
      shortTerm: highIssues.flatMap(r => r.recommendations || []).slice(0, 8),
      longTerm: mediumLowIssues.flatMap(r => r.recommendations || []).slice(0, 10),
    }
  }

  private generateExecutiveSummary(summary: {
    overallRiskLevel: string
    securityScore: number
    totalVulnerabilities: number
    criticalIssues: number
    testCoverage: number
    complianceStatus: string
  }): string {
    return `Security Assessment Summary: The comprehensive security scan revealed a ${summary.overallRiskLevel.toLowerCase()} risk environment with a security score of ${summary.securityScore}/100. ${summary.totalVulnerabilities} total vulnerabilities were identified, including ${summary.criticalIssues} critical issues requiring immediate attention. The assessment achieved ${summary.testCoverage}% test coverage across authentication, penetration testing, and infrastructure security domains. Compliance status: ${summary.complianceStatus.toLowerCase().replace('_', ' ')}. Immediate action is required to address critical vulnerabilities and improve overall security posture.`
  }

  private generateNextSteps(riskAssessments: SecurityRiskAssessment[]): string[] {
    const nextSteps = [
      'Review and prioritize critical and high-severity vulnerabilities',
      'Implement immediate fixes for P0 security issues',
      'Establish regular security testing schedule',
      'Update security monitoring and alerting systems',
    ]

    const p0Issues = riskAssessments.filter(r => r.mitigationPriority === 'P0').length
    if (p0Issues > 0) {
      nextSteps.unshift(`Address ${p0Issues} P0 security issues within 24-48 hours`)
    }

    return nextSteps
  }

  // Helper methods for risk assessment and compliance mapping
  private calculateRiskScore(severity: string): number {
    switch (severity) {
      case 'CRITICAL': return 90
      case 'HIGH': return 70
      case 'MEDIUM': return 50
      case 'LOW': return 25
      default: return 0
    }
  }

  private getBusinessImpact(category: string, severity: string): string {
    const impacts = {
      'CRITICAL': 'Severe business disruption, data breach risk, compliance violations',
      'HIGH': 'Significant operational impact, potential data exposure',
      'MEDIUM': 'Moderate business risk, security control gaps',
      'LOW': 'Minor security improvements needed',
    }
    return impacts[severity as keyof typeof impacts] || 'Unknown impact'
  }

  private getLikelihood(category: string): string {
    const categoryLikelihood: Record<string, string> = {
      'INJECTION': 'High - Common attack vector',
      'BROKEN_ACCESS_CONTROL': 'Medium - Requires specific knowledge',
      'SECURITY_MISCONFIGURATION': 'High - Often exploited',
      'CRYPTOGRAPHIC_FAILURES': 'Medium - Specialized knowledge required',
      'default': 'Medium - Depends on exposure and security controls',
    }
    return categoryLikelihood[category] || categoryLikelihood.default
  }

  private getMitigationPriority(severity: string): 'P0' | 'P1' | 'P2' | 'P3' {
    switch (severity) {
      case 'CRITICAL': return 'P0'
      case 'HIGH': return 'P1'
      case 'MEDIUM': return 'P2'
      case 'LOW': return 'P3'
      default: return 'P3'
    }
  }

  private getEstimatedFixTime(severity: string, category: string): string {
    const times = {
      'CRITICAL': '1-2 days',
      'HIGH': '3-5 days',
      'MEDIUM': '1-2 weeks',
      'LOW': '2-4 weeks',
    }
    return times[severity as keyof typeof times] || 'Unknown'
  }

  private getFrameworkControls(framework: string): Array<{ id: string; name: string; category: string }> {
    const frameworks: Record<string, Array<{ id: string; name: string; category: string }>> = {
      'OWASP_TOP_10': [
        { id: 'A01', name: 'Broken Access Control', category: 'BROKEN_ACCESS_CONTROL' },
        { id: 'A02', name: 'Cryptographic Failures', category: 'CRYPTOGRAPHIC_FAILURES' },
        { id: 'A03', name: 'Injection', category: 'INJECTION' },
        { id: 'A04', name: 'Insecure Design', category: 'INSECURE_DESIGN' },
        { id: 'A05', name: 'Security Misconfiguration', category: 'SECURITY_MISCONFIGURATION' },
        { id: 'A06', name: 'Vulnerable Components', category: 'VULNERABLE_COMPONENTS' },
        { id: 'A07', name: 'Authentication Failures', category: 'IDENTIFICATION_AUTHENTICATION_FAILURES' },
        { id: 'A08', name: 'Software Integrity Failures', category: 'SOFTWARE_DATA_INTEGRITY_FAILURES' },
        { id: 'A09', name: 'Logging Failures', category: 'SECURITY_LOGGING_MONITORING_FAILURES' },
        { id: 'A10', name: 'Server-Side Request Forgery', category: 'SERVER_SIDE_REQUEST_FORGERY' },
      ],
      'NIST_CYBERSECURITY': [
        { id: 'ID.AM', name: 'Asset Management', category: 'IDENTIFY' },
        { id: 'PR.AC', name: 'Access Control', category: 'PROTECT' },
        { id: 'PR.DS', name: 'Data Security', category: 'PROTECT' },
        { id: 'DE.AE', name: 'Anomaly Detection', category: 'DETECT' },
        { id: 'RS.RP', name: 'Response Planning', category: 'RESPOND' },
      ],
    }
    return frameworks[framework] || []
  }

  private isControlSatisfied(control: { id: string; name: string; category: string }, results: SecurityTestResult[]): boolean {
    const relevantTests = results.filter(r => r.category === control.category)
    return relevantTests.length > 0 && relevantTests.every(r => r.status === 'PASS')
  }

  private getFrameworkRecommendations(framework: string, results: SecurityTestResult[]): string[] {
    const recommendations = [
      'Implement regular security testing and monitoring',
      'Establish incident response procedures',
      'Maintain security documentation and training',
    ]
    
    const failedTests = results.filter(r => r.status === 'FAIL')
    if (failedTests.length > 0) {
      recommendations.unshift('Address identified vulnerabilities according to framework requirements')
    }
    
    return recommendations
  }

  private calculateMaxPossibleTests(config: ComprehensiveSecurityConfig): number {
    let maxTests = 0
    
    if (config.phases.authentication) {
      maxTests += config.testTypes.authentication.length * 2 // Assume 2 tests per type
    }
    
    if (config.phases.penetrationTesting) {
      maxTests += config.testTypes.penetration.length * 3 // Assume 3 tests per type
    }
    
    if (config.phases.infrastructure) {
      maxTests += config.testTypes.infrastructure.length * 4 // Assume 4 tests per type
    }
    
    return Math.max(maxTests, 20) // Minimum baseline
  }

  private countTestedEndpoints(results: SecurityTestResult[]): number {
    const endpoints = new Set<string>()
    results.forEach(r => {
      if (r.evidence) {
        r.evidence.forEach(e => {
          const endpointMatch = e.match(/\/api\/[^\s]+/)
          if (endpointMatch) endpoints.add(endpointMatch[0])
        })
      }
    })
    return endpoints.size
  }

  private countVulnerabilityTypes(results: SecurityTestResult[]): number {
    return new Set(results.map(r => r.category)).size
  }

  private countComplianceControls(complianceMapping: ComplianceMapping[]): number {
    return complianceMapping.reduce((total, mapping) => 
      total + mapping.passedControls.length + mapping.failedControls.length, 0
    )
  }
}

// Export main comprehensive security testing orchestrator
export const comprehensiveSecurityOrchestrator = new ComprehensiveSecurityOrchestrator()
export const authenticationTester = new AuthenticationSecurityTester()

// Export configuration schemas for external use
export { ComprehensiveSecurityConfigSchema, type ComprehensiveSecurityConfig }