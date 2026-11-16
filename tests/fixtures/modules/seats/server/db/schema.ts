import { integer, text, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const performances = defineTable('seats_performances', {
  id: col.id(),
  title: col.public(text('title').notNull()),
  capacity: col.internal(integer('capacity').notNull()),
  sold: col.internal(integer('sold').notNull().default(0)),
  claimedBy: col.internal(text('claimed_by')),
  // For core.operating-day: the instant a performance starts and the operating day it falls on.
  startsAt: col.timestamp('starts_at'),
  operatingDay: col.localDate('operating_day'),
  completedAt: col.timestamp('completed_at'),
  // For core's vocabularies: a record that points at a term, as a production's category will.
  categoryId: col.ref('core_terms', { nullable: true }),
}, { id: 'sp', realm: 'operational', extra: t => [check('seats_performances_capacity', sql`${t.sold} <= ${t.capacity}`)] })

export const ledger = defineTable('seats_ledger', {
  id: col.id(),
  performanceId: col.ref('seats_performances'),
  quantity: col.internal(integer('quantity').notNull()),
  buyer: col.account('buyer_id', { role: 'subject', onMerge: 'alias' }),
  buyerName: col.personal(text('buyer_name')),
  note: col.freeText(text('note')),
  // Not personal data, but it must go when the row is anonymised: a hash of a link token.
  linkHash: col.internal(text('link_hash'), { erase: 'clear' }),
  at: col.createdAt(),
}, { id: 'sl', realm: 'audience', appendOnly: true })

export const charges = defineTable('seats_charges', {
  id: col.id(),
  amount: col.minor('amount').notNull(),
  state: col.internal(text('state').notNull()),
  providerReference: col.internal(text('provider_reference')),
}, { id: 'sc', realm: 'operational' })

// A table about nobody keeps its rows for a fixed time rather than a setting's.
export const ticks = defineTable('seats_ticks', {
  id: col.id(),
  at: col.createdAt(),
}, { id: 'stk', realm: 'system', subject: 'none', retention: { fixed: '30d' } })

export const tables = { performances, ledger, charges, ticks }
