// Fundraising (third round, spec 10, part 2): funds and donations so far. A donation is what a
// charity needs about a gift; its money lives in Payments and Finance. Gift Aid, campaigns,
// sponsorships, collections and grants add their tables with their slices.
import { check, index, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const FUND_STATES = ['active', 'archived'] as const
export const CHANNELS = ['online', 'checkout', 'till', 'recorded', 'collection', 'regular'] as const
export const HOW_RECEIVED = ['card', 'cash', 'cheque', 'bank-transfer', 'elsewhere'] as const
export const DONATION_STATES = ['pending', 'received', 'abandoned', 'refunded'] as const
export const GIFT_AID = ['none', 'eligible', 'claimed', 'adjusted', 'ineligible'] as const
export const SDS = ['none', 'eligible', 'claimed', 'excluded'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** Where gifts go. Each fund has its own donations and Gift Aid income accounts. Never deleted. */
export const funds = defineTable('fundraising_funds', {
  id: col.id(),
  name: col.public(text('name').notNull()),
  purpose: col.public(text('purpose')),
  restricted: col.internal(integer('restricted', { mode: 'boolean' }).notNull().default(false)),
  isDefault: col.internal(integer('is_default', { mode: 'boolean' }).notNull().default(false)),
  offered: col.internal(integer('offered', { mode: 'boolean' }).notNull().default(true)),
  state: col.internal(text('state', { enum: FUND_STATES }).notNull().default('active')),
  sort: col.internal(integer('sort').notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'gfd',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('fundraising_funds_one_default').on(t.isDefault).where(sql`is_default = 1 AND state = 'active'`),
    uniqueIndex('fundraising_funds_name').on(sql`lower(name)`).where(sql`state = 'active'`),
    check('fundraising_funds_state', sql`${t.state} IN (${inList(FUND_STATES)})`),
    check('fundraising_funds_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('fundraising_funds_purpose', sql`${t.restricted} = 0 OR length(coalesce(${t.purpose}, '')) > 0`),
    check('fundraising_funds_default_active', sql`${t.isDefault} = 0 OR ${t.state} = 'active'`),
  ],
})

/** Every gift (part 2, Donations). Its amount, fund and channel are fixed once received (D4). */
export const donations = defineTable('fundraising_donations', {
  id: col.id(),
  reference: col.internal(text('reference')),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  contactEmail: col.email('contact_email', { erase: 'anonymise' }),
  donorName: col.personal(text('donor_name'), { erase: 'anonymise' }),
  companyId: col.internal(text('company_id')),
  organisationName: col.internal(text('organisation_name')),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  fundId: col.ref('fundraising_funds'),
  campaignId: col.internal(text('campaign_id')),
  productionId: col.internal(text('production_id')),
  channel: col.internal(text('channel', { enum: CHANNELS }).notNull()),
  howReceived: col.internal(text('how_received', { enum: HOW_RECEIVED })),
  receivedOn: col.localDate('received_on'),
  state: col.internal(text('state', { enum: DONATION_STATES }).notNull().default('pending')),
  refundedMinor: col.minor('refunded_minor').notNull().default(0),
  intentId: col.ref('payments_intents', { nullable: true }),
  partId: col.internal(text('part_id')),
  rodeWith: col.internal(text('rode_with')),
  acknowledgeAs: col.public(text('acknowledge_as'), { erase: 'anonymise' }),
  showAmount: col.internal(integer('show_amount', { mode: 'boolean' }).default(false), { erase: 'clear' }),
  sdsStatus: col.internal(text('sds_status', { enum: SDS }).notNull().default('none')),
  message: col.freeText(text('message')),
  hasBenefit: col.internal(integer('has_benefit', { mode: 'boolean' }).notNull().default(false)),
  giftAid: col.internal(text('gift_aid', { enum: GIFT_AID }).notNull().default('none')),
  giftAidReason: col.internal(text('gift_aid_reason')),
  declarationId: col.internal(text('declaration_id')),
  // The thanks page's link (P4): its keyed hash only, never the token.
  linkHash: col.internal(text('link_hash')),
  recordedBy: col.account('recorded_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  postingId: col.internal(text('posting_id')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'gdn',
  realm: 'audience',
  subject: { account: 'account_id', unlinked: 'staff' },
  retention: 'fundraising.retention.donations',
  extra: t => [
    uniqueIndex('fundraising_donations_reference').on(t.reference).where(sql`reference IS NOT NULL`),
    uniqueIndex('fundraising_donations_part').on(t.partId).where(sql`part_id IS NOT NULL`),
    uniqueIndex('fundraising_donations_link').on(t.linkHash).where(sql`link_hash IS NOT NULL`),
    index('fundraising_donations_account').on(t.accountId, t.receivedOn),
    index('fundraising_donations_email').on(t.contactEmail),
    index('fundraising_donations_campaign').on(t.campaignId, t.state),
    index('fundraising_donations_fund').on(t.fundId, t.receivedOn),
    index('fundraising_donations_intent').on(t.intentId),
    check('fundraising_donations_amount', sql`${t.amountMinor} > 0`),
    check('fundraising_donations_refunded', sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.amountMinor}`),
    check('fundraising_donations_channel', sql`${t.channel} IN (${inList(CHANNELS)})`),
    check('fundraising_donations_how', sql`${t.howReceived} IS NULL OR ${t.howReceived} IN (${inList(HOW_RECEIVED)})`),
    check('fundraising_donations_recorded', sql`${t.channel} <> 'recorded' OR ${t.howReceived} IS NOT NULL`),
    check('fundraising_donations_state', sql`${t.state} IN (${inList(DONATION_STATES)})`),
    check('fundraising_donations_received', sql`${t.state} NOT IN ('received', 'refunded') OR (${t.receivedOn} IS NOT NULL AND ${t.reference} IS NOT NULL)`),
    check('fundraising_donations_gift_aid', sql`${t.giftAid} IN (${inList(GIFT_AID)})`),
    check('fundraising_donations_sds', sql`${t.sdsStatus} IN (${inList(SDS)})`),
    check('fundraising_donations_acknowledge', sql`${t.acknowledgeAs} IS NULL OR length(${t.acknowledgeAs}) <= 60`),
    check('fundraising_donations_message', sql`${t.message} IS NULL OR length(${t.message}) <= 500`),
  ],
})

export const tables = { funds, donations }
