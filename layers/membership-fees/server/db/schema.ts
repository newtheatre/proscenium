// Membership fees (Membership specification, tab 2): two tables. A price is replaced, never edited,
// so a charge always shows the price it was made at. A charge is what one membership owes and the
// payment intent opened for it; it holds no card detail and no name.
import { check, index, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const APPLIES_TO = ['join-and-renew', 'join', 'renew'] as const
export const CHARGE_STATES = ['open', 'paid', 'void', 'refunded', 'part-refunded'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** The fee for a scheme, or one of its lengths, from a date. The price in force is the latest from_date not after today. */
export const prices = defineTable('membership_fees_prices', {
  id: col.id(),
  schemeId: col.ref('membership_schemes'),
  // Null means every length; a price for the chosen length wins over it.
  lengthOptionId: col.ref('membership_length_options', { nullable: true }),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  taxCode: col.internal(text('tax_code').notNull().default('none')),
  appliesTo: col.internal(text('applies_to', { enum: APPLIES_TO }).notNull()),
  fromDate: col.localDate('from_date').notNull(),
  setBy: col.account('set_by', { role: 'actor', onMerge: 'alias' }),
  createdAt: col.createdAt(),
}, {
  id: 'mfp',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    uniqueIndex('membership_fees_prices_one_a_day').on(t.schemeId, sql`coalesce(length_option_id, '')`, t.appliesTo, t.fromDate),
    check('membership_fees_prices_amount', sql`${t.amountMinor} >= 1`),
    check('membership_fees_prices_applies', sql`${t.appliesTo} IN (${inList(APPLIES_TO)})`),
  ],
})

/** What one membership owes (P1, P2), and the payment intent opened for it. */
export const charges = defineTable('membership_fees_charges', {
  id: col.id(),
  membershipId: col.ref('membership_memberships'),
  priceId: col.ref('membership_fees_prices'),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  taxCode: col.internal(text('tax_code').notNull()),
  state: col.internal(text('state', { enum: CHARGE_STATES }).notNull()),
  intentId: col.ref('payments_intents', { nullable: true }),
  channel: col.internal(text('channel', { enum: ['online', 'desk'] })),
  refundedMinor: col.minor('refunded_minor').notNull().default(0),
  paidAt: col.timestamp('paid_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'mfc',
  realm: 'operational',
  subject: { via: 'membership_id' },
  retention: 'membership-fees.retention.charges',
  extra: t => [
    // P2: a membership is charged once.
    uniqueIndex('membership_fees_charges_once').on(t.membershipId).where(sql`state <> 'void'`),
    index('membership_fees_charges_intent').on(t.intentId),
    check('membership_fees_charges_amount', sql`${t.amountMinor} >= 1`),
    check('membership_fees_charges_state', sql`${t.state} IN (${inList(CHARGE_STATES)})`),
    check('membership_fees_charges_refunded', sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.amountMinor}`),
    check('membership_fees_charges_paid', sql`${t.state} <> 'paid' OR (${t.intentId} IS NOT NULL AND ${t.paidAt} IS NOT NULL)`),
  ],
})

export const tables = { prices, charges }
