import { db, schema } from '@nuxthub/db'
import { asc, eq, inArray, sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { newId } from './accounts'
import { entryForm, londonDayOf, totalOf } from '#shared/utils/ledger'
import type { EntryInput, NettableEntry } from '#shared/utils/ledger'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'

// The only writer of the ledger: check:ledger refuses any other file that inserts into its
// tables, which makes "every money path posts" a build failure rather than a habit (0004).

export interface PostedEntry {
  id: string
  totalPence: number
  statements: BatchItem<'sqlite'>[]
  // In the same order as `entry.lines`, so a caller needing to cite a line (a stock movement
  // against the sale line that caused it, F-105 criterion 3) knows its id before the batch runs.
  lineIds: string[]
}

// Statements rather than a write: money and the thing it paid for commit in one batch or not at
// all, and only the caller knows what the other half is (0001, I-102 criterion 6).
export function postEntry(input: EntryInput, at = new Date(), guard?: SQL): PostedEntry {
  const entry = entryForm.parse(input)
  const id = entry.id ?? newId()
  const totalPence = totalOf(entry.lines)
  const happenedAt = Math.floor(at.getTime() / 1000)
  const londonDay = londonDayOf(at)

  // `guard`: an earlier contended claim's own condition, so a caller whose claim lost posts
  // nothing here either (0001, D-116); every existing caller omits it and keeps this unconditional.
  const entryStatement = guard === undefined
    ? db.insert(schema.ledgerEntries).values({
        id,
        happenedAt,
        londonDay,
        source: entry.source,
        tender: entry.tender,
        actorId: entry.actorId ?? null,
        totalPence,
        reversesEntryId: entry.reversesEntryId ?? null,
        compReason: entry.compReason ?? null,
        compApprovedBy: entry.compApprovedBy ?? null,
        tabDebtorId: entry.tabDebtorId ?? null,
        voidOfEntryId: entry.voidOfEntryId ?? null,
        voidReason: entry.voidReason ?? null,
      })
    : db.run(sql`
        INSERT INTO ledger_entries
          (id, happened_at, london_day, source, tender, actor_id, total_pence, reverses_entry_id, comp_reason, comp_approved_by, tab_debtor_id, void_of_entry_id, void_reason)
        SELECT ${id}, ${happenedAt}, ${londonDay}, ${entry.source}, ${entry.tender}, ${entry.actorId ?? null},
               ${totalPence}, ${entry.reversesEntryId ?? null}, ${entry.compReason ?? null}, ${entry.compApprovedBy ?? null}, ${entry.tabDebtorId ?? null},
               ${entry.voidOfEntryId ?? null}, ${entry.voidReason ?? null}
        WHERE ${guard}
      `)

  const statements: BatchItem<'sqlite'>[] = [entryStatement]

  const lineIds: string[] = []
  for (const line of entry.lines) {
    const lineId = newId()
    lineIds.push(lineId)
    statements.push(guard === undefined
      ? db.insert(schema.ledgerLines).values({
          id: lineId,
          entryId: id,
          kind: line.kind,
          amountPence: line.amountPence,
          qty: line.qty,
          unitPricePence: line.unitPricePence ?? null,
          reservationId: line.reservationId ?? null,
          performanceId: line.performanceId ?? null,
          ticketId: line.ticketId ?? null,
          productVariantId: line.productVariantId ?? null,
          priceRef: line.priceRef ?? null,
          choices: line.choices ?? null,
          discountId: line.discountId ?? null,
          discountPercent: line.discountPercent ?? null,
          discountPence: line.discountPence ?? null,
          settlesEntryId: line.settlesEntryId ?? null,
        })
      // Guarded on the entry existing, not `guard` again: a line for an entry this batch did not
      // write would violate `ledger_lines`' own foreign key first regardless (0001).
      : db.run(sql`
          INSERT INTO ledger_lines
            (id, entry_id, kind, amount_pence, qty, unit_price_pence, reservation_id, performance_id, ticket_id,
             product_variant_id, price_ref, choices, discount_id, discount_percent, discount_pence, settles_entry_id)
          SELECT ${lineId}, ${id}, ${line.kind}, ${line.amountPence}, ${line.qty}, ${line.unitPricePence ?? null},
                 ${line.reservationId ?? null}, ${line.performanceId ?? null}, ${line.ticketId ?? null},
                 ${line.productVariantId ?? null}, ${line.priceRef ?? null}, ${line.choices ? JSON.stringify(line.choices) : null},
                 ${line.discountId ?? null}, ${line.discountPercent ?? null}, ${line.discountPence ?? null}, ${line.settlesEntryId ?? null}
          WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${id})
        `))
  }

  return { id, totalPence, statements, lineIds }
}

// What an entry and everything correcting it come to. Never stored: a total is read from the rows
// at the moment it is asked for (I-101 criterion 4).
export async function netOf(entryId: string): Promise<number> {
  const rows = await db.select({
    id: schema.ledgerEntries.id,
    totalPence: schema.ledgerEntries.totalPence,
    reversesEntryId: schema.ledgerEntries.reversesEntryId,
  })
    .from(schema.ledgerEntries)
    .where(inArray(schema.ledgerEntries.id, [entryId]))

  const corrections = await db.select({
    id: schema.ledgerEntries.id,
    totalPence: schema.ledgerEntries.totalPence,
    reversesEntryId: schema.ledgerEntries.reversesEntryId,
  })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.reversesEntryId, entryId))
    .orderBy(asc(schema.ledgerEntries.happenedAt))

  return netPence([...rows, ...corrections] as NettableEntry[])
}
