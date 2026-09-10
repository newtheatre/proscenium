#!/usr/bin/env bun
// Reservations and tickets as structured records (K-114 already imports the money alone). Targets
// a database with the real schema and this week's load.ts output: real performances, real users.
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, loadDump } from './lib'
import { reconcile, transformReservations } from './reservations'

const stamp = await latestStamp()
ensureOut()

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-reservations.ts <target-database>')
  console.error('The target must already carry the application schema and this week\'s load.ts')
  console.error('output: reservations and tickets reference real performances and real users.')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

// Read back before anything is minted, so a rehearsal updates last week's rows rather than
// writing a second copy of the history.
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
const reservationIds = await readMap('reservation-id-map.tsv')
const ticketIds = await readMap('reservation-ticket-id-map.tsv')

const source = await loadDump('proscenium', stamp)
const target = new Database(applyTo)

// Written by the programme transform, not this one; empty until it exists, which every row here
// accounts for as an exception rather than a guess (docs/known-issues.md).
const performances = await readMap('performance-map.tsv')
const ticketTypes = await readMap('ticket-type-map.tsv')
if (performances.size === 0) {
  console.error(`Note: ${join(OUT, 'performance-map.tsv')} is empty or missing.`)
  console.error('Every reservation will be skipped as an exception until the programme transform runs.')
}

const { summary, exceptions } = transformReservations({
  source, accounts, performances, ticketTypes, reservationIds, ticketIds, target,
})
const check = reconcile(source, target, summary)

await write('reservation-id-map.tsv', reservationIds)
await write('reservation-ticket-id-map.tsv', ticketIds)
await Bun.write(join(OUT, 'reservation-exceptions.txt'), exceptions.join('\n') + (exceptions.length ? '\n' : ''))
await Bun.write(join(OUT, 'reservation-summary.json'), `${JSON.stringify({ stamp, ...summary, problems: check.problems }, null, 2)}\n`)

console.log(`reservations: read ${summary.read}, wrote ${summary.written}`)
console.log(`tickets: read ${summary.ticketsRead}, wrote ${summary.ticketsWritten}, price paid ${summary.pricePaidPence}p`)
console.log(`skipped: ${summary.skippedNoPerformance} without a performance, ${summary.skippedUnknownStatus} unknown status, ${summary.skippedUnknownSource} unknown source`)
console.log(`anonymous: ${summary.anonymousAccount} reservations with no resolvable account`)
if (exceptions.length) console.log(`exceptions: ${exceptions.length}, in out/reservation-exceptions.txt`)

// Loudly, and non-zero: a partial history nobody notices is worse than no history at all.
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
