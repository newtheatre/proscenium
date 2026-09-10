#!/usr/bin/env bun
// The old proscenium database's programme: venues, seasons, categories, shows, the
// content-warning vocabulary and performances. Targets a database with the real schema.
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, loadDump } from './lib'
import { reconcile, transformProgramme } from './programme'

const stamp = await latestStamp()
ensureOut()

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-programme.ts <target-database>')
  console.error('The target must already carry the application schema (load.ts\'s output).')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

// Read back before anything is minted, so a rehearsal updates last week's rows rather than
// writing a second copy of the programme (K-113, the same shape transform-bookings.ts uses).
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

const venueIds = await readMap('venue-id-map.tsv')
const seasonIds = await readMap('season-id-map.tsv')
const categoryIds = await readMap('category-id-map.tsv')
const showIds = await readMap('show-id-map.tsv')
const warningIds = await readMap('warning-id-map.tsv')
const performanceIds = await readMap('performance-id-map.tsv')

const source = await loadDump('proscenium', stamp)
const target = new Database(applyTo)

const { summary, exceptions } = transformProgramme({
  source, venueIds, seasonIds, categoryIds, showIds, warningIds, performanceIds, target,
})
const check = reconcile(source, target, summary)

await write('venue-id-map.tsv', venueIds)
await write('season-id-map.tsv', seasonIds)
await write('category-id-map.tsv', categoryIds)
await write('show-id-map.tsv', showIds)
await write('warning-id-map.tsv', warningIds)
await write('performance-id-map.tsv', performanceIds)
await Bun.write(join(OUT, 'programme-exceptions.txt'), exceptions.join('\n') + (exceptions.length ? '\n' : ''))
await Bun.write(join(OUT, 'programme-summary.json'), `${JSON.stringify({ stamp, ...summary, problems: check.problems }, null, 2)}\n`)

console.log(`venues: ${summary.venues}, seasons: ${summary.seasons}, categories: ${summary.categories}`)
console.log(`shows: ${summary.shows} (${summary.droppedExternalUrls} external links dropped, ${summary.narrowedLatecomerPolicies} latecomer policies narrowed)`)
console.log(`content warnings: ${summary.contentWarnings}, show links: ${summary.showContentWarnings}`)
console.log(`performances: ${summary.performances}`)
if (exceptions.length) console.log(`exceptions: ${exceptions.length}, in out/programme-exceptions.txt`)

// Loudly, and non-zero: a partial programme that nobody notices is worse than no programme at
// all, since everything else in the estate references a performance (criterion 2).
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
