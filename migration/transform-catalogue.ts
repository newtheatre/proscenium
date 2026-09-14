#!/usr/bin/env bun
// Rooms, union venues, the training catalogue and ticket types alone (0075); build.ts runs the same step.
import { Database } from 'bun:sqlite'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { latestStamp } from './lib'
import { closeDumps, openDumps, stepCatalogue } from './steps'

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/transform-catalogue.ts <target-database>')
  console.error('The target is out/target.sqlite from build.ts, or any local database carrying the application schema.')
  process.exit(1)
}
assertNotProduction()
assertLocalTarget(applyTo)

const dumps = await openDumps(await latestStamp())
const target = new Database(applyTo)
const { summary, exceptions, problems } = await stepCatalogue(dumps, target)
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
