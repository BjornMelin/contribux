/**
 * IP Allowlist System
 * Implements IP-based access control for webhook sources and sensitive endpoints
 * Supports IPv4, IPv6, and CIDR notation with dynamic updates
 */

import { NextRequest } from 'next/server'
import { Redis } from '@redis/client'
import ipaddr from 'ipaddr.js'
import { z } from 'zod'

// IP allowlist configuration
export const IPAllowlistConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowPrivateIPs: z.boolean().default(false),
  allowLocalhost: z.boolean().default(false),
  cacheExpiry: z.number().default(300), // 5 minutes
  strictMode: z.boolean().default(true), // Deny if IP can't be determined
})

export type IPAllowlistConfig = z.infer<typeof IPAllowlistConfigSchema>

// IP entry types
export interface IPEntry {
  value: string
  type: 'ipv4' | 'ipv6' | 'cidr'
  description?: string
  expiresAt?: Date
  addedAt: Date
  addedBy?: string
}

// Known GitHub webhook IP ranges (as of 2025)
// These should be updated periodically from GitHub's API
export const GITHUB_WEBHOOK_IPS = [
  // GitHub Actions
  '140.82.112.0/20',
  '143.55.64.0/20',
  '185.199.108.0/22',
  '192.30.252.0/22',
  '20.201.28.151/32',
  '20.205.243.166/32',
  '20.27.177.113/32',
  '20.87.225.212/32',
  // GitHub Webhooks
  '140.82.112.0/20',
  '143.55.64.0/20',
  '2a0a:a440::/29',
  '2606:50c0::/32',
] as const

// Common CDN and proxy ranges
export const CDN_PROXY_RANGES = {
  cloudflare: [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
  ],
  vercel: [
    '76.76.19.0/24',
    '76.76.21.0/24',
  ],
} as const

/**
 * IP Allowlist Manager
 */
export class IPAllowlistManager {
  private config: IPAllowlistConfig
  private redis: Redis | null
  private inMemoryCache = new Map<string, boolean>()
  private staticAllowlist: Set<string> = new Set()

  constructor(config: IPAllowlistConfig, redis: Redis | null = null) {
    this.config = config
    this.redis = redis
    this.initializeStaticAllowlist()
  }

  /**
   * Initialize static allowlist with known IPs
   */
  private initializeStaticAllowlist(): void {
    // Add GitHub webhook IPs
    GITHUB_WEBHOOK_IPS.forEach(ip => this.staticAllowlist.add(ip))

    // Add localhost if configured
    if (this.config.allowLocalhost) {
      this.staticAllowlist.add('127.0.0.1')
      this.staticAllowlist.add('::1')
    }
  }

  /**
   * Check if an IP is allowed
   */
  async isAllowed(ip: string): Promise<boolean> {
    if (!this.config.enabled) return true

    // Check cache first
    const cached = this.inMemoryCache.get(ip)
    if (cached !== undefined) return cached

    try {
      // Parse and validate IP
      const parsedIP = this.parseIP(ip)
      if (!parsedIP) {
        return !this.config.strictMode
      }

      // Check private IP rules
      if (!this.config.allowPrivateIPs && this.isPrivateIP(parsedIP)) {
        this.cacheResult(ip, false)
        return false
      }

      // Check static allowlist
      if (this.checkStaticAllowlist(parsedIP)) {
        this.cacheResult(ip, true)
        return true
      }

      // Check dynamic allowlist in Redis
      if (this.redis) {
        const allowed = await this.checkDynamicAllowlist(parsedIP)
        this.cacheResult(ip, allowed)
        return allowed
      }

      // Default to deny in strict mode
      return !this.config.strictMode
    } catch (error) {
      console.error('[IPAllowlist] Error checking IP:', error)
      return !this.config.strictMode
    }
  }

  /**
   * Add IP to allowlist
   */
  async addIP(
    ip: string,
    options?: {
      description?: string
      expiresAt?: Date
      addedBy?: string
    }
  ): Promise<void> {
    const entry: IPEntry = {
      value: ip,
      type: this.getIPType(ip),
      description: options?.description,
      expiresAt: options?.expiresAt,
      addedAt: new Date(),
      addedBy: options?.addedBy,
    }

    if (this.redis) {
      const key = `ip-allowlist:${ip}`
      const ttl = options?.expiresAt
        ? Math.floor((options.expiresAt.getTime() - Date.now()) / 1000)
        : undefined

      await this.redis.set(key, JSON.stringify(entry), ttl ? { EX: ttl } : undefined)
    } else {
      // Add to static allowlist if no Redis
      this.staticAllowlist.add(ip)
    }

    // Clear cache
    this.clearCache()
  }

  /**
   * Remove IP from allowlist
   */
  async removeIP(ip: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`ip-allowlist:${ip}`)
    }
    
    this.staticAllowlist.delete(ip)
    this.clearCache()
  }

  /**
   * List all allowed IPs
   */
  async listAllowedIPs(): Promise<IPEntry[]> {
    const entries: IPEntry[] = []

    // Add static IPs
    this.staticAllowlist.forEach(ip => {
      entries.push({
        value: ip,
        type: this.getIPType(ip),
        description: 'Static allowlist',
        addedAt: new Date(0), // Unknown
      })
    })

    // Add dynamic IPs from Redis
    if (this.redis) {
      const keys = await this.redis.keys('ip-allowlist:*')
      for (const key of keys) {
        const data = await this.redis.get(key)
        if (data) {
          try {
            const entry = JSON.parse(data) as IPEntry
            entries.push(entry)
          } catch (error) {
            console.error('[IPAllowlist] Failed to parse entry:', error)
          }
        }
      }
    }

    return entries
  }

  /**
   * Parse IP address
   */
  private parseIP(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
    try {
      return ipaddr.process(ip)
    } catch {
      return null
    }
  }

  /**
   * Check if IP is private
   */
  private isPrivateIP(ip: ipaddr.IPv4 | ipaddr.IPv6): boolean {
    if (ip.kind() === 'ipv4') {
      return (ip as ipaddr.IPv4).range() === 'private'
    } else {
      const range = (ip as ipaddr.IPv6).range()
      return range === 'uniqueLocal' || range === 'linkLocal'
    }
  }

  /**
   * Check static allowlist
   */
  private checkStaticAllowlist(ip: ipaddr.IPv4 | ipaddr.IPv6): boolean {
    for (const allowed of this.staticAllowlist) {
      if (this.ipMatches(ip, allowed)) {
        return true
      }
    }
    return false
  }

  /**
   * Check dynamic allowlist in Redis
   */
  private async checkDynamicAllowlist(ip: ipaddr.IPv4 | ipaddr.IPv6): Promise<boolean> {
    if (!this.redis) return false

    // Check exact match
    const exactKey = `ip-allowlist:${ip.toString()}`
    const exactMatch = await this.redis.get(exactKey)
    if (exactMatch) return true

    // Check CIDR ranges
    const keys = await this.redis.keys('ip-allowlist:*/*')
    for (const key of keys) {
      const cidr = key.replace('ip-allowlist:', '')
      if (this.ipMatches(ip, cidr)) {
        return true
      }
    }

    return false
  }

  /**
   * Check if IP matches allowed entry (supports CIDR)
   */
  private ipMatches(ip: ipaddr.IPv4 | ipaddr.IPv6, allowed: string): boolean {
    try {
      if (allowed.includes('/')) {
        // CIDR notation
        const [prefix, bits] = allowed.split('/')
        const prefixIP = ipaddr.process(prefix)
        
        if (ip.kind() !== prefixIP.kind()) return false
        
        return ip.match(prefixIP, parseInt(bits))
      } else {
        // Exact match
        const allowedIP = ipaddr.process(allowed)
        return ip.toString() === allowedIP.toString()
      }
    } catch {
      return false
    }
  }

  /**
   * Get IP type
   */
  private getIPType(ip: string): 'ipv4' | 'ipv6' | 'cidr' {
    if (ip.includes('/')) return 'cidr'
    try {
      const parsed = ipaddr.process(ip)
      return parsed.kind() as 'ipv4' | 'ipv6'
    } catch {
      return 'ipv4' // Default
    }
  }

  /**
   * Cache result
   */
  private cacheResult(ip: string, allowed: boolean): void {
    this.inMemoryCache.set(ip, allowed)
    
    // Expire cache after configured time
    setTimeout(() => {
      this.inMemoryCache.delete(ip)
    }, this.config.cacheExpiry * 1000)
  }

  /**
   * Clear cache
   */
  private clearCache(): void {
    this.inMemoryCache.clear()
  }
}

/**
 * Extract client IP from request with validation
 */
export function extractClientIP(request: NextRequest): string | null {
  // Check various headers in order of trust
  const headers = [
    'cf-connecting-ip', // Cloudflare
    'x-real-ip', // Nginx proxy
    'x-forwarded-for', // Standard proxy
    'x-client-ip', // Some proxies
    'fastly-client-ip', // Fastly CDN
    'true-client-ip', // Akamai and Cloudflare Enterprise
    'x-cluster-client-ip', // Some load balancers
  ]

  for (const header of headers) {
    const value = request.headers.get(header)
    if (value) {
      // x-forwarded-for can contain multiple IPs
      const ip = value.split(',')[0]?.trim()
      if (ip && isValidIP(ip)) {
        return ip
      }
    }
  }

  // Fallback to request IP (may not be reliable)
  return request.ip || null
}

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  try {
    ipaddr.process(ip)
    return true
  } catch {
    return false
  }
}

/**
 * Create IP allowlist middleware
 */
export function createIPAllowlistMiddleware(
  manager: IPAllowlistManager,
  options?: {
    onDenied?: (ip: string) => void
    customErrorMessage?: string
  }
) {
  return async (request: NextRequest) => {
    const ip = extractClientIP(request)
    
    if (!ip) {
      if (manager['config'].strictMode) {
        return new Response(
          JSON.stringify({ 
            error: options?.customErrorMessage || 'Unable to determine client IP' 
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return null // Allow if we can't determine IP and not in strict mode
    }

    const allowed = await manager.isAllowed(ip)
    
    if (!allowed) {
      options?.onDenied?.(ip)
      
      return new Response(
        JSON.stringify({ 
          error: options?.customErrorMessage || 'Access denied' 
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return null // Allow request to continue
  }
}