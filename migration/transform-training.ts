#!/usr/bin/env bun
// The old rehearsal app's training history alone (K-113); build.ts runs the same step in sequence.
import { Database } from 'bun:sqlite'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { latestStamp } from './lib'
import { closeDumps, openDumps, stepTraining } from './steps'

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-training.ts <target-database>')
  console.error('The target is out/target.sqlite from build.ts, or any local database carrying the application schema.')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

const dumps = await openDumps(await latestStamp())
const target = new Database(applyTo)
const { summary, exceptions, problems } = await stepTraining(dumps, target)
console.log(JSON.stringify(summary, null, 2))
if (exceptions.length) console.log(`${exceptions.length} exception(s) written under out/`)
target.close()
closeDumps(dumps)
if (problems.length) {
  console.error('\nreconciliation failed:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('reconciled.')
