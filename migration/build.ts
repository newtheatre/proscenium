#!/usr/bin/env bun
// One command builds the whole unified database from the latest dumps into out/target.sqlite:
// schema, identity, catalogue, every history, reconciled at each step. Nothing here touches D1.
import { join } from 'node:path'
import { assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, writeJson } from './lib'
import { createTarget } from './schema'
import {
  closeDumps, openDumps, stepBookings, stepCatalogue, stepIdentity, stepInventory, stepLoad, stepMoney,
  stepProgramme, stepReservations, stepTraining, targetCounts,
} from './steps'
import type { StepResult } from './steps'

export const TARGET_PATH = join(OUT, 'target.sqlite')

assertNotProduction()
ensureOut()
const stamp = await latestStamp()
const started = Date.now()
console.log(`Building ${TARGET_PATH} from the dumps of ${stamp}`)

for (const stale of [TARGET_PATH, `${TARGET_PATH}-journal`, `${TARGET_PATH}-wal`, `${TARGET_PATH}-shm`]) {
  if (await Bun.file(stale).exists()) await Bun.file(stale).delete()
}

const dumps = await openDumps(stamp)
console.log(`  dumps loaded (${Date.now() - started} ms)`)

const target = await createTarget(TARGET_PATH)
console.log('  schema applied from server/db/migrations/sqlite')

const report: Record<string, StepResult['summary'] & { exceptions: number, problems: string[] }> = {}
let failed = false

async function step(name: string, run: () => Promise<StepResult>): Promise<void> {
  if (failed) return
  const at = Date.now()
  try {
    const result = await run()
    report[name] = { ...result.summary, exceptions: result.exceptions.length, problems: result.problems }
    const state = result.problems.length ? 'FAILED' : 'ok'
    console.log(`  ${name}: ${state}, ${result.exceptions.length} exception(s), ${Date.now() - at} ms`)
    for (const problem of result.problems) console.error(`    ${problem}`)
    if (result.problems.length) failed = true
  }
  catch (error) {
    report[name] = { exceptions: 0, problems: [String((error as Error).message)] }
    console.error(`  ${name}: refused: ${(error as Error).message}`)
    failed = true
  }
}

const manifest = await stepInventory(stamp, dumps)
console.log('  inventory written')

let core: import('bun:sqlite').Database | undefined
await step('identity', async () => {
  const result = await stepIdentity(stamp, dumps, manifest)
  core = result.core
  return result
})
await step('load', () => stepLoad(core!, target))
await step('catalogue', () => stepCatalogue(dumps, target))
await step('bookings', () => stepBookings(dumps, target))
await step('training', () => stepTraining(dumps, target))
await step('programme', () => stepProgramme(dumps, target))
await step('reservations', () => stepReservations(dumps, target))
await step('money', () => stepMoney(dumps, target))

const counts = failed ? {} : targetCounts(target)
await writeJson('build-summary.json', { stamp, builtAt: new Date().toISOString(), ok: !failed, steps: report, counts })

core?.close()
target.close()
closeDumps(dumps)

if (failed) {
  console.error(`\nBuild failed after ${Date.now() - started} ms. Fix the transform, never the numbers; out/*-exceptions.txt name the rows.`)
  process.exit(1)
}

console.log(`\nBuilt in ${Date.now() - started} ms. Rows:`)
for (const [table, n] of Object.entries(counts).sort()) if (n) console.log(`  ${String(n).padStart(7)}  ${table}`)
console.log(`\nSummary in ${join(OUT, 'build-summary.json')}; exceptions in out/*-exceptions.txt.`)
console.log('Next: bun migration/dump-data.ts, then ./migration/reset-production.sh (docs/operations.md).')
