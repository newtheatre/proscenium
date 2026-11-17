// The bar (Bar specification, tab 2): the catalogue and its prices. A product has one or more
// variants, each sold at a price from a price list; Standard always exists. A price is never edited:
// a new row replaces it from its moment, so a bar sale keeps the price it was rung up at. An outlet is
// a place that sells, with its default list. None of these tables names a customer.
import { check, index, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const OUTLET_KINDS = ['bar', 'kiosk', 'desk'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** A named set of prices. Standard is made with the module and never removed. */
export const priceLists = defineTable('bar_price_lists', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  systemKey: col.internal(text('system_key')),
  // Choosing a restricted list at the till needs bar.sale.use-restricted-price-list.
  restricted: col.internal(integer('restricted', { mode: 'boolean' }).notNull().default(false)),
  // A variant with no price on this list uses Standard's.
  fallsBack: col.internal(integer('falls_back', { mode: 'boolean' }).notNull().default(true)),
  // Set: the list has no prices of its own, and each is Standard's less this percentage.
  percentOff: col.internal(integer('percent_off')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bpls',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_price_lists_name').on(sql`lower(${t.name})`),
    uniqueIndex('bar_price_lists_system_key').on(t.systemKey).where(sql`system_key IS NOT NULL`),
    check('bar_price_lists_percent', sql`${t.percentOff} IS NULL OR (${t.percentOff} BETWEEN 1 AND 100)`),
    check('bar_price_lists_standard', sql`${t.systemKey} IS NULL OR (${t.percentOff} IS NULL AND ${t.active} = 1)`),
  ],
})

/** A group of products, for the till's grid and for reports. */
export const categories = defineTable('bar_categories', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  position: col.internal(integer('position').notNull()),
  // A named colour token, always shown beside the name.
  colour: col.internal(text('colour')),
  // A Finance account of the bar's own; null posts to bar.income.
  incomeAccountId: col.internal(text('income_account_id')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bcat',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_categories_name').on(sql`lower(${t.name})`)],
})

/** A thing a customer asks for by name. Retired, never deleted, once it has been sold. */
export const products = defineTable('bar_products', {
  id: col.id(),
  categoryId: col.ref('bar_categories'),
  name: col.public(text('name').notNull()),
  // Selling it asks the age check.
  ageRestricted: col.internal(integer('age_restricted', { mode: 'boolean' }).notNull().default(false)),
  position: col.internal(integer('position').notNull()),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bprd',
  realm: 'operational',
  subject: 'none',
  extra: t => [index('bar_products_category').on(t.categoryId, t.position)],
})

/** One sellable size of a product. A one-size product has one, named "Each", hidden on the till. */
export const variants = defineTable('bar_variants', {
  id: col.id(),
  productId: col.ref('bar_products'),
  name: col.public(text('name').notNull()),
  barcode: col.internal(text('barcode')),
  position: col.internal(integer('position').notNull()),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bvar',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_variants_name').on(t.productId, sql`lower(${t.name})`),
    uniqueIndex('bar_variants_barcode').on(t.barcode).where(sql`barcode IS NOT NULL`),
  ],
})

/**
 * A variant's price on a list from a moment. The newest row in force wins; a null amount withdraws
 * the price, so the variant follows Standard again where the list falls back.
 */
export const prices = defineTable('bar_prices', {
  id: col.id(),
  variantId: col.ref('bar_variants'),
  priceListId: col.ref('bar_price_lists'),
  amountMinor: col.minor('amount_minor'),
  currency: col.currency('currency').notNull(),
  effectiveFrom: col.timestamp('effective_from').notNull(),
  setBy: col.account('set_by', { role: 'actor', onMerge: 'alias' }),
  createdAt: col.createdAt(),
}, {
  id: 'bprc',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('bar_prices_in_force').on(t.variantId, t.priceListId, t.effectiveFrom),
    check('bar_prices_amount', sql`${t.amountMinor} IS NULL OR ${t.amountMinor} >= 0`),
  ],
})

/** A place that sells. One desk outlet at most: the one the till's bar panel sells from at the box office. */
export const outlets = defineTable('bar_outlets', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  kind: col.internal(text('kind', { enum: OUTLET_KINDS }).notNull()),
  priceListId: col.ref('bar_price_lists'),
  spaceId: col.ref('core_spaces', { nullable: true }),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bout',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_outlets_name').on(sql`lower(${t.name})`).where(sql`active = 1`),
    uniqueIndex('bar_outlets_one_desk').on(t.kind).where(sql`kind = 'desk' AND active = 1`),
    check('bar_outlets_kind', sql`${t.kind} IN (${inList(OUTLET_KINDS)})`),
  ],
})

export const OPENING_STATES = ['open', 'closed'] as const
export const SALE_STATES = ['open', 'awaiting_payment', 'paid', 'void'] as const
export const CHANNELS = ['till', 'desk', 'self'] as const

/** One period of trading at one outlet. An outlet has one open opening; closed is final. */
export const openings = defineTable('bar_openings', {
  id: col.id(),
  outletId: col.ref('bar_outlets'),
  performanceId: col.ref('core_performances', { nullable: true }),
  operatingDay: col.localDate('operating_day').notNull(),
  state: col.internal(text('state', { enum: OPENING_STATES }).notNull()),
  openedBy: col.account('opened_by', { role: 'actor', onMerge: 'alias' }),
  closedBy: col.account('closed_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  openedAt: col.timestamp('opened_at').notNull(),
  closedAt: col.timestamp('closed_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bopn',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_openings_one_open').on(t.outletId).where(sql`state = 'open'`),
    index('bar_openings_day').on(t.operatingDay),
    check('bar_openings_state', sql`${t.state} IN (${inList(OPENING_STATES)})`),
  ],
})

/**
 * One customer's basket and its payment. Anonymous: no account, no name. Its total is kept by a
 * trigger from its lines; paid and void are final; it leaves open only with a line.
 */
export const sales = defineTable('bar_sales', {
  id: col.id(),
  reference: col.internal(text('reference').notNull()),
  openingId: col.ref('bar_openings'),
  priceListId: col.ref('bar_price_lists'),
  state: col.internal(text('state', { enum: SALE_STATES }).notNull()),
  totalMinor: col.minor('total_minor').notNull().default(0),
  currency: col.currency('currency').notNull(),
  intentId: col.internal(text('intent_id')),
  partId: col.internal(text('part_id')),
  channel: col.internal(text('channel', { enum: CHANNELS }).notNull()),
  soldBy: col.account('sold_by', { role: 'actor', onMerge: 'alias' }),
  // Made on the device, so a repeated request makes one sale.
  clientKey: col.internal(text('client_key').notNull()),
  paidAt: col.timestamp('paid_at'),
  voidedAt: col.timestamp('voided_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bsal',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_sales_reference').on(t.reference),
    uniqueIndex('bar_sales_client_key').on(t.clientKey),
    index('bar_sales_opening').on(t.openingId, t.state),
    index('bar_sales_intent').on(t.intentId),
    check('bar_sales_state', sql`${t.state} IN (${inList(SALE_STATES)})`),
    check('bar_sales_channel', sql`${t.channel} IN (${inList(CHANNELS)})`),
    check('bar_sales_total', sql`${t.totalMinor} >= 0`),
    check('bar_sales_paid', sql`${t.state} <> 'paid' OR ${t.paidAt} IS NOT NULL`),
  ],
})

/** One size, a quantity and the price fixed when the line was written. Changed only while its sale is open. */
export const saleLines = defineTable('bar_sale_lines', {
  id: col.id(),
  saleId: col.ref('bar_sales'),
  variantId: col.ref('bar_variants'),
  priceId: col.ref('bar_prices'),
  quantity: col.internal(integer('quantity').notNull()),
  unitMinor: col.minor('unit_minor').notNull(),
  discountMinor: col.minor('discount_minor').notNull().default(0),
  amountMinor: col.minor('amount_minor').notNull(),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bsln',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('bar_sale_lines_sale').on(t.saleId),
    check('bar_sale_lines_quantity', sql`${t.quantity} >= 1`),
    check('bar_sale_lines_unit', sql`${t.unitMinor} >= 0`),
    check('bar_sale_lines_discount', sql`${t.discountMinor} >= 0 AND ${t.discountMinor} <= ${t.unitMinor} * ${t.quantity}`),
    check('bar_sale_lines_amount', sql`${t.amountMinor} = ${t.unitMinor} * ${t.quantity} - ${t.discountMinor}`),
  ],
})

export const REVERSAL_STATES = ['requested', 'succeeded', 'failed'] as const
export const STOCK_OUTCOMES = ['returned', 'wasted', 'none'] as const

/**
 * A paid line, or part of it, refunded or being refunded. Written when the refund is asked for, so it
 * holds the quantity and amount against the line; it follows the Payments refund to succeeded or
 * failed, and only succeeded moves income. Triggers cap what is held at what was sold.
 */
export const saleReversals = defineTable('bar_sale_reversals', {
  id: col.id(),
  saleLineId: col.ref('bar_sale_lines'),
  refundId: col.internal(text('refund_id').notNull()),
  state: col.internal(text('state', { enum: REVERSAL_STATES }).notNull()),
  quantity: col.internal(integer('quantity').notNull()),
  amountMinor: col.minor('amount_minor').notNull(),
  reasonTerm: col.ref('core_terms'),
  stockOutcome: col.internal(text('stock_outcome', { enum: STOCK_OUTCOMES }).notNull()),
  requestedBy: col.account('requested_by', { role: 'actor', onMerge: 'alias' }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bsrv',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('bar_sale_reversals_line').on(t.saleLineId, t.state),
    index('bar_sale_reversals_refund').on(t.refundId),
    check('bar_sale_reversals_state', sql`${t.state} IN (${inList(REVERSAL_STATES)})`),
    check('bar_sale_reversals_stock', sql`${t.stockOutcome} IN (${inList(STOCK_OUTCOMES)})`),
    check('bar_sale_reversals_quantity', sql`${t.quantity} >= 0`),
    check('bar_sale_reversals_amount', sql`${t.amountMinor} > 0`),
  ],
})

export const AGE_CHECK_OUTCOMES = ['not_needed', 'id_checked', 'self_attested', 'refused'] as const
export const DESCRIPTION_MAX = 120 // not-policy: the register's description field, fixed by the specification

/**
 * The refusals register: each time staff were prompted on a restricted sale, and every refusal. It
 * records what staff did, never who the customer was. Append-only, except that the description of a
 * person refused may be erased.
 */
export const ageChecks = defineTable('bar_age_checks', {
  id: col.id(),
  openingId: col.ref('bar_openings'),
  saleId: col.ref('bar_sales', { nullable: true }),
  outcome: col.internal(text('outcome', { enum: AGE_CHECK_OUTCOMES }).notNull()),
  refusalTerm: col.ref('core_terms', { nullable: true }),
  variantId: col.ref('bar_variants', { nullable: true }),
  // A refusal made while a basket carried on: that basket's key, which its sale takes when payment
  // starts, so the register can show the sale the rest of the basket became.
  basketKey: col.internal(text('basket_key')),
  // What the person looked like, never who they are; only where the theatre has switched it on.
  description: col.freeText(text('description'), { erase: 'clear' }),
  by: col.account('by', { role: 'actor', onMerge: 'alias' }),
  at: col.timestamp('at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'bage',
  realm: 'operational',
  // No subject: no row reaches a person, and the one free-text column goes with the retention sweep.
  retention: 'bar.retention.age-checks',
  appendOnly: true,
  extra: t => [
    index('bar_age_checks_at').on(t.at),
    index('bar_age_checks_sale').on(t.saleId),
    index('bar_age_checks_basket').on(t.basketKey),
    check('bar_age_checks_outcome', sql`${t.outcome} IN (${inList(AGE_CHECK_OUTCOMES)})`),
    check('bar_age_checks_reason', sql`(${t.outcome} = 'refused') = (${t.refusalTerm} IS NOT NULL)`),
    check('bar_age_checks_description', sql`${t.description} IS NULL OR (${t.outcome} = 'refused' AND length(${t.description}) <= ${sql.raw(String(DESCRIPTION_MAX))})`),
  ],
})

/** A manager's signature on the register for a range of operating days, with the refusals it covered. */
export const registerReviews = defineTable('bar_register_reviews', {
  id: col.id(),
  outletId: col.ref('bar_outlets', { nullable: true }),
  fromDay: col.localDate('from_day').notNull(),
  toDay: col.localDate('to_day').notNull(),
  refusals: col.internal(integer('refusals').notNull()),
  reviewedBy: col.account('reviewed_by', { role: 'actor', onMerge: 'alias' }),
  reviewedAt: col.timestamp('reviewed_at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'brev',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('bar_register_reviews_at').on(t.reviewedAt),
    check('bar_register_reviews_days', sql`${t.toDay} >= ${t.fromDay}`),
    check('bar_register_reviews_refusals', sql`${t.refusals} >= 0`),
  ],
})

export const tables = { priceLists, categories, products, variants, prices, outlets, openings, sales, saleLines, saleReversals, ageChecks, registerReviews }
