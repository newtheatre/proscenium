import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// Every monetary fact the theatre records, appended and never edited (0004). The triggers are in
// their own migration because drizzle does not generate them (0010).

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: id(),
  happenedAt: integer('happened_at').notNull().default(now),
  // The civil day in London, computed server-side: a UTC timestamp groups to the wrong day for
  // six months of the year (0014).
  londonDay: text('london_day').notNull(),
  source: text('source').notNull(),
  tender: text('tender').notNull(),
  // Restrict, not cascade: erasure anonymises a user and never removes one, so a row that would
  // orphan an entry is a bug rather than a case to handle.
  actorId: text('actor_id').references(() => users.id, { onDelete: 'restrict' }),
  // Zero on a comp, negative on a reversal. Always the sum of the entry's lines.
  totalPence: integer('total_pence').notNull(),
  // A correction points at what it corrects; both rows stay (criterion 3). Written only by the
  // one-time historical import (migration/money.ts); a live refund keys reports off kind instead.
  reversesEntryId: text('reverses_entry_id'),
  // No CHECK: comps belong to module D and their reasons are not decided (0033).
  compReason: text('comp_reason'),
  compApprovedBy: text('comp_approved_by').references(() => users.id, { onDelete: 'restrict' }),
  discountId: text('discount_id'),
  discountPercent: integer('discount_percent'),
  discountPence: integer('discount_pence'),
  tabDebtorId: text('tab_debtor_id').references(() => users.id, { onDelete: 'restrict' }),
  // Never written: the append-only trigger refuses any UPDATE. `ledgerLines.settlesEntryId`
  // is what actually answers whether a charge is still outstanding (F-109).
  tabSettledAt: integer('tab_settled_at'),
  tabSettlementEntryId: text('tab_settlement_entry_id'),
  voidOfEntryId: text('void_of_entry_id'),
  // Free text, so it stays off the audit trail and on the record itself (0011, F-109 criterion 4).
  voidReason: text('void_reason'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  // Every report groups by day; without this each one is a scan of the whole ledger.
  index('ledger_entries_london_day').on(table.londonDay),
  index('ledger_entries_reverses').on(table.reversesEntryId),
  index('ledger_entries_tab_debtor').on(table.tabDebtorId),
  check('ledger_entries_source', sql`${table.source} IN ('DESK', 'TILL', 'SELF_SERVE', 'IMPORT', 'SYSTEM')`),
  check('ledger_entries_tender', sql`${table.tender} IN ('CARD', 'COMP', 'TAB', 'NONE')`),
  // A CHECK cannot be widened without a rebuild, and a rebuild of this table is refused (0010),
  // so the ones here are the two that describe how money moved rather than what was sold (0033).
  check('ledger_entries_no_self_reversal', sql`${table.reversesEntryId} IS NULL OR ${table.reversesEntryId} <> ${table.id}`),
  // A charge is voided once: caught here at insert time, and again by the stock credit's own
  // unique index, the named double-void regression (F-109 criterion 5).
  uniqueIndex('ledger_entries_void_once').on(table.voidOfEntryId).where(sql`${table.voidOfEntryId} IS NOT NULL`),
])

export const ledgerLines = sqliteTable('ledger_lines', {
  id: id(),
  entryId: text('entry_id').notNull().references(() => ledgerEntries.id, { onDelete: 'cascade' }),
  // No CHECK: the list grows with the modules that sell things, and the write path holds it (0033).
  kind: text('kind').notNull(),
  amountPence: integer('amount_pence').notNull(),
  qty: integer('qty').notNull().default(1),
  unitPricePence: integer('unit_price_pence'),
  // Ids into modules that do not exist yet, so no foreign key: one cannot be added later without
  // rebuilding an append-only table, and the data model documents them unconstrained.
  reservationId: text('reservation_id'),
  performanceId: text('performance_id'),
  ticketId: text('ticket_id'),
  productVariantId: text('product_variant_id'),
  priceRef: text('price_ref'),
  choices: text('choices', { mode: 'json' }),
  // Snapshotted, not referenced: no foreign key, the same reasoning as the ids above, so a later
  // edit to the discount itself never restates what this line actually charged (F-117).
  discountId: text('discount_id'),
  discountPercent: integer('discount_percent'),
  discountPence: integer('discount_pence'),
  // The charge this settlement line covers, one line per charge settled. No foreign key, the
  // same reasoning as the ids above; the unique index is what makes a charge settle once (F-109).
  settlesEntryId: text('settles_entry_id'),
}, table => [
  index('ledger_lines_entry').on(table.entryId),
  index('ledger_lines_kind').on(table.kind),
  index('ledger_lines_performance').on(table.performanceId),
  // A ticket is collected once, ever: the guard is the index, not application code, so a retry
  // or a second officer never posts a second entry for the same seat (D-114 criterion 2).
  uniqueIndex('ledger_lines_ticket_collection_once').on(table.ticketId).where(sql`kind = 'TICKET_COLLECTION'`),
  uniqueIndex('ledger_lines_settles_once').on(table.settlesEntryId).where(sql`${table.settlesEntryId} IS NOT NULL`),
])
