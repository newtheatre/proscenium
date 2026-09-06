#!/usr/bin/env bun
// The old rooms history, keyed to the accounts identity minted. Targets a database with the
// real schema, not out/unified.sqlite: room_bookings references real rooms (docs/known-issues.md).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, loadDump } from './lib'
import { reconcile, transformBookings } from './bookings'

const stamp = await latestStamp()
ensureOut()

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-bookings.ts <target-database>')
  console.error('The target must already carry the application schema and this week\'s load.ts')
  console.error('output: room_bookings and external_requests reference real rooms and real users.')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

// Read back before anything is minted, so a rehearsal updates last week's rows rather than
// writing a second copy of the history (C-118 criterion 5).
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
const bookingIds = await readMap('booking-id-map.tsv')
const seriesIds = await readMap('series-id-map.tsv')
const externalIds = await readMap('external-id-map.tsv')

const source = await loadDump('rooms', stamp)
const target = new Database(applyTo)

// Written by hand for a rehearsal rather than guessed, because a wrong room silently rewrites
// years of utilisation. Two files now: a venue is a union room, not a room we control (C-120).
const rooms = await readMap('room-map.tsv')
const spaces = await readMap('space-map.tsv')
if (rooms.size === 0 || spaces.size === 0) {
  console.error(`No ${join(OUT, 'room-map.tsv')} or ${join(OUT, 'space-map.tsv')}: map each`)
  console.error('"room:<id>" to a unified room and each "venue:<id>" to a union room first.')
  process.exit(1)
}

const { summary, exceptions } = transformBookings({
  source, accounts, rooms, spaces, bookingIds, seriesIds, externalIds, target,
})
const check = reconcile(source, target, summary)

await write('booking-id-map.tsv', bookingIds)
await write('series-id-map.tsv', seriesIds)
await write('external-id-map.tsv', externalIds)
await Bun.write(join(OUT, 'booking-exceptions.txt'), exceptions.join('\n') + (exceptions.length ? '\n' : ''))
await Bun.write(join(OUT, 'booking-summary.json'), `${JSON.stringify({ stamp, ...summary, problems: check.problems }, null, 2)}\n`)

console.log(`bookings: read ${summary.read}, wrote ${summary.written} of ours`)
console.log(`union requests: ${summary.externalWritten}, and ${summary.series} series`)
console.log(`skipped: ${summary.skippedNoRoom} without a room, ${summary.skippedNoAccount} without an account`)
if (exceptions.length) console.log(`exceptions: ${exceptions.length}, in out/booking-exceptions.txt`)

// Loudly, and non-zero: a partial history that nobody notices is worse than no history at all
// (criterion 2).
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
