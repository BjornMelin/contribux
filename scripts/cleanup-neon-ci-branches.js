#!/usr/bin/env node

import { parseArgs } from 'node:util'

const DEFAULT_MIN_AGE_MINUTES = 30
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const NEON_API_BASE_URL = 'https://console.neon.tech/api/v2'

function readOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      prefix: {
        type: 'string',
        multiple: true,
      },
      'min-age-minutes': {
        type: 'string',
        default: String(DEFAULT_MIN_AGE_MINUTES),
      },
      'dry-run': {
        type: 'boolean',
        default: false,
      },
    },
    allowPositionals: false,
    strict: true,
  })

  const prefixes = values.prefix ?? []
  const rawMinAgeMinutes = values['min-age-minutes']

  if (prefixes.length === 0) {
    throw new Error('At least one --prefix value is required')
  }

  if (!/^\d+$/.test(rawMinAgeMinutes)) {
    throw new Error('--min-age-minutes must contain only digits')
  }

  const minAgeMinutes = Number.parseInt(rawMinAgeMinutes, 10)

  if (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 1) {
    throw new Error('--min-age-minutes must be a positive integer')
  }

  return {
    prefixes,
    minAgeMinutes,
    dryRun: values['dry-run'],
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function shouldDeleteBranch(branch, prefixes, cutoff) {
  const name = typeof branch.name === 'string' ? branch.name : ''
  const id = typeof branch.id === 'string' ? branch.id : ''
  const createdAt = typeof branch.created_at === 'string' ? branch.created_at : ''

  if (!id || !prefixes.some(prefix => name.startsWith(prefix))) {
    return false
  }

  if (branch.primary === true || branch.default === true) {
    return false
  }

  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) {
    return false
  }

  return createdAtMs < cutoff.getTime()
}

async function neonRequest(path, apiKey, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS)
  let response

  try {
    response = await fetch(`${NEON_API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Neon API request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok && response.status !== 204) {
    const body = await response.text()
    throw new Error(`Neon API ${init.method ?? 'GET'} ${path} failed: ${response.status} ${body}`)
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  return response.json()
}

async function listBranches(projectId, apiKey) {
  const branches = []
  let cursor

  do {
    const params = new URLSearchParams({ limit: '10000' })
    if (cursor) {
      params.set('cursor', cursor)
    }

    const payload = await neonRequest(
      `/projects/${encodeURIComponent(projectId)}/branches?${params.toString()}`,
      apiKey
    )
    branches.push(...(payload?.branches ?? []))
    cursor = payload?.pagination?.next
  } while (cursor)

  return branches
}

async function deleteBranch(projectId, branchId, apiKey) {
  await neonRequest(
    `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
    apiKey,
    { method: 'DELETE' }
  )
}

async function main() {
  const { prefixes, minAgeMinutes, dryRun } = readOptions(process.argv.slice(2))
  const apiKey = requireEnv('NEON_API_KEY')
  const projectId = requireEnv('NEON_PROJECT_ID')
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000)
  const branches = await listBranches(projectId, apiKey)
  const staleBranches = branches.filter(branch => shouldDeleteBranch(branch, prefixes, cutoff))

  if (staleBranches.length === 0) {
    console.log(
      `No stale Neon branches matched ${prefixes.join(', ')} older than ${minAgeMinutes} minutes`
    )
    return
  }

  for (const branch of staleBranches) {
    console.log(`Deleting stale Neon branch ${branch.name} (${branch.id})`)
    if (!dryRun) {
      await deleteBranch(projectId, branch.id, apiKey)
    }
  }

  const verb = dryRun ? 'Would delete' : 'Deleted'
  console.log(`${verb} ${staleBranches.length} stale Neon branch(es)`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
