#!/usr/bin/env bun
// The identity step alone: dumps in, out/unified.sqlite and out/id-map.tsv out, checked against the manifest.
import { latestStamp } from './lib'
import { closeDumps, openDumps, stepIdentity, stepInventory } from './steps'

const stamp = await latestStamp()
const dumps = await openDumps(stamp)
const manifest = await stepInventory(stamp, dumps)
const { summary, exceptions, problems, core } = await stepIdentity(stamp, dumps, manifest)
core.close()
closeDumps(dumps)

const s = summary as Record<string, number>
console.log(
  `Identity transform complete: ${s.users} users (${s.tombstones} tombstones, `
  + `${s.workspaceWiped} Workspace passwords wiped, ${s.emailsLowercased} addresses lowercased), `
  + `${s.grantsImported} grants, ${s.reusedIds} ids reused, ${exceptions.length} exceptions.`,
)
if (problems.length) {
  console.error('\nreconciliation failed:')
  for (const problem of problems) console.error(`  FAIL: ${problem}`)
  process.exit(1)
}
console.log(`Reconciliation green for dumps of ${stamp}.`)
