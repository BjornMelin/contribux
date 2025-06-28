/**
 * Neon API Type Definitions
 *
 * Comprehensive type definitions for Neon API responses and requests
 * to replace 'any' types with proper TypeScript interfaces
 */

/**
 * Neon Branch API Response Types
 */
export interface NeonBranchData {
  id: string
  name: string
  created_at: string
  updated_at: string
  parent_id?: string
  parent_lsn?: string
  parent_timestamp?: string
  logical_size?: number
  physical_size?: number
  current_state: 'init' | 'ready' | 'failed'
  pending_state?: 'init' | 'ready' | 'failed'
  default: boolean
  primary: boolean
  cpu_used_sec: number
  compute_time_seconds?: number
  active_time_seconds?: number
  written_data_bytes?: number
  data_transfer_bytes?: number
}

/**
 * Neon Endpoint Data
 */
export interface NeonEndpointData {
  id: string
  type: 'read_write' | 'read_only'
  host: string
  port?: number
  branch_id: string
  current_state: 'init' | 'active' | 'idle' | 'failed' | 'stopped'
  pending_state?: 'init' | 'active' | 'idle' | 'failed' | 'stopped'
  settings: {
    autoscaling_limit_min_cu: number
    autoscaling_limit_max_cu: number
    suspend_timeout_seconds: number
  }
  disabled: boolean
  pooler_enabled: boolean
  pooler_mode: 'transaction' | 'session'
  created_at: string
  updated_at: string
  proxy_host: string
}

/**
 * Neon Database Data
 */
export interface NeonDatabaseData {
  id: number
  name: string
  owner_name: string
  created_at: string
  updated_at: string
}

/**
 * Neon Role Data
 */
export interface NeonRoleData {
  name: string
  password?: string
  protected: boolean
  created_at: string
  updated_at: string
}

/**
 * Neon Connection URI Data
 */
export interface NeonConnectionUriData {
  connection_uri: string
  connection_parameters: {
    database: string
    password: string
    role: string
    host: string
    pooler_host?: string
  }
}

/**
 * Create Branch API Response
 */
export interface CreateBranchResponse {
  branch: NeonBranchData
  endpoints: NeonEndpointData[]
  databases: NeonDatabaseData[]
  roles: NeonRoleData[]
  connection_uris: NeonConnectionUriData[]
}

/**
 * Get Branch API Response
 */
export interface GetBranchResponse {
  branch: NeonBranchData
  endpoints: NeonEndpointData[]
  databases: NeonDatabaseData[]
  roles: NeonRoleData[]
}

/**
 * List Branches API Response
 */
export interface ListBranchesResponse {
  branches: NeonBranchData[]
  endpoints: NeonEndpointData[]
  databases: NeonDatabaseData[]
  roles: NeonRoleData[]
}

/**
 * Type guard to ensure we have valid branch data
 */
export function isValidBranchData(data: unknown): data is NeonBranchData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'name' in data &&
    'created_at' in data &&
    typeof (data as Record<string, unknown>).id === 'string' &&
    typeof (data as Record<string, unknown>).name === 'string' &&
    typeof (data as Record<string, unknown>).created_at === 'string'
  )
}

/**
 * Type guard for endpoint data
 */
export function isValidEndpointData(data: unknown): data is NeonEndpointData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'host' in data &&
    'branch_id' in data &&
    typeof (data as Record<string, unknown>).id === 'string' &&
    typeof (data as Record<string, unknown>).host === 'string' &&
    typeof (data as Record<string, unknown>).branch_id === 'string'
  )
}

/**
 * Type guard for create branch response
 */
export function isValidCreateBranchResponse(data: unknown): data is CreateBranchResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'branch' in data &&
    'endpoints' in data &&
    isValidBranchData((data as Record<string, unknown>).branch) &&
    Array.isArray((data as Record<string, unknown>).endpoints)
  )
}
