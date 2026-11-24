// Payments: money moving, never tickets (Box office specification, part 2, Payments). One payment can
// cover things owned by different modules, so an intent says how much is being collected and its
// parts say what for. No card data is held: an integrated provider keeps the card, and the platform
// keeps only the provider's reference. The life-cycle triggers are written by hand at the end of the
// migration that creates these tables.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** One configured connection to a provider. Its keys are credentials in core_credentials; this table holds none. */
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
  practice: 'replace',
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

/**
 * One person's turn at a till, from opening to cashing up. The till opens it; point_label is an
 * optional note beside its place (space_id, a core space; none reads as unknown). closed_how says
 * whether a person closed it or it closed itself after a quiet spell.
 */
export const sessions = defineTable('payments_sessions', {
  id: col.id(),
  pointLabel: col.internal(text('point_label').notNull()),
  spaceId: col.internal(text('space_id')),
  openedBy: col.account('opened_by', { role: 'subject', onMerge: 'move', reason: 'a person has one open till session, a unique rule on this id' }),
  closedBy: col.account('closed_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  openedAt: col.timestamp('opened_at').notNull(),
  closedAt: col.timestamp('closed_at'),
  state: col.internal(text('state', { enum: ['open', 'counting', 'closed'] }).notNull()),
  floatMinor: col.minor('float_minor').notNull(),
  expectedCashMinor: col.minor('expected_cash_minor'),
  countedCashMinor: col.minor('counted_cash_minor'),
  varianceNote: col.freeText(text('variance_note')),
  closedHow: col.internal(text('closed_how', { enum: ['hand', 'quiet'] })),
  currency: col.currency('currency').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'till',
  realm: 'operational',
  extra: t => [
    // A person has one open session. One awaiting its count does not stop them opening the next.
    uniqueIndex('payments_sessions_one_open').on(t.openedBy).where(sql`state = 'open'`),
    // The Till sessions list, newest first.
    index('payments_sessions_opened').on(t.openedAt),
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
  // What an "other" payment was: a voucher number or an invoice's reference, as the seller typed it.
  // A reference, not a note about anyone, so internal. At most 200 characters, checked by the route:
  // a check here would mean rebuilding the table, and with it its triggers.
  note: col.internal(text('note')),
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

/**
 * Who pays for what in a till sale, and where their receipt goes (Matt, 18 November 2026). A sale
 * that is not split has one row, position 0, for everything. A sale split between people by item has
 * a row for each person (1, 2, …): each pays for exactly the items given to them, never a typed
 * amount. The items are fixed when the sale is made. Receipts go once the sale is paid, one for each
 * row with somewhere to send it, by account or by a typed address. The address is kept only until the
 * sale ends: a trigger clears it then.
 */
export const tillSplits = defineTable('payments_till_splits', {
  id: col.id(),
  intentId: col.ref('payments_intents'),
  // 0 for a whole sale; 1, 2, 3 for "Person 1" on the till.
  position: col.internal(integer('position').notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  // JSON list of { basket, module, record, line, key, quantity, label, amountMinor }: what this row pays for.
  items: col.internal(text('items').notNull()),
  // The latest payment taken for this person; theirs is paid once it has succeeded.
  attemptId: col.ref('payments_attempts', { nullable: true }),
  // Where the receipt goes: a person found by the seller, or an address typed.
  receiptAccountId: col.account('receipt_account_id', { role: 'subject', nullable: true }),
  receiptTo: col.email('receipt_to', { erase: 'clear' }),
  receiptSentAt: col.timestamp('receipt_sent_at'),
  createdAt: col.createdAt(),
}, {
  id: 'tsp',
  realm: 'audience',
  subject: { account: 'receipt_account_id', unlinked: 'staff' },
  extra: t => [
    uniqueIndex('payments_till_splits_position').on(t.intentId, t.position),
    index('payments_till_splits_attempt').on(t.attemptId).where(sql`attempt_id IS NOT NULL`),
    index('payments_till_splits_account').on(t.receiptAccountId).where(sql`receipt_account_id IS NOT NULL`),
    check('payments_till_splits_amount', sql`${t.amountMinor} > 0`),
    check('payments_till_splits_position', sql`${t.position} >= 0`),
    check('payments_till_splits_one_receipt', sql`${t.receiptAccountId} IS NULL OR ${t.receiptTo} IS NULL`),
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
    // The Refunds list, newest first.
    index('payments_refunds_created').on(t.createdAt),
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

/**
 * Where the theatre pays someone: a person's or a company's bank details, sealed with the core key
 * (Invoices and exports, part 4, P-A1). The only place a bank account number is kept. Shown masked
 * except to payments.payee.read, which audits each read; never in an export, event, job or log.
 */
export const payees = defineTable('payments_payees', {
  id: col.id(),
  // Whose details: `core` and an account id, or `companies` and a company id.
  partyModule: col.internal(text('party_module').notNull()),
  partyId: col.internal(text('party_id').notNull()),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move', reason: 'a person has one set of bank details; the survivor keeps them', nullable: true }),
  // Null once cleared: by erasure, by the person, or after payments.payees.keep-for unused.
  accountName: col.personal(text('account_name'), { erase: 'clear', encrypted: true }),
  sortCode: col.personal(text('sort_code'), { erase: 'clear', encrypted: true }),
  accountNumber: col.personal(text('account_number'), { erase: 'clear', encrypted: true }),
  // The last two digits of the account number, kept apart so a masked view needs no key.
  lastDigits: col.personal(text('last_digits'), { erase: 'clear' }),
  lastUsedOn: col.localDate('last_used_on'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ppy',
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  retention: 'payments.payees.keep-for',
  onErasure: 'keep-row',
  extra: t => [
    uniqueIndex('payments_payees_party').on(t.partyModule, t.partyId),
    index('payments_payees_account').on(t.accountId).where(sql`account_id IS NOT NULL`),
  ],
})

/**
 * Money the theatre paid out, recorded after a person paid it in the bank or from petty cash (P-A1):
 * Payments never sends money. One owner record per row; a mistake is undone by a reversing row.
 */
export const disbursements = defineTable('payments_disbursements', {
  id: col.id(),
  method: col.internal(text('method', { enum: ['bank-transfer', 'cheque', 'theatre-card', 'petty-cash', 'parent-body'] }).notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  currency: col.currency('currency').notNull(),
  // `invoicing` and a bill id, or `budgets` and a claim id.
  ownerModule: col.internal(text('owner_module').notNull()),
  ownerRecord: col.internal(text('owner_record').notNull()),
  payeeId: col.ref('payments_payees', { nullable: true }),
  paidOn: col.localDate('paid_on').notNull(),
  // The bank reference or cheque number.
  reference: col.internal(text('reference')),
  reversesId: col.internal(text('reverses_id')),
  postingId: col.internal(text('posting_id').notNull()),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'pdb',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    uniqueIndex('payments_disbursements_reverses').on(t.reversesId).where(sql`reverses_id IS NOT NULL`),
    index('payments_disbursements_owner').on(t.ownerModule, t.ownerRecord),
    index('payments_disbursements_paid').on(t.paidOn),
    check('payments_disbursements_amount', sql`${t.amountMinor} > 0`),
    check('payments_disbursements_method', sql`${t.method} IN ('bank-transfer', 'cheque', 'theatre-card', 'petty-cash', 'parent-body')`),
    check('payments_disbursements_reference', sql`${t.reference} IS NULL OR length(${t.reference}) <= 40`),
  ],
})

export const tables = { providerAccounts, readers, sessions, intents, intentParts, attempts, attemptEvents, refunds, webhookEvents, tillSplits, payees, disbursements }
