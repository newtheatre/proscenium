#!/usr/bin/env bun
// Every privileged mutation is answerable for an audit entry (J-101 criterion 5). A route that
// writes nothing says so in the registry, with a reason somebody can disagree with at review.

import { join } from 'node:path'
import { AUDIT_COVERAGE } from '../shared/utils/audit-coverage'
import { isAuditAction } from '../shared/utils/audit-actions'

// A mutating method in the filename, anything under server/routes (a custom route does what it
// likes), or a file that already writes an entry: all three have to be accounted for.
const MUTATES = /\.(post|put|patch|delete)\.ts$/

function scan(directory: string): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: directory, onlyFiles: true })]
    .map(path => join(directory, path))
    .sort()
}

const candidates: string[] = []
for (const file of [...scan('server/api'), ...scan('server/routes')]) {
  const writes = (await Bun.file(file).text()).includes('auditEntry(')
  if (MUTATES.test(file) || file.startsWith('server/routes/') || writes) candidates.push(file)
}

const registry = new Map(AUDIT_COVERAGE.map(entry => [entry.route, entry]))
const problems: string[] = []

for (const route of candidates) {
  if (!registry.has(route)) {
    problems.push(`${route}  is not in the coverage registry: name its actions, or exempt it with a reason`)
  }
}

for (const entry of AUDIT_COVERAGE) {
  if (!await Bun.file(entry.route).exists()) {
    problems.push(`${entry.route}  is in the registry and not on disk: the registry follows the routes`)
    continue
  }
  if (entry.exempt) continue

  if (!entry.actions?.length) {
    problems.push(`${entry.route}  names no actions and is not exempt: say what it records, or why it records nothing`)
    continue
  }

  // Read the route and whatever it delegates to, because an entry built in a helper is still
  // this route's to answer for.
  const sources = await Promise.all([entry.route, ...entry.via ?? []].map(file => Bun.file(file).text()))
  const searched = sources.join('\n')

  for (const action of entry.actions) {
    if (!isAuditAction(action)) {
      problems.push(`${entry.route}  names \`${action}\`, which is not a registered audit action`)
      continue
    }
    if (!searched.includes(`'${action}'`)) {
      problems.push(`${entry.route}  claims \`${action}\` and neither it nor its \`via\` files write one`)
    }
  }
}

if (problems.length) {
  console.error('check-audit: the audit coverage registry does not match the routes.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nEvery privileged mutation writes an audit entry in the same batch as the change it')
  console.error('records, and `shared/utils/audit-coverage.ts` says which route answers for which')
  console.error('entry. A route that genuinely records nothing is exempt there, with a reason.')
  process.exit(1)
}

const exempt = AUDIT_COVERAGE.filter(entry => entry.exempt).length
console.log(`check-audit: ${AUDIT_COVERAGE.length} routes covered, ${exempt} exempt, all actions registered.`)
