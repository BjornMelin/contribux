#!/usr/bin/env node

/**
 * Comprehensive Security Dependency Audit
 * 
 * Analyzes all new dependencies for security vulnerabilities, license compliance,
 * and potential security risks. This script addresses the PR review requirement
 * for security auditing of new dependencies like Octokit, WebAuthn, etc.
 */

import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

// New dependencies that need security auditing (from PR review)
const NEW_DEPENDENCIES = [
  '@octokit/plugin-retry',
  '@octokit/plugin-throttling', 
  '@octokit/rest',
  '@octokit/types',
  '@simplewebauthn/server',
  'jose',
  'jsonwebtoken',
  'next-auth',
  'rate-limiter-flexible',
  'ioredis'
];

// Security criteria and thresholds
const SECURITY_CONFIG = {
  maxVulnerabilities: {
    critical: 0,
    high: 0, 
    moderate: 2,
    low: 5
  },
  approvedLicenses: [
    'MIT',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'CC0-1.0'
  ],
  maxPackageSize: 10 * 1024 * 1024, // 10MB
  typosquattingThreshold: 3 // Minimum edit distance
};

class DependencySecurityAuditor {
  constructor() {
    this.results = {
      vulnerabilities: {},
      licenses: {},
      packageSizes: {},
      typosquatting: [],
      recommendations: [],
      passed: true,
      summary: {}
    };
  }

  async runComprehensiveAudit() {
    console.log('🔍 Starting Comprehensive Dependency Security Audit...\n');
    
    try {
      // 1. Run npm audit for known vulnerabilities
      await this.auditVulnerabilities();
      
      // 2. Check licenses for compliance
      await this.auditLicenses();
      
      // 3. Analyze package sizes and security implications
      await this.auditPackageSizes();
      
      // 4. Check for potential typosquatting
      await this.checkTyposquatting();
      
      // 5. Validate version pinning
      await this.validateVersionPinning();
      
      // 6. Check for security updates
      await this.checkSecurityUpdates();
      
      // 7. Generate final report
      await this.generateSecurityReport();
      
    } catch (error) {
      console.error('❌ Audit failed:', error.message);
      this.results.passed = false;
    }
  }

  async auditVulnerabilities() {
    console.log('🛡️  Auditing vulnerabilities...');
    
    try {
      const { stdout } = await execAsync('npm audit --json');
      const auditResult = JSON.parse(stdout);
      
      this.results.vulnerabilities = {
        total: auditResult.metadata?.vulnerabilities?.total || 0,
        levels: auditResult.metadata?.vulnerabilities || {},
        packages: auditResult.vulnerabilities || {}
      };
      
      // Check against security thresholds
      const levels = this.results.vulnerabilities.levels;
      for (const [level, count] of Object.entries(SECURITY_CONFIG.maxVulnerabilities)) {
        if (levels[level] > count) {
          this.results.passed = false;
          this.results.recommendations.push(
            `❌ CRITICAL: ${levels[level]} ${level} vulnerabilities found (max allowed: ${count})`
          );
        }
      }
      
      console.log(`   ✓ Found ${this.results.vulnerabilities.total} total vulnerabilities`);
      
    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities found
      if (error.stdout) {
        const auditResult = JSON.parse(error.stdout);
        this.results.vulnerabilities = {
          total: auditResult.metadata?.vulnerabilities?.total || 0,
          levels: auditResult.metadata?.vulnerabilities || {},
          packages: auditResult.vulnerabilities || {}
        };
        
        // Still check thresholds even on error
        const levels = this.results.vulnerabilities.levels;
        for (const [level, count] of Object.entries(SECURITY_CONFIG.maxVulnerabilities)) {
          if (levels[level] > count) {
            this.results.passed = false;
            this.results.recommendations.push(
              `❌ CRITICAL: ${levels[level]} ${level} vulnerabilities found (max allowed: ${count})`
            );
          }
        }
      } else {
        throw error;
      }
    }
  }

  async auditLicenses() {
    console.log('📄 Auditing licenses...');
    
    try {
      // Use npm ls to get dependency tree with licenses
      const { stdout } = await execAsync('npm ls --json --long --depth=0');
      const dependencyTree = JSON.parse(stdout);
      
      for (const [packageName, info] of Object.entries(dependencyTree.dependencies || {})) {
        if (NEW_DEPENDENCIES.includes(packageName)) {
          const license = info.license || 'UNKNOWN';
          this.results.licenses[packageName] = license;
          
          if (!SECURITY_CONFIG.approvedLicenses.includes(license)) {
            this.results.passed = false;
            this.results.recommendations.push(
              `⚠️  License compliance issue: ${packageName} uses ${license} (not in approved list)`
            );
          }
        }
      }
      
      console.log(`   ✓ Audited ${Object.keys(this.results.licenses).length} package licenses`);
      
    } catch (error) {
      console.warn('   ⚠️  License audit failed, continuing with other checks');
    }
  }

  async auditPackageSizes() {
    console.log('📦 Analyzing package sizes...');
    
    try {
      // Get package sizes from node_modules
      for (const packageName of NEW_DEPENDENCIES) {
        try {
          const { stdout } = await execAsync(`du -sb node_modules/${packageName} 2>/dev/null || echo "0"`);
          const size = parseInt(stdout.trim().split('\t')[0]) || 0;
          this.results.packageSizes[packageName] = size;
          
          if (size > SECURITY_CONFIG.maxPackageSize) {
            this.results.recommendations.push(
              `⚠️  Large package: ${packageName} is ${(size / 1024 / 1024).toFixed(2)}MB (review for bloat)`
            );
          }
        } catch (error) {
          this.results.packageSizes[packageName] = 0;
        }
      }
      
      console.log(`   ✓ Analyzed ${Object.keys(this.results.packageSizes).length} package sizes`);
      
    } catch (error) {
      console.warn('   ⚠️  Package size analysis failed, continuing');
    }
  }

  async checkTyposquatting() {
    console.log('🎯 Checking for typosquatting risks...');
    
    // Known legitimate packages to check against
    const legitimatePackages = [
      'react', 'lodash', 'express', 'request', 'chalk', 'commander',
      'moment', 'bluebird', 'async', 'underscore', 'jquery', 'angular'
    ];
    
    for (const newPkg of NEW_DEPENDENCIES) {
      for (const legitPkg of legitimatePackages) {
        const distance = this.levenshteinDistance(newPkg, legitPkg);
        if (distance <= SECURITY_CONFIG.typosquattingThreshold && distance > 0) {
          this.results.typosquatting.push({
            suspicious: newPkg,
            similar: legitPkg,
            distance: distance
          });
          
          this.results.recommendations.push(
            `🚨 Potential typosquatting: ${newPkg} is similar to ${legitPkg} (distance: ${distance})`
          );
        }
      }
    }
    
    console.log(`   ✓ Checked ${NEW_DEPENDENCIES.length} packages for typosquatting`);
  }

  async validateVersionPinning() {
    console.log('📌 Validating version pinning...');
    
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    for (const packageName of NEW_DEPENDENCIES) {
      const version = dependencies[packageName];
      if (version) {
        // Check if version is properly pinned (no ^ or ~)
        if (version.startsWith('^') || version.startsWith('~')) {
          this.results.recommendations.push(
            `⚠️  Version pinning: Consider pinning ${packageName} to exact version for security`
          );
        }
      }
    }
    
    console.log('   ✓ Validated version pinning strategy');
  }

  async checkSecurityUpdates() {
    console.log('🔄 Checking for security updates...');
    
    try {
      const { stdout } = await execAsync('npm outdated --json');
      const outdated = JSON.parse(stdout);
      
      for (const packageName of NEW_DEPENDENCIES) {
        if (outdated[packageName]) {
          const info = outdated[packageName];
          this.results.recommendations.push(
            `📈 Update available: ${packageName} ${info.current} → ${info.latest}`
          );
        }
      }
      
    } catch (error) {
      // npm outdated exits with code 1 when packages are outdated
      if (error.stdout) {
        const outdated = JSON.parse(error.stdout);
        for (const packageName of NEW_DEPENDENCIES) {
          if (outdated[packageName]) {
            const info = outdated[packageName];
            this.results.recommendations.push(
              `📈 Update available: ${packageName} ${info.current} → ${info.latest}`
            );
          }
        }
      }
    }
    
    console.log('   ✓ Checked for security updates');
  }

  async generateSecurityReport() {
    console.log('\n📊 Generating Security Audit Report...\n');
    
    // Generate summary
    this.results.summary = {
      totalVulnerabilities: this.results.vulnerabilities.total,
      criticalVulnerabilities: this.results.vulnerabilities.levels.critical || 0,
      highVulnerabilities: this.results.vulnerabilities.levels.high || 0,
      licenseIssues: Object.values(this.results.licenses).filter(
        license => !SECURITY_CONFIG.approvedLicenses.includes(license)
      ).length,
      typosquattingRisks: this.results.typosquatting.length,
      recommendationsCount: this.results.recommendations.length,
      auditPassed: this.results.passed
    };
    
    // Console output
    console.log('='.repeat(80));
    console.log('                    DEPENDENCY SECURITY AUDIT REPORT');
    console.log('='.repeat(80));
    console.log(`Status: ${this.results.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Vulnerabilities: ${this.results.summary.totalVulnerabilities}`);
    console.log(`Critical/High: ${this.results.summary.criticalVulnerabilities}/${this.results.summary.highVulnerabilities}`);
    console.log(`License Issues: ${this.results.summary.licenseIssues}`);
    console.log(`Typosquatting Risks: ${this.results.summary.typosquattingRisks}`);
    console.log(`Total Recommendations: ${this.results.summary.recommendationsCount}`);
    console.log('='.repeat(80));
    
    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    // Package-by-package analysis
    console.log('\n📦 PACKAGE ANALYSIS:');
    for (const packageName of NEW_DEPENDENCIES) {
      console.log(`\n${packageName}:`);
      console.log(`  License: ${this.results.licenses[packageName] || 'Unknown'}`);
      console.log(`  Size: ${(this.results.packageSizes[packageName] / 1024).toFixed(2)}KB`);
      
      // Check for package-specific vulnerabilities
      const pkgVulns = Object.values(this.results.vulnerabilities.packages || {})
        .filter(vuln => vuln.name === packageName);
      if (pkgVulns.length > 0) {
        console.log(`  Vulnerabilities: ${pkgVulns.length}`);
      }
    }
    
    // Save detailed report to file
    const reportPath = 'security-audit-report.json';
    writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    // GitHub Actions compatible output
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::set-output name=audit-passed::${this.results.passed}`);
      console.log(`::set-output name=vulnerabilities::${this.results.summary.totalVulnerabilities}`);
      console.log(`::set-output name=critical-high::${this.results.summary.criticalVulnerabilities + this.results.summary.highVulnerabilities}`);
    }
    
    if (!this.results.passed) {
      console.log('\n❌ AUDIT FAILED - Security issues must be resolved before merge');
      process.exit(1);
    } else {
      console.log('\n✅ AUDIT PASSED - Dependencies meet security requirements');
    }
  }

  // Helper function for typosquatting detection
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }
}

// CLI entry point
async function main() {
  const auditor = new DependencySecurityAuditor();
  await auditor.runComprehensiveAudit();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { DependencySecurityAuditor };