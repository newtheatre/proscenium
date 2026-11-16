// Payments: money moving, never tickets (Box office specification, part 2, Payments). One payment can
// cover things owned by different modules, so an intent says how much is being collected and its
// parts say what for. No card data is held: an integrated provider keeps the card, and the platform
// keeps only the provider's reference. The life-cycle triggers are written by hand at the end of the
// migration that creates these tables.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** One configured connection to a provider. Secrets are Worker secrets; this table holds none. */
export const providerAccounts = defineTable('payments_provider_accounts', {
  id: col.id(),
  // The id of a contribution to payments.provider, such as cash or stripe.
  provider: col.internal(text('provider').notNull()),
  label: col.internal(text('label').notNull()),
  // JSON list of online and desk.
  channels: col.internal(text('channels').notNull()),
  mode: col.internal(text('mode', { enum: ['live', 'test'] }).notNull()),
  externalRef: col.internal(text('external_ref')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ppa',
  realm: 'operational',
  subject: 'none',
  extra: t => [check('payments_provider_accounts_mode', sql`${t.mode} IN ('live', 'test')`)],
})

/** A physical card reader paired with a provider account. */
export const readers = defineTable('payments_readers', {
  id: col.id(),
  providerAccountId: col.ref('payments_provider_accounts'),
  label: col.internal(text('label').notNull()),
  externalRef: col.internal(text('external_ref')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, { id: 'rdr', realm: 'operational', subject: 'none' })

/** One person's turn at a till, from opening to cashing up. */
export const sessions = defineTable('payments_sessions', {
  id: col.id(),
  pointLabel: col.internal(text('point_label').notNull()),
  openedBy: col.account('opened_by', { role: 'subject', onMerge: 'move', reason: 'a person has one open till session, a unique rule on this id' }),
  closedBy: col.account('closed_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  openedAt: col.timestamp('opened_at').notNull(),
  closedAt: col.timestamp('closed_at'),
  state: col.internal(text('state', { enum: ['open', 'counting', 'closed'] }).notNull()),
  floatMinor: col.minor('float_minor').notNull(),
  expectedCashMinor: col.minor('expected_cash_minor'),
  countedCashMinor: col.minor('counted_cash_minor'),
  varianceNote: col.freeText(text('variance_note')),
  currency: col.currency('currency').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'till',
  realm: 'operational',
  extra: t => [
    // A person has one open session.
    uniqueIndex('payments_sessions_one_open').on(t.openedBy).where(sql`state <> 'closed'`),
    check('payments_sessions_state', sql`${t.state} IN ('open', 'counting', 'closed')`),
    check('payments_sessions_float', sql`${t.floatMinor} >= 0`),
    check('payments_sessions_note', sql`${t.varianceNote} IS NULL OR length(${t.varianceNote}) <= 200`),
  ],
})

/** A decision to collect one amount. It has no owner of its own: its parts say who it is for. */
export const intents = defineTable('payments_intents', {
  id: col.id(),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  channel: col.internal(text('channel', { enum: ['online', 'desk'] }).notNull()),
  state: col.internal(text('state', { enum: ['open', 'succeeded', 'cancelled', 'expired', 'unfulfilled'] }).notNull()),
  expiresAt: col.timestamp('expires_at').notNull(),
  sessionId: col.ref('payments_sessions', { nullable: true }),
  settledAt: col.timestamp('settled_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'pay',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('payments_intents_open').on(t.state, t.expiresAt),
    index('payments_intents_session').on(t.sessionId).where(sql`session_id IS NOT NULL`),
    check('payments_intents_amount', sql`${t.amountMinor} > 0`),
    check('payments_intents_channel', sql`${t.channel} IN ('online', 'desk')`),
    check('payments_intents_state', sql`${t.state} IN ('open', 'succeeded', 'cancelled', 'expired', 'unfulfilled')`),
  ],
})

/** One row per thing an intent pays for. An ordinary ticket order is an intent with one part. */
export const intentParts = defineTable('payments_intent_parts', {
  id: col.id(),
  intentId: col.ref('payments_intents'),
  ownerModule: col.internal(text('owner_module').notNull()),
  ownerRecord: col.internal(text('owner_record').notNull()),
  // 1 while the intent is open, null afterwards; kept by the trigger that moves the intent's state.
  open: col.internal(integer('open')),
  amountMinor: col.minor('amount_minor').notNull(),
  refundedMinor: col.minor('refunded_minor').notNull().default(0),
  settledAt: col.timestamp('settled_at'),
  createdAt: col.createdAt(),
}, {
  id: 'pip',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('payments_intent_parts_owner').on(t.intentId, t.ownerModule, t.ownerRecord),
    // A record has at most one open intent collecting for it.
    uniqueIndex('payments_intent_parts_one_open').on(t.ownerModule, t.ownerRecord).where(sql`open = 1`),
    check('payments_intent_parts_amount', sql`${t.amountMinor} > 0`),
    check('payments_intent_parts_refunded', sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.amountMinor}`),
    check('payments_intent_parts_open', sql`${t.open} IS NULL OR ${t.open} = 1`),
  ],
})

/** One try at collecting an intent by one method. A split payment is several attempts. */
export const attempts = defineTable('payments_attempts', {
  id: col.id(),
  intentId: col.ref('payments_intents'),
  providerAccountId: col.ref('payments_provider_accounts'),
  method: col.internal(text('method', { enum: ['card_online', 'card_reader', 'card_attested', 'cash', 'other_attested'] }).notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  state: col.internal(text('state', { enum: ['started', 'pending', 'succeeded', 'failed', 'cancelled', 'unknown'] }).notNull()),
  idempotencyKey: col.internal(text('idempotency_key').notNull()),
  providerRef: col.internal(text('provider_ref')),
  readerId: col.ref('payments_readers', { nullable: true }),
  feeMinor: col.minor('fee_minor'),
  refundedMinor: col.minor('refunded_minor').notNull().default(0),
  tenderedMinor: col.minor('tendered_minor'),
  answeredBy: col.account('answered_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  failureCode: col.internal(text('failure_code')),
  startedAt: col.timestamp('started_at').notNull(),
  answeredAt: col.timestamp('answered_at'),
  updatedAt: col.updatedAt(),
}, {
  id: 'att',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('payments_attempts_idempotency_key').on(t.idempotencyKey),
    uniqueIndex('payments_attempts_provider_ref').on(t.providerAccountId, t.providerRef).where(sql`provider_ref IS NOT NULL`),
    // A reader runs one payment at a time.
    uniqueIndex('payments_attempts_reader_busy').on(t.readerId).where(sql`reader_id IS NOT NULL AND state IN ('started', 'pending')`),
    index('payments_attempts_intent').on(t.intentId),
    index('payments_attempts_waiting').on(t.state).where(sql`state IN ('pending', 'unknown')`),
    check('payments_attempts_amount', sql`${t.amountMinor} > 0`),
    check('payments_attempts_refunded', sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.amountMinor}`),
    check('payments_attempts_method', sql`${t.method} IN ('card_online', 'card_reader', 'card_attested', 'cash', 'other_attested')`),
    check('payments_attempts_state', sql`${t.state} IN ('started', 'pending', 'succeeded', 'failed', 'cancelled', 'unknown')`),
  ],
})

/** Everything that was heard about an attempt, in the order it was heard. */
export const attemptEvents = defineTable('payments_attempt_events', {
  id: col.id(),
  attemptId: col.ref('payments_attempts'),
  kind: col.internal(text('kind', { enum: ['started', 'provider_pending', 'provider_succeeded', 'provider_failed', 'attested_succeeded', 'attested_failed', 'cancelled', 'timed_out', 'reconciled'] }).notNull()),
  source: col.internal(text('source', { enum: ['webhook', 'poll', 'person', 'system'] }).notNull()),
  webhookEventId: col.internal(text('webhook_event_id')),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  at: col.timestamp('at').notNull(),
}, {
  id: 'ate',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [index('payments_attempt_events_attempt').on(t.attemptId, t.at)],
})

export const refunds = defineTable('payments_refunds', {
  id: col.id(),
  // The payment being refunded: a refund always goes back the way the money came.
  attemptId: col.ref('payments_attempts'),
  // The part being refunded, which names the owner.
  partId: col.ref('payments_intent_parts'),
  amountMinor: col.minor('amount_minor').notNull(),
  state: col.internal(text('state', { enum: ['requested', 'approved', 'sent', 'succeeded', 'failed', 'declined'] }).notNull()),
  idempotencyKey: col.internal(text('idempotency_key').notNull()),
  providerRef: col.internal(text('provider_ref')),
  requestedBy: col.account('requested_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  // payments.refunds.self-approve-up-to when the refund was requested; 0 means two people.
  selfApproveLimitMinor: col.minor('self_approve_limit_minor').notNull(),
  approvedBy: col.account('approved_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  declineReasonTermId: col.ref('core_terms', { nullable: true }),
  // A cash refund is handed back from a till session, and counts against its expected cash.
  sessionId: col.ref('payments_sessions', { nullable: true }),
  feeReturnedMinor: col.minor('fee_returned_minor'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'rfd',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('payments_refunds_idempotency_key').on(t.idempotencyKey),
    index('payments_refunds_part').on(t.partId),
    index('payments_refunds_waiting').on(t.state).where(sql`state IN ('requested', 'approved', 'sent', 'failed')`),
    check('payments_refunds_amount', sql`${t.amountMinor} > 0`),
    check('payments_refunds_state', sql`${t.state} IN ('requested', 'approved', 'sent', 'succeeded', 'failed', 'declined')`),
    // The two-person rule, with the limit copied onto the refund when it was requested.
    check('payments_refunds_two_people', sql`${t.approvedBy} IS NULL OR ${t.requestedBy} IS NULL OR ${t.approvedBy} <> ${t.requestedBy} OR ${t.amountMinor} <= ${t.selfApproveLimitMinor}`),
    check('payments_refunds_declined_reason', sql`${t.state} <> 'declined' OR ${t.declineReasonTermId} IS NOT NULL`),
  ],
})

/**
 * A provider's webhook delivery, by its event id: a repeat inserts nothing. The body is not kept;
 * the handler asks the provider for the payment's current state instead.
 */
export const webhookEvents = defineTable('payments_webhook_events', {
  id: col.id(),
  providerAccountId: col.ref('payments_provider_accounts'),
  providerEventId: col.internal(text('provider_event_id').notNull()),
  type: col.internal(text('type').notNull()),
  signatureOk: col.internal(integer('signature_ok', { mode: 'boolean' }).notNull()),
  attemptId: col.ref('payments_attempts', { nullable: true }),
  receivedAt: col.timestamp('received_at').notNull(),
  handledAt: col.timestamp('handled_at'),
}, {
  id: 'pwe',
  realm: 'operational',
  subject: 'none',
  retention: 'payments.retention.webhooks',
  extra: t => [
    // Only a verified event claims its id: a forged event naming a real id must not shut out the real one.
    uniqueIndex('payments_webhook_events_event').on(t.providerAccountId, t.providerEventId).where(sql`signature_ok = 1`),
    index('payments_webhook_events_received').on(t.receivedAt),
  ],
})

export const tables = { providerAccounts, readers, sessions, intents, intentParts, attempts, attemptEvents, refunds, webhookEvents }
