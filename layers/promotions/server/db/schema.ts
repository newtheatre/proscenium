// Promotions: one system for every reduction from a price, whatever is being sold. A promotion says
// how it starts (on its own, by a code, or picked by staff at the till), who and when it is for,
// what it takes off, and which items it applies to. The items belong to the selling modules, which
// describe them through promotions.target; this module never learns what a ticket or a drink is.
// A promotion's uses are its live redemptions, counted by triggers and capped by a CHECK, so the
// last use is given once however many sales ask at the same moment.
import { check, index, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const TRIGGERS = ['automatic', 'code', 'staff'] as const
// Per item: a percentage, an amount, or a set price on each unit. Multi-buy: a group of `buy_quantity`
// units at a set price, or with its cheapest `free_quantity` free. Basket: an amount off the whole,
// shared across the items it applies to by price.
export const EFFECTS = ['percent_off', 'amount_off', 'set_price', 'multi_buy', 'basket_amount_off'] as const
export const CHANNELS = ['all', 'online', 'till'] as const
export const COUNT_BY = ['item', 'sale'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

export const promotions = defineTable('promotions_promotions', {
  id: col.id(),
  // What staff call it, and what a customer sees beside the saving.
  name: col.internal(text('name').notNull()),
  label: col.public(text('label').notNull()),
  trigger: col.internal(text('trigger', { enum: TRIGGERS }).notNull()),
  effect: col.internal(text('effect', { enum: EFFECTS }).notNull()),
  // Basis points for percent_off; minor units for the rest (multi_buy: the group's price, or 0 when
  // some of the group are free).
  value: col.internal(integer('value').notNull()),
  buyQuantity: col.internal(integer('buy_quantity')),
  freeQuantity: col.internal(integer('free_quantity')),
  channel: col.internal(text('channel', { enum: CHANNELS }).notNull().default('all')),
  validFrom: col.timestamp('valid_from'),
  validUntil: col.timestamp('valid_until'),
  // JSON: [{ days: [1..7], from: 'HH:MM', until: 'HH:MM' }] in the theatre's time zone, or null for any time.
  schedule: col.internal(text('schedule')),
  // JSON list of requirement references, any one of which is enough; null for anyone.
  requirementRefs: col.internal(text('requirement_refs')),
  minSpendMinor: col.minor('min_spend_minor'),
  maxUses: col.internal(integer('max_uses')),
  used: col.internal(integer('used').notNull().default(0)),
  countBy: col.internal(text('count_by', { enum: COUNT_BY }).notNull().default('item')),
  maxPerSale: col.internal(integer('max_per_sale')),
  maxPerPerson: col.internal(integer('max_per_person')),
  // Combines with other promotions marked the same on one item; otherwise the best one wins.
  combines: col.internal(integer('combines', { mode: 'boolean' }).notNull().default(false)),
  // Leaves alone items whose price is already reduced for who the buyer is (member, concession).
  notWithRequirements: col.internal(integer('not_with_requirements', { mode: 'boolean' }).notNull().default(false)),
  // A staff promotion: the ability a seller needs to pick it, beyond promotions.promotion.apply, and whether a reason is asked.
  staffAbility: col.internal(text('staff_ability')),
  needsReason: col.internal(integer('needs_reason', { mode: 'boolean' }).notNull().default(false)),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  note: col.internal(text('note')),
  createdBy: col.account('created_by', { role: 'actor', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'prom',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('promotions_promotions_live').on(t.active, t.trigger),
    check('promotions_promotions_trigger', sql`${t.trigger} IN (${inList(TRIGGERS)})`),
    check('promotions_promotions_effect', sql`${t.effect} IN (${inList(EFFECTS)})`),
    check('promotions_promotions_channel', sql`${t.channel} IN (${inList(CHANNELS)})`),
    check('promotions_promotions_count_by', sql`${t.countBy} IN (${inList(COUNT_BY)})`),
    check('promotions_promotions_value', sql`${t.value} >= 0 AND (${t.effect} <> 'percent_off' OR (${t.value} >= 1 AND ${t.value} <= 10000))`),
    check('promotions_promotions_multi_buy', sql`${t.effect} <> 'multi_buy' OR (${t.buyQuantity} >= 2 AND (${t.freeQuantity} IS NULL OR (${t.freeQuantity} >= 1 AND ${t.freeQuantity} < ${t.buyQuantity})))`),
    check('promotions_promotions_used', sql`${t.used} >= 0 AND (${t.maxUses} IS NULL OR ${t.used} <= ${t.maxUses})`),
  ],
})

/**
 * What a promotion applies to (`applies`), or what must also be in the sale for it to apply
 * (`requires`, with a quantity). `kind` is a promotions.target contribution's id; `scope` that
 * module's own JSON narrowing, which this module stores and never reads inside.
 */
export const targets = defineTable('promotions_targets', {
  id: col.id(),
  promotionId: col.ref('promotions_promotions'),
  role: col.internal(text('role', { enum: ['applies', 'requires'] }).notNull()),
  kind: col.internal(text('kind').notNull()),
  scope: col.internal(text('scope')),
  quantity: col.internal(integer('quantity').notNull().default(1)),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'prtg',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('promotions_targets_promotion').on(t.promotionId),
    check('promotions_targets_role', sql`${t.role} IN ('applies', 'requires')`),
    check('promotions_targets_quantity', sql`${t.quantity} >= 1`),
  ],
})

/** A code that starts a code promotion. Several codes may start one, each with its own limit. */
export const codes = defineTable('promotions_codes', {
  id: col.id(),
  promotionId: col.ref('promotions_promotions'),
  // Stored without spaces and upper-case; matched whatever the buyer's capitals.
  code: col.internal(text('code').notNull()),
  maxUses: col.internal(integer('max_uses')),
  used: col.internal(integer('used').notNull().default(0)),
  active: col.internal(integer('active', { mode: 'boolean' }).notNull().default(true)),
  note: col.internal(text('note')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'prco',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('promotions_codes_code').on(t.code),
    index('promotions_codes_promotion').on(t.promotionId),
    check('promotions_codes_used', sql`${t.used} >= 0 AND (${t.maxUses} IS NULL OR ${t.used} <= ${t.maxUses})`),
  ],
})

/**
 * One promotion's saving on one line of a sale. `uses` is what it counts against the promotion
 * and its code: the units it took off, or one for the whole sale. A live row counts; a released
 * one has given its uses back. `kind` and `ref` say whose line it is: the selling module answers
 * whether `ref` (a seat's claim, a bar line) is still live, and a row whose ref is not is released.
 */
export const redemptions = defineTable('promotions_redemptions', {
  id: col.id(),
  promotionId: col.ref('promotions_promotions'),
  codeId: col.ref('promotions_codes', { nullable: true }),
  kind: col.internal(text('kind').notNull()),
  saleRef: col.internal(text('sale_ref').notNull()),
  ref: col.internal(text('ref').notNull()),
  uses: col.internal(integer('uses').notNull()),
  discountMinor: col.minor('discount_minor').notNull(),
  // Why staff gave it, in their words: one line, never about the customer.
  reason: col.internal(text('reason')),
  appliedBy: col.account('applied_by', { role: 'actor', nullable: true }),
  state: col.internal(text('state', { enum: ['live', 'released'] }).notNull().default('live')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'prdm',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('promotions_redemptions_promotion').on(t.promotionId, t.state),
    index('promotions_redemptions_ref').on(t.kind, t.ref),
    index('promotions_redemptions_sale').on(t.saleRef),
    check('promotions_redemptions_state', sql`${t.state} IN ('live', 'released')`),
    check('promotions_redemptions_uses', sql`${t.uses} >= 0`),
    check('promotions_redemptions_discount', sql`${t.discountMinor} >= 0`),
  ],
})

export const tables = { promotions, targets, codes, redemptions }
