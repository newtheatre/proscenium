// Finance: the ledger (Box office specification, part 2). Double entry: every posting is a set of
// entries that sum to zero in one currency, a positive amount a debit and a negative one a credit.
// Nothing here is personal, so the ledger survives every erasure untouched. The triggers that make a
// posting real (the seal), refuse a posting into a closed period and keep each module to its own
// accounts are added to the migration by hand: see the comments at the end of its migration.sql.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** The chart of accounts. A module's declared accounts are locked: renamed and recoded, never removed. */
export const accounts = defineTable('finance_accounts', {
  id: col.id(),
  code: col.internal(text('code').notNull()),
  name: col.internal(text('name').notNull()),
  kind: col.internal(text('kind', { enum: ['asset', 'liability', 'income', 'expense', 'equity'] }).notNull()),
  // The one module that may post to this account.
  module: col.internal(text('module').notNull()),
  // `<module>.<key>` for an account a module declared through finance.system-account.
  systemKey: col.internal(text('system_key')),
  // The record a scoped account is for, such as the provider account a clearing account belongs to.
  scope: col.internal(text('scope')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'lac',
  practice: 'copy',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('finance_accounts_code').on(t.code),
    // A NULL scope would make every unscoped row distinct, so the index reads it as ''.
    uniqueIndex('finance_accounts_system_key').on(t.systemKey, sql`coalesce(${t.scope}, '')`).where(sql`system_key IS NOT NULL`),
    check('finance_accounts_kind', sql`${t.kind} IN ('asset', 'liability', 'income', 'expense', 'equity')`),
  ],
})

/** Accounting periods, made as postings need them, never overlapping. */
export const periods = defineTable('finance_periods', {
  id: col.id(),
  label: col.internal(text('label').notNull()),
  startsOn: col.localDate('starts_on').notNull(),
  endsOn: col.localDate('ends_on').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'fpe',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('finance_periods_starts_on').on(t.startsOn),
    check('finance_periods_order', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
})

/** One business fact. Real only once sealed; reports read sealed postings alone. */
export const postings = defineTable('finance_postings', {
  id: col.id(),
  // The same business fact is posted once.
  idempotencyKey: col.internal(text('idempotency_key').notNull()),
  sourceModule: col.internal(text('source_module').notNull()),
  sourceType: col.internal(text('source_type').notNull()),
  sourceId: col.internal(text('source_id').notNull()),
  kind: col.internal(text('kind', { enum: ['sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'] }).notNull()),
  reversesId: col.internal(text('reverses_id')),
  periodId: col.ref('finance_periods'),
  occurredAt: col.timestamp('occurred_at').notNull(),
  postedAt: col.timestamp('posted_at').notNull(),
  postedBy: col.account('posted_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  // Why a transfer was posted, from ledger.ts PURPOSES, checked in postEntries. A column rather than
  // new kinds, so the append-only table is never rebuilt (Budgets and claims, part 4).
  purpose: col.internal(text('purpose')),
}, {
  id: 'post',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    uniqueIndex('finance_postings_idempotency_key').on(t.idempotencyKey),
    // A posting is reversed once.
    uniqueIndex('finance_postings_reverses').on(t.reversesId).where(sql`reverses_id IS NOT NULL`),
    index('finance_postings_period').on(t.periodId),
    index('finance_postings_occurred').on(t.occurredAt),
    index('finance_postings_source').on(t.sourceModule, t.sourceType, t.sourceId),
    check('finance_postings_kind', sql`${t.kind} IN ('sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening')`),
  ],
})

/** One line of a posting. */
export const entries = defineTable('finance_entries', {
  id: col.id(),
  postingId: col.ref('finance_postings'),
  accountId: col.ref('finance_accounts'),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  // The module whose part this entry belongs to, when Payments writes the entries an owner returned
  // for its part of a payment. Null for an entry the posting's own module wrote.
  forModule: col.internal(text('for_module')),
  productionId: col.internal(text('production_id')),
  performanceId: col.internal(text('performance_id')),
  taxCode: col.internal(text('tax_code').notNull().default('none')),
  taxMinor: col.minor('tax_minor').notNull().default(0),
  // The budget line this entry is spent against: opaque here, like production_id. Budgets owns it.
  budgetLineId: col.internal(text('budget_line_id')),
  createdAt: col.createdAt(),
}, {
  id: 'led',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('finance_entries_posting').on(t.postingId),
    index('finance_entries_account').on(t.accountId),
    index('finance_entries_production').on(t.productionId).where(sql`production_id IS NOT NULL`),
    index('finance_entries_performance').on(t.performanceId).where(sql`performance_id IS NOT NULL`),
    index('finance_entries_budget_line').on(t.budgetLineId).where(sql`budget_line_id IS NOT NULL`),
    index('finance_entries_tax_code').on(t.taxCode).where(sql`tax_code <> 'none'`),
    check('finance_entries_amount', sql`${t.amountMinor} <> 0`),
    check('finance_entries_tax', sql`${t.taxCode} <> 'none' OR ${t.taxMinor} = 0`),
  ],
})

/** The row that makes a posting real. Its trigger checks the posting balances. */
export const seals = defineTable('finance_seals', {
  postingId: col.ref('finance_postings'),
  entryCount: col.internal(integer('entry_count').notNull()),
  createdAt: col.createdAt(),
}, {
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    uniqueIndex('finance_seals_posting').on(t.postingId),
    check('finance_seals_entry_count', sql`${t.entryCount} >= 2`),
  ],
})

/** Closing is a row, not a flag. The newest row for a period says whether it is closed. */
export const periodCloses = defineTable('finance_period_closes', {
  id: col.id(),
  periodId: col.ref('finance_periods'),
  action: col.internal(text('action', { enum: ['close', 'reopen'] }).notNull()),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  at: col.timestamp('at').notNull(),
  debitsMinor: col.minor('debits_minor').notNull(),
  creditsMinor: col.minor('credits_minor').notNull(),
  reasonTermId: col.ref('core_terms', { nullable: true }),
}, {
  id: 'pcl',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('finance_period_closes_period').on(t.periodId, t.at),
    check('finance_period_closes_action', sql`${t.action} IN ('close', 'reopen')`),
    check('finance_period_closes_reason', sql`${t.action} = 'close' OR ${t.reasonTermId} IS NOT NULL`),
  ],
})

/**
 * Tax codes (F-A2): `none` for a theatre that is not registered, and the VAT codes beside it. A code's
 * rate never changes once an entry uses it (a trigger); a new rate is a new code.
 */
export const taxCodes = defineTable('finance_tax_codes', {
  code: col.internal(text('code').primaryKey()),
  label: col.internal(text('label').notNull()),
  rateBasisPoints: col.internal(integer('rate_basis_points').notNull().default(0)),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  // Whether a sale under this code goes on a VAT return at all: false for `none` and `outside`.
  inScope: col.internal(integer('in_scope', { mode: 'boolean' }).notNull().default(true)),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [check('finance_tax_codes_rate', sql`${t.rateBasisPoints} >= 0`)],
})

export const tables = { accounts, periods, postings, entries, seals, periodCloses, taxCodes }
