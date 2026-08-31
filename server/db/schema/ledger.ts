import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
  // A correction points at what it corrects; both rows stay (criterion 3).
  reversesEntryId: text('reverses_entry_id'),
  // No CHECK: comps belong to module D and their reasons are not decided (0033).
  compReason: text('comp_reason'),
  compApprovedBy: text('comp_approved_by').references(() => users.id, { onDelete: 'restrict' }),
  discountId: text('discount_id'),
  discountPercent: integer('discount_percent'),
  discountPence: integer('discount_pence'),
  tabDebtorId: text('tab_debtor_id').references(() => users.id, { onDelete: 'restrict' }),
  tabSettledAt: integer('tab_settled_at'),
  tabSettlementEntryId: text('tab_settlement_entry_id'),
  voidOfEntryId: text('void_of_entry_id'),
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
}, table => [
  index('ledger_lines_entry').on(table.entryId),
  index('ledger_lines_kind').on(table.kind),
  index('ledger_lines_performance').on(table.performanceId),
])
