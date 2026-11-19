// The pricing engine, with no database: items in at their list price, a saving for each item out.
// A sale is priced once, by this, and each selling module writes the savings on its own lines, so a
// split payment, a part refund or a report reads the same per-item prices (the unified promotions
// design, "How a sale is priced").
//
// Item promotions (a percentage, an amount or a set price on each unit, or a multi-buy) are applied
// greedily: the one that saves the most on what is still unclaimed goes first, on the dearest units
// first, then the next. A unit takes one promotion unless every promotion on it is marked as
// combining. One basket promotion, the one that saves most, is taken last off what remains and
// shared across the items it applies to in proportion to price, the pennies settled by the largest
// remainders so the shares add up exactly. A multi-buy's saving is shared across its group the same way.

export type Effect = 'percent_off' | 'amount_off' | 'set_price' | 'multi_buy' | 'basket_amount_off'

export interface EngineItem {
  key: string
  /** The price of one unit before any promotion, in minor units. */
  listMinor: number
  quantity: number
  /** The price is already reduced for who the buyer is: a member's or a concession's. */
  reduced?: boolean
}

export interface EngineRule {
  id: string
  codeId: string | null
  effect: Effect
  /** Basis points for percent_off; minor units otherwise. */
  value: number
  buyQuantity?: number | null
  freeQuantity?: number | null
  combines?: boolean
  notWithRequirements?: boolean
  countBy?: 'item' | 'sale'
  /** Units (or, counted by sale, groups of a multi-buy) one sale may have it on; null for all. */
  maxPerSale?: number | null
  /** Uses left: the fewer of the promotion's and its code's. Null for no limit. */
  usesLeft?: number | null
  minSpendMinor?: number | null
  /** The keys of the items it applies to. */
  applies: ReadonlySet<string>
  /** What else must be in the sale, each a set of item keys and how many units of them. */
  requires?: readonly { items: ReadonlySet<string>, quantity: number }[]
}

export interface Saving {
  key: string
  ruleId: string
  codeId: string | null
  /** Taken off the item's whole line, every unit together. */
  minor: number
  /** Units of the item it took money off. */
  units: number
  /** What it counts against the promotion's uses. */
  uses: number
}

export interface Priced {
  savings: Saving[]
  /** Each item's whole saving, by key. */
  byItem: Map<string, number>
  /** Rules that took nothing off. */
  unused: string[]
}

const BASIS = 10_000 // not-policy: basis points in a whole

/** What a per-item promotion takes off one unit at a price: never more than the price. */
export function unitSaving(effect: Effect, value: number, priceMinor: number): number {
  if (effect === 'percent_off') return Math.min(priceMinor, Math.round(priceMinor * value / BASIS))
  if (effect === 'amount_off') return Math.min(priceMinor, value)
  if (effect === 'set_price') return Math.max(0, priceMinor - value)
  return 0
}

/**
 * Shares a whole across weights in proportion, each share whole, adding up to exactly the whole and
 * never more than its weight. The pennies left by rounding down go to the largest remainders, the
 * larger weight first on a tie, then the earlier.
 */
export function share(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)
  const whole = Math.min(total, sum)
  const raw = weights.map(w => (w * whole) / sum)
  const out = raw.map(r => Math.floor(r))
  let left = whole - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r), w: weights[i]! })).sort((a, b) => b.rem - a.rem || b.w - a.w || a.i - b.i)
  for (const o of order) {
    if (left <= 0) break
    if (out[o.i]! < weights[o.i]!) {
      out[o.i]! += 1
      left -= 1
    }
  }
  return out
}

interface Unit { key: string, at: number, left: number, reduced: boolean, rules: string[], exclusive: boolean }

const PER_ITEM: ReadonlySet<Effect> = new Set(['percent_off', 'amount_off', 'set_price', 'multi_buy'])

/** Whether a rule's conditions on the rest of the sale hold. */
function met(rule: EngineRule, units: readonly Unit[]): boolean {
  return (rule.requires ?? []).every(r => units.filter(u => r.items.has(u.key)).length >= r.quantity)
}

/** The units a rule may take money off now, dearest first. */
function eligible(rule: EngineRule, units: readonly Unit[], combining: ReadonlyMap<string, boolean>): Unit[] {
  return units.filter(u => rule.applies.has(u.key) && u.left > 0 && !(rule.notWithRequirements && u.reduced)
    && !u.exclusive && (!u.rules.length || (rule.combines && u.rules.every(r => combining.get(r)))))
    .sort((a, b) => b.left - a.left || a.at - b.at)
}

/** How many units a rule may reach in this sale, by its limits. */
function capOf(rule: EngineRule): number {
  if (rule.usesLeft !== null && rule.usesLeft !== undefined && rule.usesLeft <= 0) return 0
  const perSale = rule.maxPerSale ?? Infinity
  if (rule.countBy === 'sale') return rule.effect === 'multi_buy' ? perSale * (rule.buyQuantity ?? 1) : perSale
  return Math.min(perSale, rule.usesLeft ?? Infinity)
}

/** What a per-item or multi-buy rule would take off each unit it reaches, as [unit, saving] pairs. */
function plan(rule: EngineRule, units: readonly Unit[], combining: ReadonlyMap<string, boolean>): [Unit, number][] {
  const open = eligible(rule, units, combining).slice(0, capOf(rule))
  if (rule.effect !== 'multi_buy') return open.map(u => [u, unitSaving(rule.effect, rule.value, u.left)] as [Unit, number]).filter(([, s]) => s > 0)
  const size = rule.buyQuantity ?? 0
  if (size < 2) return [] // not-policy: a multi-buy is of two or more
  const out: [Unit, number][] = []
  for (let g = 0; (g + 1) * size <= open.length; g++) {
    const group = open.slice(g * size, (g + 1) * size)
    const whole = group.reduce((sum, u) => sum + u.left, 0)
    const free = rule.freeQuantity ?? 0
    const saving = free > 0 ? group.slice(size - free).reduce((sum, u) => sum + u.left, 0) : Math.max(0, whole - rule.value)
    share(saving, group.map(u => u.left)).forEach((s, i) => {
      if (s > 0) out.push([group[i]!, s])
    })
  }
  return out
}

/** Prices a sale: every item at its list price, then the promotions, as the file's head says. */
export function priceItems(items: readonly EngineItem[], rules: readonly EngineRule[]): Priced {
  const units: Unit[] = items.flatMap((item, at) => Array.from({ length: Math.max(0, item.quantity) }, () => ({ key: item.key, at, left: Math.max(0, item.listMinor), reduced: !!item.reduced, rules: [], exclusive: false })))
  const combining = new Map(rules.map(r => [r.id, !!r.combines]))
  const taken: { rule: EngineRule, unit: Unit, minor: number }[] = []
  const live = rules.filter(r => met(r, units))

  // Item promotions, the one that saves most first.
  const pool = live.filter(r => PER_ITEM.has(r.effect))
  for (;;) {
    let best: { rule: EngineRule, steps: [Unit, number][], total: number } | null = null
    for (const rule of pool) {
      const steps = plan(rule, units, combining)
      const total = steps.reduce((sum, [, s]) => sum + s, 0)
      if (total > 0 && (!best || total > best.total)) best = { rule, steps, total }
    }
    if (!best) break
    for (const [unit, minor] of best.steps) {
      unit.left -= minor
      unit.rules.push(best.rule.id)
      if (!best.rule.combines) unit.exclusive = true
      taken.push({ rule: best.rule, unit, minor })
    }
    pool.splice(pool.indexOf(best.rule), 1)
  }

  // One basket promotion, the one that saves most, off what is left.
  const spend = units.reduce((sum, u) => sum + u.left, 0)
  let basket: { rule: EngineRule, open: Unit[], saving: number } | null = null
  for (const rule of live.filter(r => r.effect === 'basket_amount_off')) {
    if ((rule.minSpendMinor ?? 0) > spend || capOf(rule) <= 0) continue
    const open = units.filter(u => rule.applies.has(u.key) && u.left > 0 && !(rule.notWithRequirements && u.reduced))
    const saving = Math.min(rule.value, open.reduce((sum, u) => sum + u.left, 0))
    if (saving > 0 && (!basket || saving > basket.saving)) basket = { rule, open, saving }
  }
  if (basket) {
    share(basket.saving, basket.open.map(u => u.left)).forEach((minor, i) => {
      const unit = basket!.open[i]!
      if (minor <= 0) return
      unit.left -= minor
      unit.rules.push(basket!.rule.id)
      taken.push({ rule: basket!.rule, unit, minor })
    })
  }

  // Gathered by item and rule, in the items' order.
  const savings: Saving[] = []
  const seen = new Map<string, Saving>()
  const firstOf = new Set<string>()
  for (const t of taken.sort((a, b) => a.unit.at - b.unit.at)) {
    const id = `${t.unit.key} ${t.rule.id}`
    let s = seen.get(id)
    if (!s) {
      s = { key: t.unit.key, ruleId: t.rule.id, codeId: t.rule.codeId, minor: 0, units: 0, uses: 0 }
      seen.set(id, s)
      savings.push(s)
    }
    s.minor += t.minor
    s.units += 1
    if (t.rule.countBy === 'sale' || t.rule.effect === 'basket_amount_off') {
      if (!firstOf.has(t.rule.id)) {
        firstOf.add(t.rule.id)
        s.uses = 1
      }
    }
    else {
      s.uses += 1
    }
  }
  const byItem = new Map<string, number>()
  for (const s of savings) byItem.set(s.key, (byItem.get(s.key) ?? 0) + s.minor)
  const used = new Set(savings.map(s => s.ruleId))
  return { savings, byItem, unused: rules.filter(r => !used.has(r.id)).map(r => r.id) }
}
