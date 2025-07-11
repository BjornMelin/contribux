/**
 * Permission System
 * Handles user permissions and role-based access control
 */

export interface Permission {
  name: string
  description: string
  resource?: string
  action?: string
}

export interface Role {
  name: string
  permissions: string[]
}

// Mock permission definitions
const PERMISSIONS: Record<string, Permission> = {
  'admin:read': { name: 'admin:read', description: 'Read admin data' },
  'admin:write': { name: 'admin:write', description: 'Write admin data' },
  'user:read': { name: 'user:read', description: 'Read user data' },
  'user:write': { name: 'user:write', description: 'Write user data' },
}

// Mock role definitions
const ROLES: Record<string, Role> = {
  admin: {
    name: 'admin',
    permissions: ['admin:read', 'admin:write', 'user:read', 'user:write'],
  },
  user: {
    name: 'user',
    permissions: ['user:read', 'user:write'],
  },
  readonly: {
    name: 'readonly',
    permissions: ['user:read'],
  },
}

// Mock user-role assignments
const USER_ROLES: Record<string, string[]> = {
  admin123: ['admin'],
  user123: ['user'],
  readonly123: ['readonly'],
}

export async function checkPermission(userId: string, permission: string): Promise<boolean> {
  const userRoles = USER_ROLES[userId] || []

  for (const roleName of userRoles) {
    const role = ROLES[roleName]
    if (role?.permissions.includes(permission)) {
      return true
    }
  }

  return false
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const userRoles = USER_ROLES[userId] || []
  const permissions = new Set<string>()

  for (const roleName of userRoles) {
    const role = ROLES[roleName]
    if (role) {
      role.permissions.forEach(perm => permissions.add(perm))
    }
  }

  return Array.from(permissions)
}

export async function getUserRoles(userId: string): Promise<string[]> {
  return USER_ROLES[userId] || []
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  const userRoles = await getUserRoles(userId)
  return userRoles.includes(roleName)
}

export async function assignRole(userId: string, roleName: string): Promise<void> {
  if (!USER_ROLES[userId]) {
    USER_ROLES[userId] = []
  }

  if (!USER_ROLES[userId].includes(roleName)) {
    USER_ROLES[userId].push(roleName)
  }
}

export async function removeRole(userId: string, roleName: string): Promise<void> {
  if (USER_ROLES[userId]) {
    USER_ROLES[userId] = USER_ROLES[userId].filter(role => role !== roleName)
  }
}

export function getAvailablePermissions(): Permission[] {
  return Object.values(PERMISSIONS)
}

export function getAvailableRoles(): Role[] {
  return Object.values(ROLES)
}
