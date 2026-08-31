import { asc, eq, inArray } from 'drizzle-orm'
import { entryForm, londonDayOf, totalOf } from '#shared/utils/ledger'
import type { EntryInput, NettableEntry } from '#shared/utils/ledger'
import type { BatchItem } from 'drizzle-orm/batch'

// The only writer of the ledger: check:ledger refuses any other file that inserts into its
// tables, which makes "every money path posts" a build failure rather than a habit (0004).

export interface PostedEntry {
  id: string
  totalPence: number
  statements: BatchItem<'sqlite'>[]
}

// Statements rather than a write: money and the thing it paid for commit in one batch or not at
// all, and only the caller knows what the other half is (0001, I-102 criterion 6).
export function postEntry(input: EntryInput, at = new Date()): PostedEntry {
  const entry = entryForm.parse(input)
  const id = entry.id ?? newId()
  const totalPence = totalOf(entry.lines)

  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.ledgerEntries).values({
      id,
      happenedAt: Math.floor(at.getTime() / 1000),
      londonDay: londonDayOf(at),
      source: entry.source,
      tender: entry.tender,
      actorId: entry.actorId ?? null,
      totalPence,
      reversesEntryId: entry.reversesEntryId ?? null,
      compReason: entry.compReason ?? null,
      compApprovedBy: entry.compApprovedBy ?? null,
      tabDebtorId: entry.tabDebtorId ?? null,
    }),
  ]

  for (const line of entry.lines) {
    statements.push(db.insert(schema.ledgerLines).values({
      id: newId(),
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
    }))
  }

  return { id, totalPence, statements }
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
