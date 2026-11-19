// Pricing a sale through payments.pricing (the unified promotions design). Selling modules call
// these and never the pricer itself, so a theatre without Promotions sells at list prices and no
// module imports another.
import { refuse, usePoint, type UnitView } from '#kit'
import type { PricedSale, Pricing, PricingInput, StaffChoice } from './points/pricing'

async function pricer(): Promise<Pricing | null> {
  return (await usePoint<Pricing>('payments.pricing'))[0]?.value ?? null
}

/** Prices a sale: each item's saving, or none at all when nothing prices sales. Reads only. */
export async function priceSale(input: PricingInput): Promise<PricedSale> {
  const p = await pricer()
  if (p) return p.price(input)
  if (input.codes?.some(c => c.trim()) || input.staff?.length) {
    refuse('payments.pricing.no-codes', 'Codes are not taken here.', { status: 422, fields: { promoCode: 'invalid' } })
  }
  return { items: input.items.map(i => ({ key: i.key, discountMinor: 0 })), applied: [], savings: [], stale: [] }
}

/** The promotions the seller may pick at the till; none when nothing prices sales. Reads only. */
export async function staffChoices(): Promise<StaffChoice[]> {
  const p = await pricer()
  return p ? p.choices() : []
}

/** Whether a sale on this channel with no code could be priced below its list prices at all. Reads only. */
export async function pricesWithoutCode(channel: PricingInput['channel']): Promise<boolean> {
  const p = await pricer()
  return p ? p.automatic(channel) : false
}

/** Writes a priced sale's savings into the unit; the id to keep on each item's line, by key. */
export async function redeemSale(unit: UnitView, priced: PricedSale, owner: { kind: string, saleRef: string, refs: Record<string, string> }): Promise<Record<string, string>> {
  if (!priced.savings.length && !priced.stale.length) return {}
  const p = await pricer()
  return p ? p.redeem(unit, priced, owner) : {}
}

/** Moves kept savings to new references (a seat taken again for a split booking); the new id by old id. */
export async function moveSavings(unit: UnitView, moves: { id: string, ref: string, saleRef: string }[]): Promise<Record<string, string>> {
  const p = moves.length ? await pricer() : null
  return p ? p.move(unit, moves) : {}
}

/** What the references kept on lines were, for a receipt or a basket's summary. */
export async function describeSavings(ids: string[]): Promise<Map<string, { label: string, code: string | null }>> {
  const p = ids.length ? await pricer() : null
  return p ? p.describe(ids) : new Map()
}
