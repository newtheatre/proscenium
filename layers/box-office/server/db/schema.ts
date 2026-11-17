// Box office: what is on sale, capacity, orders and tickets (Box office specification, part 2). A
// reference to a performance, a production or a space is by id only: no table here reads the core's.
// Claims are the truth about what is sold: a pool's counter is kept by triggers and its CHECK is the
// capacity, so no code path can oversell. The life-cycle triggers are written by hand at the end of
// the migration that creates these tables.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

/** Box office's own view of one performance it sells. Sale state lives here, not in the core. */
export const performanceSales = defineTable('box_office_performance_sales', {
  id: col.id(),
  performanceId: col.public(text('performance_id').notNull()),
  seating: col.public(text('seating', { enum: ['general', 'allocated'] }).notNull().default('general')),
  // A seating plan, with allocated seating (a later phase).
  planId: col.internal(text('plan_id')),
  state: col.public(text('state', { enum: ['draft', 'on_sale', 'paused', 'closed'] }).notNull().default('draft')),
  onSaleAt: col.timestamp('on_sale_at'),
  // Null means the setting's default before curtain.
  offSaleAt: col.timestamp('off_sale_at'),
  maxPerOrder: col.public(integer('max_per_order')),
  holdMinutes: col.internal(integer('hold_minutes')),
  paymentTiming: col.public(text('payment_timing', { enum: ['pay-now', 'reserve', 'buyer-chooses'] })),
  // What happens to tickets when the core cancels, reschedules or moves this performance (R-11).
  changeDecision: col.internal(text('change_decision', { enum: ['refund_all', 'offer_exchange', 'keep'] })),
  changeDecidedBy: col.account('change_decided_by', { role: 'actor', nullable: true }),
  changeDecidedAt: col.timestamp('change_decided_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'sale',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('box_office_performance_sales_performance').on(t.performanceId),
    index('box_office_performance_sales_due').on(t.state, t.onSaleAt),
    check('box_office_performance_sales_seating', sql`${t.seating} IN ('general', 'allocated')`),
    check('box_office_performance_sales_plan', sql`${t.seating} = 'general' OR ${t.planId} IS NOT NULL`),
    check('box_office_performance_sales_state', sql`${t.state} IN ('draft', 'on_sale', 'paused', 'closed')`),
    check('box_office_performance_sales_cap', sql`${t.maxPerOrder} IS NULL OR ${t.maxPerOrder} > 0`),
    check('box_office_performance_sales_hold', sql`${t.holdMinutes} IS NULL OR ${t.holdMinutes} > 0`),
    check('box_office_performance_sales_timing', sql`${t.paymentTiming} IS NULL OR ${t.paymentTiming} IN ('pay-now', 'reserve', 'buyer-chooses')`),
    check('box_office_performance_sales_decision', sql`${t.changeDecision} IS NULL OR ${t.changeDecision} IN ('refund_all', 'offer_exchange', 'keep')`),
  ],
})

/** A priced part of the house for one production: "Stalls", "Balcony", "Wheelchair spaces". */
export const bands = defineTable('box_office_bands', {
  id: col.id(),
  productionId: col.public(text('production_id').notNull()),
  name: col.public(text('name').notNull()),
  kind: col.public(text('kind', { enum: ['standard', 'wheelchair', 'restricted_view'] }).notNull().default('standard')),
  // Wheelchair bands only: the seating band whose seats are removed to make each space.
  displacesBandId: col.ref('box_office_bands', { nullable: true }),
  displacesUnits: col.internal(integer('displaces_units').notNull().default(2)),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'band',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('box_office_bands_name').on(t.productionId, t.name),
    check('box_office_bands_kind', sql`${t.kind} IN ('standard', 'wheelchair', 'restricted_view')`),
    check('box_office_bands_displaces', sql`${t.displacesUnits} >= 1 AND (${t.displacesBandId} IS NULL OR ${t.kind} = 'wheelchair')`),
  ],
})

/** Who a ticket is for: "Full price", "Concession", "Companion". Site-wide. */
export const ticketTypes = defineTable('box_office_ticket_types', {
  id: col.id(),
  name: col.public(text('name').notNull()),
  kind: col.public(text('kind', { enum: ['standard', 'concession', 'companion', 'complimentary'] }).notNull().default('standard')),
  // A JSON list of requirement references, checked through the kit. Box office never reads inside one.
  requirementRefs: col.internal(text('requirement_refs')),
  recheckAtEntry: col.internal(integer('recheck_at_entry', { mode: 'boolean' }).notNull().default(true)),
  maxPerHolder: col.internal(integer('max_per_holder').notNull().default(1)),
  proofNote: col.public(text('proof_note')),
  needsPaidTicket: col.internal(integer('needs_paid_ticket', { mode: 'boolean' }).notNull().default(false)),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  // Where it is sold: everywhere, only at the desk (an industry rate, a price on the door) or only
  // online (an online discount). A selling choice, so people set it on a module's type too. The
  // routes hold it to those three; no CHECK, since adding one to an existing table rebuilds it.
  channel: col.internal(text('channel', { enum: ['all', 'desk', 'online'] }).notNull().default('all')),
  // Set on a type a module declares through box-office.ticket-type: `<module>.<id>`. The module owns
  // its rules (kind, requirements, needing a paid ticket); people may only rename, order and price it.
  managedBy: col.internal(text('managed_by')),
  // The order every list shows the types in; the name breaks a tie.
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tty',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('box_office_ticket_types_name').on(t.name),
    uniqueIndex('box_office_ticket_types_managed').on(t.managedBy).where(sql`managed_by IS NOT NULL`),
    check('box_office_ticket_types_kind', sql`${t.kind} IN ('standard', 'concession', 'companion', 'complimentary')`),
    check('box_office_ticket_types_holder', sql`${t.maxPerHolder} >= 1`),
  ],
})

/**
 * The price of one ticket type in one band. A change is a new row; the newest row at the moment of
 * sale wins, and an order line copies the amount, so an old order never changes.
 */
export const prices = defineTable('box_office_prices', {
  id: col.id(),
  productionId: col.public(text('production_id').notNull()),
  // Null means every performance of the production.
  performanceId: col.public(text('performance_id')),
  bandId: col.ref('box_office_bands'),
  ticketTypeId: col.ref('box_office_ticket_types'),
  // Null withdraws the price.
  amountMinor: col.minor('amount_minor'),
  // On a performance's own row: from now on it follows the production's price again. Its amount is null.
  inherits: col.internal(integer('inherits', { mode: 'boolean' }).notNull().default(false)),
  currency: col.currency('currency').notNull(),
  effectiveFrom: col.timestamp('effective_from').notNull(),
  setBy: col.account('set_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'prc',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('box_office_prices_lookup').on(t.productionId, t.bandId, t.ticketTypeId, t.effectiveFrom),
    check('box_office_prices_amount', sql`${t.amountMinor} IS NULL OR ${t.amountMinor} >= 0`),
  ],
})

/** The capacity of one band at one performance. `claimed` is written only by the claims' triggers. */
export const pools = defineTable('box_office_pools', {
  id: col.id(),
  performanceId: col.public(text('performance_id').notNull()),
  bandId: col.ref('box_office_bands'),
  capacity: col.internal(integer('capacity').notNull()),
  claimed: col.internal(integer('claimed').notNull().default(0)),
  // Set when capacity is raised above the space's own.
  overVenueConfirmedBy: col.account('over_venue_confirmed_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'pool',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('box_office_pools_band').on(t.performanceId, t.bandId),
    check('box_office_pools_capacity', sql`${t.capacity} >= 0`),
    // The last-seat guarantee: the database refuses a claim past capacity, whatever the code does.
    check('box_office_pools_claimed', sql`${t.claimed} >= 0 AND ${t.claimed} <= ${t.capacity}`),
  ],
})

/** A buyer's order: a basket, a reservation, or a confirmed sale. It stores no name or address. */
export const orders = defineTable('box_office_orders', {
  id: col.id(),
  reference: col.internal(text('reference').notNull()),
  channel: col.internal(text('channel', { enum: ['online', 'desk', 'phone'] }).notNull()),
  state: col.internal(text('state', { enum: ['basket', 'reserved', 'awaiting_payment', 'confirmed', 'cancelled', 'expired'] }).notNull()),
  // Null for a basket not yet checked out and for an anonymous desk sale (R-15).
  accountId: col.account('account_id', { role: 'subject', nullable: true }),
  signedIn: col.internal(integer('signed_in', { mode: 'boolean' }).notNull().default(false)),
  // A list of { term, note? } from core.access-need, copied for this booking. Never on an order with no account.
  accessNote: col.special('access_note'),
  currency: col.currency('currency').notNull(),
  totalMinor: col.minor('total_minor').notNull().default(0),
  soldBy: col.account('sold_by', { role: 'actor', nullable: true }),
  sessionId: col.ref('payments_sessions', { nullable: true }),
  intentId: col.ref('payments_intents', { nullable: true }),
  // Each opens the order for whoever holds the value, so each is cleared with the person. The basket
  // token is the browser's, from Hold tickets to the confirmation screen; the link token is the one
  // in the order's messages.
  basketTokenHash: col.personal(text('basket_token_hash'), { erase: 'clear' }),
  // A guest's reservation waiting for its address to be proved: who to make the account for once
  // the link is pressed. All four are cleared when the basket is reserved.
  confirmTokenHash: col.personal(text('confirm_token_hash'), { erase: 'clear' }),
  confirmExpiresAt: col.timestamp('confirm_expires_at'),
  confirmEmail: col.personal(text('confirm_email'), { erase: 'clear' }),
  confirmName: col.personal(text('confirm_name'), { erase: 'clear' }),
  linkTokenExpiresAt: col.timestamp('link_token_expires_at'),
  linkTokenHash: col.personal(text('link_token_hash'), { erase: 'clear' }),
  deskCodeHash: col.personal(text('desk_code_hash'), { erase: 'clear' }),
  expiresAt: col.timestamp('expires_at'),
  extendedAt: col.timestamp('extended_at'),
  releaseAt: col.timestamp('release_at'),
  keep: col.internal(integer('keep', { mode: 'boolean' }).notNull().default(false)),
  // Set by the desk when the buyer is standing there: the tickets are admitted as they are issued.
  admitOnPayment: col.internal(integer('admit_on_payment', { mode: 'boolean' }).notNull().default(false)),
  // Set by the reserve batch and by nothing else: a change of ticket type is priced as of then.
  reservedAt: col.timestamp('reserved_at'),
  confirmedAt: col.timestamp('confirmed_at'),
  cancelledAt: col.timestamp('cancelled_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'ord',
  realm: 'audience',
  subject: { account: 'account_id', unlinked: 'staff' },
  onErasure: 'keep-row',
  extra: t => [
    uniqueIndex('box_office_orders_reference').on(t.reference),
    uniqueIndex('box_office_orders_basket_token').on(t.basketTokenHash).where(sql`basket_token_hash IS NOT NULL`),
    uniqueIndex('box_office_orders_confirm_token').on(t.confirmTokenHash).where(sql`confirm_token_hash IS NOT NULL`),
    // A trigger keeps the address waiting to be confirmed to a basket, whole, ending no later than the basket.
    uniqueIndex('box_office_orders_link').on(t.linkTokenHash).where(sql`link_token_hash IS NOT NULL`),
    uniqueIndex('box_office_orders_desk_code').on(t.deskCodeHash).where(sql`desk_code_hash IS NOT NULL`),
    index('box_office_orders_account').on(t.accountId).where(sql`account_id IS NOT NULL`),
    index('box_office_orders_expiring').on(t.state, t.expiresAt),
    index('box_office_orders_releasing').on(t.state, t.releaseAt),
    // The Orders list, newest first.
    index('box_office_orders_created').on(t.createdAt),
    check('box_office_orders_channel', sql`${t.channel} IN ('online', 'desk', 'phone')`),
    check('box_office_orders_state', sql`${t.state} IN ('basket', 'reserved', 'awaiting_payment', 'confirmed', 'cancelled', 'expired')`),
    check('box_office_orders_total', sql`${t.totalMinor} >= 0`),
    // An order with no account is a basket, or an anonymous desk sale holding nothing personal.
    check('box_office_orders_account_needed', sql`${t.accountId} IS NOT NULL OR ${t.state} IN ('basket', 'expired') OR (${t.channel} = 'desk' AND ${t.accessNote} IS NULL AND ${t.state} <> 'reserved')`),
  ],
})

/** Why a group of claims exists and who owns it. */
export const holds = defineTable('box_office_holds', {
  id: col.id(),
  kind: col.internal(text('kind', { enum: ['basket', 'payment', 'reservation', 'staff', 'waitlist_offer'] }).notNull()),
  // Null for a staff hold.
  orderId: col.ref('box_office_orders', { nullable: true }),
  // Staff holds only, such as "Director's guests".
  label: col.freeText(text('label')),
  heldBy: col.account('held_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'hold',
  realm: 'audience',
  subject: { via: 'order_id' },
  retention: 'box-office.retention.holds',
  extra: t => [
    index('box_office_holds_order').on(t.orderId).where(sql`order_id IS NOT NULL`),
    check('box_office_holds_kind', sql`${t.kind} IN ('basket', 'payment', 'reservation', 'staff', 'waitlist_offer')`),
    check('box_office_holds_owner', sql`(${t.kind} = 'staff') = (${t.orderId} IS NULL)`),
    check('box_office_holds_label', sql`${t.label} IS NULL OR (${t.kind} = 'staff' AND length(${t.label}) <= 80)`),
  ],
})

/** One unit of capacity, or one seat. Released is final, and a claim is never deleted. */
export const claims = defineTable('box_office_claims', {
  id: col.id(),
  poolId: col.ref('box_office_pools'),
  // Null for general admission; a performance's seat with allocated seating (a later phase).
  seatId: col.internal(text('seat_id')),
  holdId: col.ref('box_office_holds'),
  // Set on a claim that exists only because a wheelchair space removed this seat.
  displacedForId: col.ref('box_office_claims', { nullable: true }),
  state: col.internal(text('state', { enum: ['held', 'confirmed', 'released'] }).notNull()),
  // Null once confirmed, and for a staff hold with no end.
  expiresAt: col.timestamp('expires_at'),
  releasedAt: col.timestamp('released_at'),
  releaseReason: col.internal(text('release_reason', { enum: ['expired', 'abandoned', 'cancelled', 'exchanged', 'staff', 'payment_failed'] })),
  createdAt: col.createdAt(),
}, {
  id: 'clm',
  realm: 'audience',
  subject: { via: 'hold_id' },
  extra: t => [
    // A seat has one live claim.
    uniqueIndex('box_office_claims_one_live_per_seat').on(t.poolId, t.seatId).where(sql`seat_id IS NOT NULL AND state IN ('held', 'confirmed')`),
    index('box_office_claims_pool').on(t.poolId, t.state, t.expiresAt),
    index('box_office_claims_hold').on(t.holdId),
    check('box_office_claims_state', sql`${t.state} IN ('held', 'confirmed', 'released')`),
    check('box_office_claims_released', sql`(${t.state} = 'released') = (${t.releasedAt} IS NOT NULL) AND (${t.state} = 'released') = (${t.releaseReason} IS NOT NULL)`),
    check('box_office_claims_reason', sql`${t.releaseReason} IS NULL OR ${t.releaseReason} IN ('expired', 'abandoned', 'cancelled', 'exchanged', 'staff', 'payment_failed')`),
    check('box_office_claims_confirmed', sql`${t.state} <> 'confirmed' OR ${t.expiresAt} IS NULL`),
  ],
})

/** One line per ticket, never a quantity, so each can be refunded, exchanged and scanned on its own. */
export const orderLines = defineTable('box_office_order_lines', {
  id: col.id(),
  orderId: col.ref('box_office_orders'),
  kind: col.internal(text('kind', { enum: ['ticket', 'booking_fee', 'donation', 'pass_sale', 'exchange_fee', 'adjustment'] }).notNull()),
  performanceId: col.internal(text('performance_id')),
  bandId: col.ref('box_office_bands', { nullable: true }),
  ticketTypeId: col.ref('box_office_ticket_types', { nullable: true }),
  claimId: col.ref('box_office_claims', { nullable: true }),
  // The price copied at the moment the line was added, and the price row it came from, so a report
  // can tell a performance's own price from the production's, and a sale before a price change from
  // one after it. Null for a complimentary ticket, and for a line from before this was kept.
  priceId: col.ref('box_office_prices', { nullable: true }),
  listMinor: col.minor('list_minor').notNull(),
  discountMinor: col.minor('discount_minor').notNull().default(0),
  amountMinor: col.minor('amount_minor').notNull(),
  promoRedemptionId: col.internal(text('promo_redemption_id')),
  passRedemptionId: col.internal(text('pass_redemption_id')),
  compRequestId: col.internal(text('comp_request_id')),
  // For a ticket type with requirements: the reference that was met and who met it, copied onto the
  // ticket when it is issued so the door can check it again.
  requirementRef: col.internal(text('requirement_ref')),
  requirementAccountId: col.account('requirement_account_id', { role: 'actor', nullable: true }),
  requirementEvidenceId: col.internal(text('requirement_evidence_id')),
  state: col.internal(text('state', { enum: ['live', 'cancelled', 'exchanged'] }).notNull().default('live')),
  replacesLineId: col.ref('box_office_order_lines', { nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'orl',
  realm: 'audience',
  subject: { via: 'order_id' },
  extra: t => [
    index('box_office_order_lines_order').on(t.orderId),
    index('box_office_order_lines_performance').on(t.performanceId, t.state).where(sql`performance_id IS NOT NULL`),
    index('box_office_order_lines_requirement').on(t.performanceId, t.ticketTypeId).where(sql`requirement_ref IS NOT NULL`),
    uniqueIndex('box_office_order_lines_claim').on(t.claimId).where(sql`claim_id IS NOT NULL`),
    check('box_office_order_lines_kind', sql`${t.kind} IN ('ticket', 'booking_fee', 'donation', 'pass_sale', 'exchange_fee', 'adjustment')`),
    check('box_office_order_lines_ticket', sql`${t.kind} <> 'ticket' OR (${t.performanceId} IS NOT NULL AND ${t.bandId} IS NOT NULL AND ${t.ticketTypeId} IS NOT NULL AND ${t.claimId} IS NOT NULL)`),
    check('box_office_order_lines_list', sql`${t.listMinor} >= 0`),
    check('box_office_order_lines_discount', sql`${t.discountMinor} >= 0 AND ${t.discountMinor} <= ${t.listMinor}`),
    check('box_office_order_lines_amount', sql`${t.amountMinor} = ${t.listMinor} - ${t.discountMinor}`),
    check('box_office_order_lines_one_discount', sql`${t.promoRedemptionId} IS NULL OR ${t.passRedemptionId} IS NULL`),
    check('box_office_order_lines_state', sql`${t.state} IN ('live', 'cancelled', 'exchanged')`),
  ],
})

/** Issued when the order is confirmed. One per ticket line. The code itself is never stored. */
export const tickets = defineTable('box_office_tickets', {
  id: col.id(),
  orderLineId: col.ref('box_office_order_lines'),
  // Copied, so the door reads one table.
  performanceId: col.internal(text('performance_id').notNull()),
  codeHash: col.internal(text('code_hash').notNull()),
  // The kit signing key that signed the door code, under the purpose box-office.door-code.
  keyId: col.internal(text('key_id').notNull()),
  state: col.internal(text('state', { enum: ['valid', 'void'] }).notNull().default('valid')),
  voidReason: col.internal(text('void_reason', { enum: ['cancelled', 'exchanged', 'reissued', 'performance_cancelled'] })),
  attendeeName: col.personal(text('attendee_name'), { erase: 'clear' }),
  admittedAt: col.timestamp('admitted_at'),
  // The scan that admitted it, stamped by the same update as admitted_at: how a scan knows it was the one.
  admittedScanId: col.internal(text('admitted_scan_id')),
  requirementRef: col.internal(text('requirement_ref')),
  requirementAccountId: col.account('requirement_account_id', { role: 'actor', nullable: true }),
  requirementEvidenceId: col.internal(text('requirement_evidence_id')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'tkt',
  realm: 'audience',
  subject: { via: 'order_line_id' },
  extra: t => [
    uniqueIndex('box_office_tickets_code').on(t.codeHash),
    index('box_office_tickets_line').on(t.orderLineId),
    // A line has one valid ticket; a reissue voids the old one and writes another.
    uniqueIndex('box_office_tickets_one_valid').on(t.orderLineId).where(sql`state = 'valid'`),
    index('box_office_tickets_performance').on(t.performanceId, t.state),
    check('box_office_tickets_state', sql`${t.state} IN ('valid', 'void')`),
    check('box_office_tickets_void', sql`(${t.state} = 'void') = (${t.voidReason} IS NOT NULL)`),
    check('box_office_tickets_reason', sql`${t.voidReason} IS NULL OR ${t.voidReason} IN ('cancelled', 'exchanged', 'reissued', 'performance_cancelled')`),
    check('box_office_tickets_requirement', sql`${t.requirementRef} IS NULL OR ${t.requirementAccountId} IS NOT NULL OR ${t.requirementEvidenceId} IS NOT NULL`),
  ],
})

/** Every scan, including refusals and scans made offline. The id is made on the device. */
export const scans = defineTable('box_office_scans', {
  id: col.id(),
  // Null when the code was unknown.
  ticketId: col.ref('box_office_tickets', { nullable: true }),
  // The performance the scanner was set to.
  performanceId: col.internal(text('performance_id').notNull()),
  result: col.internal(text('result', { enum: ['admitted', 'admitted_by_override', 'already_admitted', 'void', 'wrong_performance', 'requirement_not_met', 'unknown', 'bad_signature', 'reversed'] }).notNull()),
  reasonTermId: col.ref('core_terms', { nullable: true }),
  // Admitted without the requirement check being made (source unavailable, or offline).
  unchecked: col.internal(integer('unchecked', { mode: 'boolean' }).notNull().default(false)),
  scannedBy: col.account('scanned_by', { role: 'actor' }),
  deviceLabel: col.internal(text('device_label')),
  // The device's clock, and the server's: they differ for offline scans.
  scannedAt: col.timestamp('scanned_at').notNull(),
  receivedAt: col.timestamp('received_at').notNull(),
  offline: col.internal(integer('offline', { mode: 'boolean' }).notNull().default(false)),
}, {
  id: 'scan',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('box_office_scans_ticket').on(t.ticketId).where(sql`ticket_id IS NOT NULL`),
    index('box_office_scans_performance').on(t.performanceId, t.receivedAt),
    check('box_office_scans_result', sql`${t.result} IN ('admitted', 'admitted_by_override', 'already_admitted', 'void', 'wrong_performance', 'requirement_not_met', 'unknown', 'bad_signature', 'reversed')`),
    check('box_office_scans_reason', sql`${t.result} NOT IN ('reversed', 'admitted_by_override') OR ${t.reasonTermId} IS NOT NULL`),
  ],
})

/** One row each time lines of an order are cancelled or exchanged. */
export const cancellations = defineTable('box_office_cancellations', {
  id: col.id(),
  orderId: col.ref('box_office_orders'),
  kind: col.internal(text('kind', { enum: ['customer', 'staff', 'performance_cancelled', 'exchange', 'unfulfilled_payment'] }).notNull()),
  reasonTermId: col.ref('core_terms', { nullable: true }),
  // The one column of this table that erasure blanks.
  note: col.freeText(text('note')),
  // A JSON array of order line ids.
  lineIds: col.internal(text('line_ids').notNull()),
  refundId: col.ref('payments_refunds', { nullable: true }),
  feeMinor: col.minor('fee_minor').notNull().default(0),
  // Null when the customer did it from the email link without signing in.
  by: col.account('by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'can',
  realm: 'audience',
  subject: { via: 'order_id' },
  appendOnly: true,
  extra: t => [
    index('box_office_cancellations_order').on(t.orderId),
    check('box_office_cancellations_kind', sql`${t.kind} IN ('customer', 'staff', 'performance_cancelled', 'exchange', 'unfulfilled_payment')`),
    check('box_office_cancellations_note', sql`${t.note} IS NULL OR length(${t.note}) <= 200`),
    check('box_office_cancellations_fee', sql`${t.feeMinor} >= 0`),
  ],
})

/**
 * A request for complimentary tickets (part 2; BO-62, BO-63): how many, in which band, for whom and
 * why. Approving issues them at once, as a confirmed order of zero-price tickets on a complimentary
 * ticket type, so they scan and count like any other ticket. Nobody decides their own request.
 */
export const compRequests = defineTable('box_office_comp_requests', {
  id: col.id(),
  performanceId: col.internal(text('performance_id').notNull()),
  bandId: col.ref('box_office_bands'),
  quantity: col.internal(integer('quantity').notNull()),
  // Who the tickets are for: when the requester names someone new, an unclaimed account made for them.
  forAccountId: col.account('for_account_id', { role: 'subject' }),
  reasonTermId: col.ref('core_terms'),
  requestedBy: col.account('requested_by', { role: 'actor' }),
  state: col.internal(text('state', { enum: ['requested', 'approved', 'declined', 'issued', 'withdrawn'] }).notNull().default('requested')),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  orderId: col.ref('box_office_orders', { nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'comp',
  realm: 'audience',
  subject: 'for_account_id',
  onErasure: 'keep-row',
  extra: t => [
    index('box_office_comp_requests_performance').on(t.performanceId, t.state),
    index('box_office_comp_requests_state').on(t.state, t.createdAt),
    check('box_office_comp_requests_quantity', sql`${t.quantity} > 0`),
    check('box_office_comp_requests_state', sql`${t.state} IN ('requested', 'approved', 'declined', 'issued', 'withdrawn')`),
    check('box_office_comp_requests_not_own', sql`${t.decidedBy} IS NULL OR ${t.decidedBy} <> ${t.requestedBy}`),
  ],
})

/**
 * An exchange to dearer tickets waiting for the difference (BO-54; part 4, "Cancelling and
 * exchanging"). The new seats are held under the order while the till takes the payment; when it
 * settles, the exchange is made in Payments' batch. A payment that ends without the money lets the
 * held seats go and leaves the booking as it was. The row stays as the record of the payment's owner.
 */
export const exchanges = defineTable('box_office_exchanges', {
  id: col.id(),
  orderId: col.ref('box_office_orders'),
  // A JSON array of the order line ids being exchanged.
  lineIds: col.internal(text('line_ids').notNull()),
  performanceId: col.internal(text('performance_id').notNull()),
  bandId: col.ref('box_office_bands'),
  ticketTypeId: col.ref('box_office_ticket_types'),
  // The price of each new ticket, and what is to pay on top of the old ones.
  priceMinor: col.minor('price_minor').notNull(),
  // A JSON array of each line's new seats, ticket type and price ({ lineId, bandId, ticketTypeId,
  // priceId, priceMinor }); band, ticket type and price above are then the first line's. Null on an exchange
  // made before lines could differ, which gives every line those three.
  moves: col.internal(text('moves')),
  differenceMinor: col.minor('difference_minor').notNull(),
  holdId: col.ref('box_office_holds'),
  intentId: col.ref('payments_intents', { nullable: true }),
  state: col.internal(text('state', { enum: ['awaiting_payment', 'completed', 'released'] }).notNull().default('awaiting_payment')),
  cancellationId: col.ref('box_office_cancellations', { nullable: true }),
  by: col.account('by', { role: 'actor' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'exch',
  realm: 'audience',
  subject: { via: 'order_id' },
  extra: t => [
    index('box_office_exchanges_order').on(t.orderId),
    index('box_office_exchanges_intent').on(t.intentId).where(sql`intent_id IS NOT NULL`),
    check('box_office_exchanges_state', sql`${t.state} IN ('awaiting_payment', 'completed', 'released')`),
    check('box_office_exchanges_difference', sql`${t.differenceMinor} > 0 AND ${t.priceMinor} > 0`),
  ],
})

export const tables = { performanceSales, bands, ticketTypes, prices, pools, orders, holds, claims, orderLines, tickets, scans, cancellations, compRequests, exchanges }
