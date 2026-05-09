import { spawnSync } from 'node:child_process'

const allowedPins = new Map([
  [
    '@types/node',
    'Node 20 is the repository runtime target; Node 25 types are not compatible with that target.',
  ],
  [
    'typescript',
    'TypeScript 6 is not yet a safe target for the current Next/tooling ecosystem.',
  ],
])

const result = spawnSync('pnpm', ['outdated', '--format', 'json'], {
  encoding: 'utf8',
})

if (result.status !== 0 && result.status !== 1) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const output = result.stdout.trim()
const outdated = output ? JSON.parse(output) : {}
const unexpected = Object.keys(outdated).filter(packageName => !allowedPins.has(packageName))

if (unexpected.length > 0) {
  console.error('Unexpected outdated dependencies remain:')
  for (const packageName of unexpected) {
    const details = outdated[packageName]
    console.error(`- ${packageName}: ${details.current} -> ${details.latest}`)
  }
  process.exit(1)
}

if (Object.keys(outdated).length === 0) {
  console.log('No outdated dependencies remain.')
} else {
  console.log('Only documented compatibility pins remain:')
  for (const [packageName, reason] of allowedPins) {
    const details = outdated[packageName]
    if (details) {
      console.log(`- ${packageName}: ${details.current} -> ${details.latest}; ${reason}`)
    }
  }
}
