// The till (Box office specification, part 4, "One payment with several owners"): Payments' desk
// component. Each module with something to sell at the desk contributes a panel to
// payments.desk-basket; the till asks each panel the seller filled in to prepare its part, in the one
// batch that creates the intent, and then takes one payment for the total.
import { can, nowMs, Refusal, runInContext, useContext, usePoint, type Actor, type UnitView } from '#kit'
import { createIntent } from './intents'
import type { DeskBasket } from './points/desk-basket'
import type { PricedSale } from './points/pricing'
import { priceSale, pricesWithoutCode } from './pricing'
import { addSplits, planSplits, wholeSale, type SplitInput, type SplitPanel } from './splits'
import type { Destination } from './points/settlement'

/** How long a desk sale may wait unpaid before the expiry task releases it. */
const DESK_INTENT_LIFETIME = 30 * 60_000 // not-policy: a backstop for a till left mid-sale; the seller cancels or takes payment long before

export interface PanelInput { basket: string, input: unknown }

/** What the seller added to the whole sale: codes the customer gave, and promotions picked from the till's list. */
export interface TillPricing { codes?: string[], staff?: { promotionId: string, reason?: string }[] }

/** A saving on the sale, for the receipt: what it is called and what it took off. */
export interface TillSaving { label: string, code: string | null, amountMinor: number }

/**
 * Prices the panels that offer their items as one sale (payments.pricing), with what the seller
 * added, and gives each panel its share keyed by its own keys. Nothing when no panel offers items
 * and nothing was added. Reads only.
 */
async function priceTogether(filled: { panel: { id: string, value: DeskBasket }, input: unknown }[], pricing: TillPricing | undefined): Promise<{ byPanel: Map<string, PricedSale>, savings: TillSaving[] }> {
  const byPanel = new Map<string, PricedSale>()
  const added = !!(pricing?.codes?.some(c => c.trim()) || pricing?.staff?.length)
  // Most sales have nothing added and nothing that applies on its own: one read says so.
  if (!added && !await pricesWithoutCode('till')) return { byPanel, savings: [] }
  const offered = await Promise.all(filled.map(async f => ({ id: f.panel.id, items: f.panel.value.items ? await f.panel.value.items({ input: f.input }) : null })))
  const items = offered.flatMap(o => (o.items ?? []).map(i => ({ ...i, key: `${o.id}|${i.key}` })))
  if (!items.length) {
    if (added) throw new Refusal('payments.till.nothing-to-discount', 'Nothing in this sale can take a code or a discount.', { status: 422, fields: { promoCode: 'invalid' } })
    return { byPanel, savings: [] }
  }
  const priced = await priceSale({ items, channel: 'till', codes: pricing?.codes, staff: pricing?.staff })
  // The given-back uses are released once, with the first panel that redeems.
  let stale = priced.stale
  for (const o of offered) {
    if (!o.items) continue
    const mine = (key: string) => key.startsWith(`${o.id}|`)
    const strip = (key: string) => key.slice(o.id.length + 1)
    const savings = priced.savings.filter(s => mine(s.key)).map(s => ({ ...s, key: strip(s.key) }))
    const ids = new Set(savings.map(s => s.promotionId))
    byPanel.set(o.id, {
      items: priced.items.filter(i => mine(i.key)).map(i => ({ ...i, key: strip(i.key) })),
      applied: priced.applied.filter(a => ids.has(a.promotionId)).map(a => ({ ...a, savingMinor: savings.filter(s => s.promotionId === a.promotionId).reduce((sum, s) => sum + s.minor, 0) })),
      savings,
      stale,
    })
    stale = []
  }
  return { byPanel, savings: priced.applied.map(a => ({ label: a.label, code: a.code, amountMinor: a.savingMinor })) }
}

/**
 * A panel's code is its owner's, so each of its functions runs as its owner: the request is Payments',
 * but what a panel signs or reads under its module's name is its own to use. The unit still commits
 * in Payments' context.
 */
function asOwner(module: string, basket: DeskBasket): DeskBasket {
  const wrapped = Object.entries(basket).map(([name, member]) => [
    name,
    typeof member === 'function' ? (...args: unknown[]) => runInContext({ ...useContext(), module }, () => member.apply(basket, args)) : member,
  ])
  return Object.fromEntries(wrapped) as DeskBasket
}

/** The panels the seller may use, in order. */
export async function panelsFor(actor: Actor): Promise<{ id: string, module: string, value: DeskBasket }[]> {
  const out = []
  for (const c of await usePoint<DeskBasket>('payments.desk-basket')) {
    if ((await can(actor, c.value.ability as any)).allowed) out.push({ ...c, value: asOwner(c.module, c.value) })
  }
  return out.sort((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0))
}

async function chosen(actor: Actor, panels: PanelInput[]) {
  const mine = new Map((await panelsFor(actor)).map(p => [p.id, p]))
  const seen = new Set<string>()
  return panels.map((p) => {
    const panel = mine.get(p.basket)
    if (!panel) throw new Refusal('payments.till.no-panel', 'That is not something you can sell here.', { status: 403 })
    if (seen.has(p.basket)) throw new Refusal('payments.till.panel-twice', 'Each panel is sent once.', { status: 422 })
    seen.add(p.basket)
    return { panel, input: p.input }
  })
}

/** Where the filled panels say the sale happens: the first that names a space, else null. Reads only. */
export async function tillSpace(actor: Actor, panels: PanelInput[]): Promise<string | null> {
  for (const { panel, input } of await chosen(actor, panels)) {
    const space = await panel.value.space?.({ input }).catch(() => null)
    if (space) return space
  }
  return null
}

/** What the filled panels add up to, for display, with the savings on the sale. Reads only. */
export async function tillSummary(actor: Actor, panels: PanelInput[], pricing?: TillPricing) {
  const filled = await chosen(actor, panels)
  const { byPanel, savings } = await priceTogether(filled, pricing)
  const out = []
  for (const { panel, input } of filled) out.push({ basket: panel.id, ...await panel.value.summary({ input, priced: byPanel.get(panel.id) }) })
  return { panels: out, savings, amountMinor: out.reduce((s, p) => s + p.amountMinor, 0) }
}

/**
 * Prepares every filled panel and opens one intent for them in the session, in the caller's unit.
 * With `splits`, the sale is split between people by item: each panel's summary lines are given out
 * as the till says, and must add up to what the panel prepared.
 */
export async function prepareSale(unit: UnitView, actor: Actor, sessionId: string, panels: PanelInput[], splits?: SplitInput[], receipt?: Destination, pricing?: TillPricing): Promise<{ intentId: string, amountMinor: number }> {
  if (splits && receipt) throw new Refusal('payments.till.receipt-per-person', 'A split sale has a receipt for each person, given as they pay.', { status: 422 })
  if (!panels.length) throw new Refusal('payments.till.empty', 'There is nothing to take payment for.', { status: 422 })
  const parts = []
  const prepared = []
  const lined: SplitPanel[] = []
  const filled = await chosen(actor, panels)
  const { byPanel } = await priceTogether(filled, pricing)
  for (const { panel, input } of filled) {
    const priced = byPanel.get(panel.id)
    const part = await panel.value.prepare(unit, { sessionId, input, priced, receipt, split: !!splits })
    if (part.owner.module !== panel.module) throw new Error(`${panel.module}'s panel prepared a part for ${part.owner.module}`)
    parts.push(part)
    prepared.push({ panel, part })
    // What the receipt lists. A split must add up exactly; a whole sale's receipt takes the lines as they are.
    const { lines } = await panel.value.summary({ input, priced })
    if (splits && lines.reduce((sum, l) => sum + l.amountMinor, 0) !== part.amountMinor)
      throw new Refusal('payments.till.total-changed', 'The items on the receipt no longer add up to the total.', { status: 409, remedy: 'Check the receipt, then split it again.' })
    lined.push({ basket: panel.id, owner: part.owner, lines })
  }
  const planned = splits ? planSplits(lined, splits) : [{ ...wholeSale(lined), amountMinor: parts.reduce((s, p) => s + p.amountMinor, 0) }]
  const { intentId } = await createIntent(unit, { parts, channel: 'desk', sessionId, expiresAt: nowMs() + DESK_INTENT_LIFETIME })
  for (const { panel, part } of prepared) await panel.value.attach?.(unit, part.owner.record, intentId)
  addSplits(unit, intentId, planned, receipt)
  return { intentId, amountMinor: parts.reduce((s, p) => s + p.amountMinor, 0) }
}
