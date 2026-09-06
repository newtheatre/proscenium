#!/usr/bin/env bun
// The rehearsal's money step (K-114, I-109): ticket revenue as opening ledger history, written
// straight from the dump: append-only history needs no upsert-by-identity staging (0010).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { assertLocalTarget, assertNotProduction } from '../tests/helpers/seed'
import { OUT, ensureOut, latestStamp, loadDump } from './lib'
import { buildLoad, reconcileMoney, transformMoney } from './money'
import type { TicketRow } from './money'

const stamp = await latestStamp()
ensureOut()

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

// Read back before anything is minted, so a rehearsal updates last week's entries rather than
// writing a second copy of the same history.
const idMap = await readMap('money-id-map.tsv')
const refundIdMap = await readMap('money-refund-id-map.tsv')

const source = await loadDump('proscenium', stamp)
const tickets = source.query<TicketRow, []>(
  'SELECT id, price_paid, refunded_at, created_at, price_confidence FROM tickets',
).all()

const { entries, lines, summary, exceptions } = transformMoney(tickets, idMap, refundIdMap)

await write('money-id-map.tsv', idMap)
await write('money-refund-id-map.tsv', refundIdMap)

const sql = buildLoad(entries, lines)
const outPath = join(OUT, 'load-money.sql')
await Bun.write(outPath, sql)

console.log(`Transformed ${summary.tickets} tickets: ${summary.sold} sold, ${summary.refunded} refunded.`)
console.log(`Sales ${summary.salesPence}p, refunds ${summary.refundsPence}p, net ${summary.netPence}p.`)
if (exceptions.length) {
  console.log(`\nExceptions:`)
  for (const exception of exceptions) console.log(`  ${exception}`)
}
console.log(`\nWrote ${outPath} (${entries.length + lines.length} statements).`)

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.log('\nNo target given, so nothing was applied. To rehearse against a local database:')
  console.log('  bun migration/transform-money.ts .data/db/sqlite.db')
  console.log('Production is applied by hand from the runbook, never from here.')
  source.close()
  process.exit(0)
}

assertNotProduction()
assertLocalTarget(applyTo)
const target = new Database(applyTo)
target.transaction(() => target.exec(sql))()

const reconciliation = reconcileMoney(source, target, summary)
if (!reconciliation.ok) {
  console.error('\nReconciliation failed:')
  for (const problem of reconciliation.problems) console.error(`  ${problem}`)
  target.close()
  source.close()
  process.exit(1)
}
console.log(`\nApplied to ${applyTo} and reconciled.`)
target.close()
source.close()
