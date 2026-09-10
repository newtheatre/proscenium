#!/usr/bin/env bun
// The old rehearsal app's training history. Targets a database carrying the real schema and a
// catalogue already authored, never migrated (docs/backlog/G-training.md).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, loadDump } from './lib'
import { reconcileTraining, transformTraining } from './training'

const stamp = await latestStamp()
ensureOut()

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-training.ts <target-database>')
  console.error('The target must already carry the application schema, this week\'s load.ts')
  console.error('output, and a training catalogue (departments and modules), authored by hand.')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

// Read back before anything is minted, so a rehearsal updates last week's rows rather than
// writing a second copy of the history (K-112 criterion 4).
async function readMap(name: string): Promise<Map<string, string>> {
  const path = join(OUT, name)
  const map = new Map<string, string>()
  if (!await Bun.file(path).exists()) return map
  for (const line of (await Bun.file(path).text()).split('\n')) {
    const [from, to] = line.split('\t')
    if (from && to) map.set(from, to)
  }
  return map
}

const write = async (name: string, map: Map<string, string>): Promise<void> => {
  await Bun.write(join(OUT, name), `${[...map.entries()].map(([from, to]) => `${from}\t${to}`).join('\n')}\n`)
}

const accounts = await readMap('id-map.tsv')
const sessionIds = await readMap('training-session-id-map.tsv')
const requestIds = await readMap('module-request-id-map.tsv')
const recordIds = await readMap('training-record-id-map.tsv')

const source = await loadDump('training', stamp)
const target = new Database(applyTo)

const moduleIds = new Set(target.query<{ id: string }, []>('SELECT id FROM modules').all().map(row => row.id))
const departmentCodes = new Set(target.query<{ code: string }, []>('SELECT code FROM departments').all().map(row => row.code))
if (moduleIds.size === 0 || departmentCodes.size === 0) {
  console.error('No modules or departments in the target: author the training catalogue first.')
  console.error('This transform carries history against it, and never invents a module or department.')
  process.exit(1)
}

const { summary, exceptions } = transformTraining({
  source, accounts, moduleIds, departmentCodes, sessionIds, requestIds, recordIds, target,
})
const check = reconcileTraining(target, summary)

await write('training-session-id-map.tsv', sessionIds)
await write('module-request-id-map.tsv', requestIds)
await write('training-record-id-map.tsv', recordIds)
await Bun.write(join(OUT, 'training-exceptions.txt'), exceptions.join('\n') + (exceptions.length ? '\n' : ''))
await Bun.write(join(OUT, 'training-summary.json'), `${JSON.stringify({ stamp, ...summary, problems: check.problems }, null, 2)}\n`)

console.log(`sessions: read ${summary.sessionsRead}, wrote ${summary.sessionsWritten}`)
console.log(`attendees: read ${summary.attendeesRead}, wrote ${summary.attendeesWritten}`)
console.log(`requests: read ${summary.requestsRead}, wrote ${summary.requestsWritten}`)
console.log(`department leads: read ${summary.leadsRead}, wrote ${summary.leadsWritten}`)
console.log(`records: read ${summary.recordsRead}, wrote ${summary.recordsWritten}`)
if (exceptions.length) console.log(`exceptions: ${exceptions.length}, in out/training-exceptions.txt`)

// Loudly, and non-zero: a partial history that nobody notices is worse than no history at all.
if (!check.ok) {
  console.error('\nreconciliation failed:')
  for (const problem of check.problems) console.error(`  ${problem}`)
  target.close()
  source.close()
  process.exit(1)
}

console.log('reconciled.')
target.close()
source.close()
