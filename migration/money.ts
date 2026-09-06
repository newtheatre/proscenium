// The old estate's ticket money, imported as opening ledger history (K-114, I-109). The source is
// `tickets`, never `transactions`, which the old estate never used as a ledger (one row, six years).
import { londonDayOf } from '../shared/utils/ledger'
import { nanoid } from './lib'
import type { Database } from 'bun:sqlite'

export interface TicketRow {
  id: string
  price_paid: number
  // Milliseconds, the same old-estate convention `bookings.ts` already found and converts (a
  // unit error would put every refund in 1970, which no row count catches).
  refunded_at: number | null
  // SQLite CURRENT_TIMESTAMP, UTC, `YYYY-MM-DD HH:MM:SS`.
  created_at: string
  price_confidence: string
}

export interface LedgerEntryInsert {
  id: string
  happened_at: number
  london_day: string
  source: 'IMPORT'
  tender: 'CARD' | 'NONE'
  total_pence: number
  reverses_entry_id: string | null
  created_at: number
}

export interface LedgerLineInsert {
  id: string
  entry_id: string
  kind: 'IMPORT'
  amount_pence: number
  qty: number
  unit_price_pence: number | null
}

export interface TransformMoneyResult {
  entries: LedgerEntryInsert[]
  lines: LedgerLineInsert[]
  summary: {
    tickets: number
    sold: number
    refunded: number
    salesPence: number
    refundsPence: number
    netPence: number
  }
  exceptions: string[]
}

// SQLite's CURRENT_TIMESTAMP has no zone; the dump is a UTC export, so the string is a UTC wall
// clock with a space instead of a T.
function parseUtc(stamp: string): Date {
  return new Date(`${stamp.replace(' ', 'T')}Z`)
}

// The old estate's own unit, confirmed once and guarded here rather than assumed twice: a value
// this large can only be milliseconds, and a value this small can only be seconds already.
const MILLISECOND_FLOOR = 10_000_000_000
function toSeconds(epoch: number): number {
  return epoch >= MILLISECOND_FLOOR ? Math.floor(epoch / 1000) : epoch
}

export function transformMoney(
  tickets: readonly TicketRow[],
  idMap: Map<string, string>,
  refundIdMap: Map<string, string>,
): TransformMoneyResult {
  const entries: LedgerEntryInsert[] = []
  const lines: LedgerLineInsert[] = []
  const exceptions: string[] = []
  const confidence = new Map<string, number>()

  let sold = 0
  let refunded = 0
  let salesPence = 0
  let refundsPence = 0

  for (const ticket of tickets) {
    if (ticket.price_confidence !== 'EXACT') {
      confidence.set(ticket.price_confidence, (confidence.get(ticket.price_confidence) ?? 0) + 1)
    }

    const soldAt = parseUtc(ticket.created_at)
    if (Number.isNaN(soldAt.getTime())) {
      exceptions.push(`ticket ${ticket.id}: created_at "${ticket.created_at}" does not parse, not imported`)
      continue
    }

    const entryId = idMap.get(ticket.id) ?? nanoid()
    idMap.set(ticket.id, entryId)

    const tender = ticket.price_paid === 0 ? 'NONE' : 'CARD'
    entries.push({
      id: entryId,
      happened_at: Math.floor(soldAt.getTime() / 1000),
      london_day: londonDayOf(soldAt),
      source: 'IMPORT',
      tender,
      total_pence: ticket.price_paid,
      reverses_entry_id: null,
      created_at: Math.floor(soldAt.getTime() / 1000),
    })
    lines.push({
      id: nanoid(),
      entry_id: entryId,
      kind: 'IMPORT',
      amount_pence: ticket.price_paid,
      qty: 1,
      unit_price_pence: ticket.price_paid,
    })
    sold++
    salesPence += ticket.price_paid

    // A refund is a second entry referencing the first, never a rewrite of it (0004, 0010): the
    // old estate's own total and the reversed net both stay reconstructable from ledger rows.
    if (ticket.refunded_at !== null) {
      const refundedAtSeconds = toSeconds(ticket.refunded_at)
      const refundedAt = new Date(refundedAtSeconds * 1000)
      const refundEntryId = refundIdMap.get(ticket.id) ?? nanoid()
      refundIdMap.set(ticket.id, refundEntryId)

      entries.push({
        id: refundEntryId,
        happened_at: refundedAtSeconds,
        london_day: londonDayOf(refundedAt),
        source: 'IMPORT',
        tender,
        total_pence: -ticket.price_paid,
        reverses_entry_id: entryId,
        created_at: refundedAtSeconds,
      })
      lines.push({
        id: nanoid(),
        entry_id: refundEntryId,
        kind: 'IMPORT',
        amount_pence: -ticket.price_paid,
        qty: 1,
        unit_price_pence: ticket.price_paid,
      })
      refunded++
      refundsPence += ticket.price_paid
    }
  }

  for (const [value, count] of confidence) {
    exceptions.push(`${count} ticket(s) imported with price_confidence "${value}", not EXACT: reconcile by hand`)
  }

  return {
    entries,
    lines,
    summary: {
      tickets: tickets.length,
      sold,
      refunded,
      salesPence,
      refundsPence,
      netPence: salesPence - refundsPence,
    },
    exceptions,
  }
}

function literal(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll('\'', '\'\'')}'`
}

// `INSERT OR IGNORE`, not a plain insert: a second run over the same tickets writes nothing
// further, matched by id, because this is history rather than a set that needs upserting.
export function buildLoad(entries: readonly LedgerEntryInsert[], lines: readonly LedgerLineInsert[]): string {
  const sql: string[] = [
    '-- Generated by migration/transform-money.ts (K-114, I-109).',
    '-- Append-only: a second run over the same tickets writes nothing further, by id.',
    '-- The source is tickets and reservations, never transactions (one row across six years).',
  ]

  for (const entry of entries) {
    sql.push(
      `INSERT OR IGNORE INTO ledger_entries `
      + `(id, happened_at, london_day, source, tender, total_pence, reverses_entry_id, created_at) VALUES (`
      + `${literal(entry.id)}, ${literal(entry.happened_at)}, ${literal(entry.london_day)}, `
      + `${literal(entry.source)}, ${literal(entry.tender)}, ${literal(entry.total_pence)}, `
      + `${literal(entry.reverses_entry_id)}, ${literal(entry.created_at)});`,
    )
  }
  for (const line of lines) {
    sql.push(
      `INSERT OR IGNORE INTO ledger_lines (id, entry_id, kind, amount_pence, qty, unit_price_pence) VALUES (`
      + `${literal(line.id)}, ${literal(line.entry_id)}, ${literal(line.kind)}, ${literal(line.amount_pence)}, `
      + `${literal(line.qty)}, ${literal(line.unit_price_pence)});`,
    )
  }

  return `${sql.join('\n')}\n`
}

export interface Reconciliation {
  ok: boolean
  problems: string[]
}

// Compared to the same figure inventory.ts already checksums (tickets_unrefunded_pence), so a
// reconciliation failure here is a real regression, not a number invented for this file alone.
export function reconcileMoney(source: Database, target: Database, summary: TransformMoneyResult['summary']): Reconciliation {
  const problems: string[] = []

  const sourceUnrefunded = (source.query(
    'SELECT coalesce(sum(price_paid), 0) AS total FROM tickets WHERE refunded_at IS NULL',
  ).get() as { total: number }).total

  if (sourceUnrefunded !== summary.netPence) {
    problems.push(`source unrefunded total is ${sourceUnrefunded}p, transformed net is ${summary.netPence}p`)
  }

  const targetNet = (target.query(
    'SELECT coalesce(sum(total_pence), 0) AS total FROM ledger_entries WHERE source = \'IMPORT\'',
  ).get() as { total: number }).total

  if (targetNet !== summary.netPence) {
    problems.push(`target IMPORT total is ${targetNet}p, transformed net is ${summary.netPence}p`)
  }

  const targetCount = (target.query(
    'SELECT count(*) AS n FROM ledger_entries WHERE source = \'IMPORT\'',
  ).get() as { n: number }).n
  const expectedCount = summary.sold + summary.refunded
  if (targetCount < expectedCount) {
    problems.push(`transformed ${expectedCount} entries but ${targetCount} are in the target`)
  }

  return { ok: problems.length === 0, problems }
}
