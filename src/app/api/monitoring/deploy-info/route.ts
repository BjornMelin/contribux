/**
 * Deployment Information Endpoint
 * Provides deployment validation and build information for CI/CD
 */

import { type NextRequest, NextResponse } from 'next/server'

interface DeploymentInfo {
  deployment: {
    timestamp: string
    environment: string
    region: string
    commit: {
      sha: string
      message: string
      author: string
      branch: string
      ref: string
    }
    build: {
      id: string
      source: string
      created_at: string
    }
    runtime: {
      node_version: string
      platform: string
      architecture: string
    }
  }
  application: {
    name: string
    version: string
    framework: string
    next_version: string
  }
  performance: {
    cold_boot_time?: number
    memory_usage: {
      used: number
      total: number
    }
    build_time?: string
  }
  features: {
    edge_runtime: boolean
    serverless_functions: boolean
    static_generation: boolean
    incremental_regeneration: boolean
  }
}

// Helper functions to reduce cognitive complexity
function getDeploymentData(): DeploymentInfo['deployment'] {
  return {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'unknown',
    commit: {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE || 'unknown',
      author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || 'unknown',
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
      ref: process.env.VERCEL_GIT_PREVIOUS_SHA || 'unknown',
    },
    build: {
      id: process.env.VERCEL_DEPLOYMENT_ID || 'unknown',
      source: process.env.VERCEL_GIT_PROVIDER || 'unknown',
      created_at: process.env.VERCEL_DEPLOYMENT_CREATED_AT || new Date().toISOString(),
    },
    runtime: {
      node_version: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  }
}

function getApplicationData(): DeploymentInfo['application'] {
  return {
    name: 'contribux',
    version: process.env.npm_package_version || '0.1.0',
    framework: 'Next.js',
    next_version: '15.3.4',
  }
}

function getPerformanceData(): DeploymentInfo['performance'] {
  const performance: DeploymentInfo['performance'] = {
    memory_usage: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
    },
  }

  // Add cold boot time if available
  if (process.env.VERCEL_DEPLOYMENT_CREATED_AT) {
    const deployedAt = new Date(process.env.VERCEL_DEPLOYMENT_CREATED_AT)
    const now = new Date()
    performance.cold_boot_time = now.getTime() - deployedAt.getTime()
  }

  return performance
}

function getFeaturesData(): DeploymentInfo['features'] {
  return {
    edge_runtime: true,
    serverless_functions: true,
    static_generation: true,
    incremental_regeneration: true,
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const deploymentInfo: DeploymentInfo = {
      deployment: getDeploymentData(),
      application: getApplicationData(),
      performance: getPerformanceData(),
      features: getFeaturesData(),
    }

    // Add build time information
    if (process.env.VERCEL_BUILD_TIME) {
      deploymentInfo.performance.build_time = process.env.VERCEL_BUILD_TIME
    }

    return NextResponse.json(deploymentInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Content-Type': 'application/json',
        'X-Deployment-ID': deploymentInfo.deployment.build.id,
        'X-Commit-SHA': deploymentInfo.deployment.commit.sha,
        'X-Environment': deploymentInfo.deployment.environment,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to retrieve deployment information',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
}

// Support OPTIONS for CORS preflight
export async function OPTIONS(_request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
