// The bar (Bar specification, tab 2): the catalogue and its prices. A product has one or more
// variants, each sold at a price from a price list; Standard always exists. A price is never edited:
// a new row replaces it from its moment, so a bar sale keeps the price it was rung up at. An outlet is
// a place that sells, with its default list. None of these tables names a customer.
import { check, index, integer, primaryKey, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const OUTLET_KINDS = ['bar', 'kiosk', 'desk'] as const
// How an outlet's till shows its categories: a row of chips, folders to open, or a list down the side.
export const TILL_LAYOUTS = ['chips', 'folders', 'rail'] as const

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
  // The category this one sits under. One level only: a parent never has a parent itself.
  parentId: col.ref('bar_categories', { nullable: true }),
  // Products in it need the age check unless a product says otherwise (Wine, Beer, Spirits: yes).
  ageRestricted: col.internal(integer('age_restricted', { mode: 'boolean' }).notNull().default(false)),
  // The preset Add a product opens on for this category: a built-in key such as 'builtin:wine', or a
  // bar_product_presets id. Not a reference, because built-ins live in code.
  usualPreset: col.internal(text('usual_preset')),
  // A Finance account of the bar's own; null posts to bar.income.
  incomeAccountId: col.internal(text('income_account_id')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bcat',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_categories_name').on(sql`lower(${t.name})`), index('bar_categories_parent').on(t.parentId)],
})

/** A thing a customer asks for by name. Retired, never deleted, once it has been sold. */
export const products = defineTable('bar_products', {
  id: col.id(),
  categoryId: col.ref('bar_categories'),
  name: col.public(text('name').notNull()),
  // Selling it asks the age check. Ignored while ageFromCategory is set, when the category's answer applies.
  ageRestricted: col.internal(integer('age_restricted', { mode: 'boolean' }).notNull().default(false)),
  ageFromCategory: col.internal(integer('age_from_category', { mode: 'boolean' }).notNull().default(false)),
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
  // The measure a product gives when it is picked as a mixer ("Can be used as a mixer"). Hidden from
  // the till's grid; the Mixer choice offers exactly these.
  mixerMeasure: col.internal(integer('mixer_measure', { mode: 'boolean' }).notNull().default(false)),
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
    uniqueIndex('bar_variants_one_mixer').on(t.productId).where(sql`mixer_measure = 1`),
  ],
})

export const CHOICE_SOURCES = ['options', 'mixers'] as const
export const MIXER_PRICING = ['included', 'fixed', 'own_price'] as const

/**
 * A choice made on a product at the till, set up once and attached to any number of products: Spirit,
 * Mixer, Milk. Its options are listed by hand, or (source mixers) are every active product that can be
 * used as a mixer, each by its mixer measure, priced by the group's rule.
 */
export const choiceGroups = defineTable('bar_choice_groups', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  source: col.internal(text('source', { enum: CHOICE_SOURCES }).notNull()),
  required: col.internal(integer('required', { mode: 'boolean' }).notNull().default(true)),
  maxPicks: col.internal(integer('max_picks').notNull().default(1)),
  // The usual pick, already chosen at the till: an option id, or a mixer measure's variant id.
  defaultKey: col.internal(text('default_key')),
  mixerPricing: col.internal(text('mixer_pricing', { enum: MIXER_PRICING })),
  mixerFixedMinor: col.minor('mixer_fixed_minor'),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bchg',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_choice_groups_name').on(sql`lower(${t.name})`),
    check('bar_choice_groups_source', sql`${t.source} IN (${inList(CHOICE_SOURCES)})`),
    check('bar_choice_groups_picks', sql`${t.maxPicks} >= 1`),
    check('bar_choice_groups_mixers', sql`(${t.source} = 'mixers') = (${t.mixerPricing} IS NOT NULL)`),
    check('bar_choice_groups_fixed', sql`(${t.mixerPricing} IS 'fixed') = (${t.mixerFixedMinor} IS NOT NULL) AND (${t.mixerFixedMinor} IS NULL OR ${t.mixerFixedMinor} >= 0)`),
  ],
})

/** One option of a group listed by hand, with what it adds to the price. */
export const choiceOptions = defineTable('bar_choice_options', {
  id: col.id(),
  groupId: col.ref('bar_choice_groups'),
  name: col.public(text('name').notNull()),
  deltaMinor: col.minor('delta_minor').notNull().default(0),
  // Picking it makes the line need the age check (a whisky shot in a hot chocolate).
  ageRestricted: col.internal(integer('age_restricted', { mode: 'boolean' }).notNull().default(false)),
  // What a recipe's slot for this group takes when this option is picked; none for "No mixer".
  stockItemId: col.ref('bar_stock_items', { nullable: true }),
  position: col.internal(integer('position').notNull()),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bcho',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_choice_options_name').on(t.groupId, sql`lower(${t.name})`),
    check('bar_choice_options_delta', sql`${t.deltaMinor} >= 0`),
  ],
})

/**
 * The theatre's own product preset, saved from Add a product: what a kind of product usually has, never
 * its name, prices or stock. `sizes` is JSON, [{ "name": "Pint", "measure": "568 ml" }, ...];
 * `group_ids` is JSON, the choices it attaches in order. Built-in presets live in code.
 */
export const productPresets = defineTable('bar_product_presets', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  sizes: col.internal(text('sizes').notNull()),
  groupIds: col.internal(text('group_ids').notNull()),
  // null: as the category.
  ageRestricted: col.internal(integer('age_restricted', { mode: 'boolean' })),
  mixer: col.internal(integer('mixer', { mode: 'boolean' }).notNull().default(false)),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bpps',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_product_presets_name').on(sql`lower(${t.name})`).where(sql`active = 1`)],
})

/** A group attached to a product, in the order the till asks them. */
export const productChoiceGroups = defineTable('bar_product_choice_groups', {
  id: col.id(),
  productId: col.ref('bar_products'),
  groupId: col.ref('bar_choice_groups'),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
}, {
  id: 'bpcg',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_product_choice_groups_pair').on(t.productId, t.groupId)],
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
  // Where its sales take stock from. Null: its sales move no stock.
  stockLocationId: col.ref('bar_stock_locations', { nullable: true }),
  // Checked by the input, not a CHECK, so adding it does not rebuild a table sales point at.
  tillLayout: col.internal(text('till_layout', { enum: TILL_LAYOUTS }).notNull().default('chips')),
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

/** A size pinned to the front of an outlet's till, in order. */
export const outletFavourites = defineTable('bar_outlet_favourites', {
  id: col.id(),
  outletId: col.ref('bar_outlets'),
  variantId: col.ref('bar_variants'),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
}, {
  id: 'bofv',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_outlet_favourites_pair').on(t.outletId, t.variantId)],
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

/**
 * What was picked on a sale line: a hand-listed option, or the mixer measure of another product, with
 * the label and the amount it added fixed when the line was written. Goes with its line.
 */
export const saleLineChoices = defineTable('bar_sale_line_choices', {
  id: col.id(),
  saleLineId: col.ref('bar_sale_lines'),
  groupId: col.ref('bar_choice_groups'),
  optionId: col.ref('bar_choice_options', { nullable: true }),
  mixerVariantId: col.ref('bar_variants', { nullable: true }),
  label: col.internal(text('label').notNull()),
  deltaMinor: col.minor('delta_minor').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'bslc',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('bar_sale_line_choices_line').on(t.saleLineId),
    check('bar_sale_line_choices_one', sql`(${t.optionId} IS NULL) <> (${t.mixerVariantId} IS NULL)`),
    check('bar_sale_line_choices_delta', sql`${t.deltaMinor} >= 0`),
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
export const ID_TYPES = ['passport', 'driving_licence', 'pass_card', 'other_photo'] as const
export const REFUSAL_SCOPES = ['restricted', 'all'] as const
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
  // Which ID was shown, when the outcome is id_checked and the seller said.
  idType: col.internal(text('id_type', { enum: ID_TYPES })),
  // For a refusal with a basket: whether only the restricted drinks or the whole sale was refused.
  refusalScope: col.internal(text('refusal_scope', { enum: REFUSAL_SCOPES })),
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

// The 14 allergens UK food law names, by key; their names are translations (bar.allergen.<key>).
export const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const
export const ALLERGEN_LEVELS = ['contains', 'may_contain'] as const
export const ALLERGEN_SOURCES = ['label', 'supplier', 'other'] as const

/**
 * What a product, or a choice option, contains or may contain, as last recorded from its label. One
 * row per allergen named; an allergen with no row is not listed. Whether anything was checked at all is
 * bar_allergen_checks', so "nothing listed" and "not checked" never look the same. With stock, entries
 * move to stock items and products work theirs out; a product with no recipe keeps its own.
 */
export const allergenEntries = defineTable('bar_allergen_entries', {
  id: col.id(),
  productId: col.ref('bar_products', { nullable: true }),
  optionId: col.ref('bar_choice_options', { nullable: true }),
  allergen: col.public(text('allergen', { enum: ALLERGENS }).notNull()),
  level: col.public(text('level', { enum: ALLERGEN_LEVELS }).notNull()),
  createdAt: col.createdAt(),
}, {
  id: 'bale',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_allergen_entries_product').on(t.productId, t.allergen).where(sql`product_id IS NOT NULL`),
    uniqueIndex('bar_allergen_entries_option').on(t.optionId, t.allergen).where(sql`option_id IS NOT NULL`),
    check('bar_allergen_entries_one', sql`(${t.productId} IS NULL) <> (${t.optionId} IS NULL)`),
    check('bar_allergen_entries_allergen', sql`${t.allergen} IN (${inList(ALLERGENS)})`),
    check('bar_allergen_entries_level', sql`${t.level} IN (${inList(ALLERGEN_LEVELS)})`),
  ],
})

/** Each time someone checked a product's or option's allergens against its label: who, when, from what, and what they recorded. */
export const allergenChecks = defineTable('bar_allergen_checks', {
  id: col.id(),
  productId: col.ref('bar_products', { nullable: true }),
  optionId: col.ref('bar_choice_options', { nullable: true }),
  source: col.internal(text('source', { enum: ALLERGEN_SOURCES }).notNull()),
  // What was recorded, as allergen keys joined by commas, so the history reads without the entries.
  contains: col.internal(text('contains').notNull()),
  mayContain: col.internal(text('may_contain').notNull()),
  by: col.account('by', { role: 'actor', onMerge: 'alias' }),
  at: col.timestamp('at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'balc',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    index('bar_allergen_checks_product').on(t.productId, t.at),
    index('bar_allergen_checks_option').on(t.optionId, t.at),
    check('bar_allergen_checks_one', sql`(${t.productId} IS NULL) <> (${t.optionId} IS NULL)`),
    check('bar_allergen_checks_source', sql`${t.source} IN (${inList(ALLERGEN_SOURCES)})`),
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

export const BASE_UNITS = ['each', 'ml', 'g'] as const
export const MOVEMENT_KINDS = ['opening', 'delivery', 'sale', 'sale_reversal', 'wastage', 'adjustment', 'transfer_out', 'transfer_in'] as const

/**
 * A thing that is counted (Bar specification, tab 2, "Stock"): a keg, a case of cans, a bottle of
 * gin. Quantities are whole base units (each, ml or g). A pack is how it is delivered, a count unit is
 * how people count it; weights, when set, let a stocktake weigh a keg or an open bottle.
 */
export const stockItems = defineTable('bar_stock_items', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  categoryId: col.ref('bar_categories', { nullable: true }),
  baseUnit: col.internal(text('base_unit', { enum: BASE_UNITS }).notNull()),
  packSize: col.internal(integer('pack_size').notNull()),
  packName: col.internal(text('pack_name').notNull()),
  countUnitSize: col.internal(integer('count_unit_size').notNull()),
  costMinor: col.minor('cost_minor'),
  currency: col.currency('currency').notNull(),
  reorderLevel: col.internal(integer('reorder_level')),
  fullWeightG: col.internal(integer('full_weight_g')),
  emptyWeightG: col.internal(integer('empty_weight_g')),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bsti',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_stock_items_name').on(sql`lower(${t.name})`),
    check('bar_stock_items_unit', sql`${t.baseUnit} IN (${inList(BASE_UNITS)})`),
    check('bar_stock_items_sizes', sql`${t.packSize} >= 1 AND ${t.countUnitSize} >= 1`),
    check('bar_stock_items_cost', sql`${t.costMinor} IS NULL OR ${t.costMinor} >= 0`),
    check('bar_stock_items_reorder', sql`${t.reorderLevel} IS NULL OR ${t.reorderLevel} >= 0`),
    check('bar_stock_items_weights', sql`(${t.fullWeightG} IS NULL) = (${t.emptyWeightG} IS NULL) AND (${t.fullWeightG} IS NULL OR ${t.fullWeightG} > ${t.emptyWeightG} AND ${t.emptyWeightG} >= 0)`),
  ],
})

/**
 * Where stock is kept: a bar, a cellar, a store cupboard. It may sit in a space or, more loosely, at a
 * venue, so several tills in different spaces can each take from their own, and stock is seen by venue.
 */
export const stockLocations = defineTable('bar_stock_locations', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  spaceId: col.ref('core_spaces', { nullable: true }),
  venueId: col.ref('core_venues', { nullable: true }),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'bstl',
  realm: 'operational',
  subject: 'none',
  extra: t => [uniqueIndex('bar_stock_locations_name').on(sql`lower(${t.name})`).where(sql`active = 1`)],
})

/**
 * What selling one of a size uses up (tab 10). A line is a fixed item ("175 ml of house red") or a
 * choice slot ("25 ml of the Spirit choice"), where the option picked supplies the item. For a mixers
 * group the quantity is servings: the mixer's own recipe is used that many times. A size with no lines
 * moves no stock.
 */
export const recipeLines = defineTable('bar_recipe_lines', {
  id: col.id(),
  variantId: col.ref('bar_variants'),
  stockItemId: col.ref('bar_stock_items', { nullable: true }),
  choiceGroupId: col.ref('bar_choice_groups', { nullable: true }),
  quantity: col.internal(integer('quantity').notNull()),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'brcl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('bar_recipe_lines_item').on(t.variantId, t.stockItemId).where(sql`stock_item_id IS NOT NULL`),
    uniqueIndex('bar_recipe_lines_group').on(t.variantId, t.choiceGroupId).where(sql`choice_group_id IS NOT NULL`),
    check('bar_recipe_lines_one', sql`(${t.stockItemId} IS NULL) <> (${t.choiceGroupId} IS NULL)`),
    check('bar_recipe_lines_quantity', sql`${t.quantity} >= 1`),
  ],
})

/**
 * Every change to a level, never edited. Its key is built from what caused it (a sale line and recipe
 * line, a reversal and the movement it undoes), so a replayed batch moves stock once.
 */
export const stockMovements = defineTable('bar_stock_movements', {
  id: col.id(),
  stockItemId: col.ref('bar_stock_items'),
  locationId: col.ref('bar_stock_locations'),
  kind: col.internal(text('kind', { enum: MOVEMENT_KINDS }).notNull()),
  quantity: col.internal(integer('quantity').notNull()),
  reasonTerm: col.ref('core_terms', { nullable: true }),
  sourceType: col.internal(text('source_type').notNull()),
  sourceId: col.internal(text('source_id').notNull()),
  idempotencyKey: col.internal(text('idempotency_key').notNull()),
  by: col.account('by', { role: 'actor', onMerge: 'alias', nullable: true }),
  at: col.timestamp('at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'bstm',
  realm: 'operational',
  subject: 'none',
  appendOnly: true,
  extra: t => [
    uniqueIndex('bar_stock_movements_key').on(t.idempotencyKey),
    index('bar_stock_movements_level').on(t.stockItemId, t.locationId, t.at),
    index('bar_stock_movements_source').on(t.sourceType, t.sourceId),
    check('bar_stock_movements_kind', sql`${t.kind} IN (${inList(MOVEMENT_KINDS)})`),
    check('bar_stock_movements_sign', sql`${t.quantity} <> 0 AND (${t.kind} IN ('opening', 'adjustment') OR (${t.kind} IN ('delivery', 'transfer_in', 'sale_reversal')) = (${t.quantity} > 0))`),
    check('bar_stock_movements_wastage', sql`${t.kind} <> 'wastage' OR ${t.reasonTerm} IS NOT NULL`),
  ],
})

/** How much of an item a location holds: a cache of its movements, kept only by a trigger. May go below nought. */
export const stockLevels = defineTable('bar_stock_levels', {
  stockItemId: col.ref('bar_stock_items'),
  locationId: col.ref('bar_stock_locations'),
  quantity: col.internal(integer('quantity').notNull().default(0)),
  lastCountedAt: col.timestamp('last_counted_at'),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [primaryKey({ columns: [t.stockItemId, t.locationId] })],
})

export const tables = { priceLists, categories, products, variants, choiceGroups, choiceOptions, productChoiceGroups, productPresets, prices, outlets, outletFavourites, openings, sales, saleLines, saleLineChoices, saleReversals, ageChecks, registerReviews, allergenEntries, allergenChecks, stockItems, stockLocations, recipeLines, stockMovements, stockLevels }
