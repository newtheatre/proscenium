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

export const tables = { priceLists, categories, products, variants, prices, outlets }
