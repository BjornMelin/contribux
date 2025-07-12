/**
 * System Monitoring Metrics
 */

export interface SystemMetrics {
  cpu: {
    usage: number
    cores: number
  }
  memory: {
    used: number
    total: number
    percentage: number
  }
  uptime: number
  loadAverage: number[]
}

export interface ApplicationMetrics {
  requestCount: number
  errorCount: number
  averageResponseTime: number
  activeConnections: number
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return {
    cpu: {
      usage: 45,
      cores: 4,
    },
    memory: {
      used: 2048,
      total: 8192,
      percentage: 25,
    },
    uptime: 86400,
    loadAverage: [1.5, 1.2, 1.0],
  }
}

export async function getApplicationMetrics(): Promise<ApplicationMetrics> {
  return {
    requestCount: 1500,
    errorCount: 25,
    averageResponseTime: 120,
    activeConnections: 45,
  }
}
