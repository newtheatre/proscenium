// Tickets priced through Payments' pricing (the unified promotions design): each ticket goes in at
// its list price, with what a promotion may narrow it by, and comes back with its saving, which the
// order line keeps. Box office never learns what priced it. A ticket's saving stands while its seat's
// claim does, so a seat given back gives its use back (contributions/promotions.target/ticket.ts).
import { all, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { describeSavings, moveSavings, priceSale, pricesWithoutCode, redeemSale, type PricedSale } from '#modules/payments'

export const TICKET_KIND = 'box-office.ticket'

/** Ticket types whose price is already reduced for who the buyer is: a requirement, a concession or proof. */
async function reducedTypes(): Promise<Set<string>> {
  const rows = await all<{ id: string }>(`SELECT id FROM box_office_ticket_types
    WHERE (requirement_refs IS NOT NULL AND requirement_refs <> '[]') OR kind = 'concession' OR (proof_note IS NOT NULL AND proof_note <> '')`)
  return new Set(rows.map(r => r.id))
}

export interface PricedTickets {
  /** What comes off each line, in the lines' order. */
  discounts: number[]
  priced: PricedSale
}

/**
 * Prices one performance's tickets, one line apiece, with any code the buyer gave. A code that
 * cannot be used is refused, saying why. `preview` prices each line as if it were alone.
 */
export async function priceTickets(performanceId: string, lines: readonly { bandId: string, ticketTypeId: string, amountMinor: number }[], channel: 'online' | 'till', code?: string, preview = false): Promise<PricedTickets> {
  const typed = code?.trim()
  // Most sales have no code and nothing that applies on its own: one read says so, and they sell at list prices.
  if (!typed && !await pricesWithoutCode(channel)) return unpriced(lines.length)
  const [performance, reduced] = await Promise.all([getPerformance(performanceId), reducedTypes()])
  const priced = await priceSale({
    channel,
    preview,
    codes: typed ? [typed] : [],
    items: lines.map((l, i) => ({
      key: String(i), kind: TICKET_KIND, listMinor: Math.max(0, l.amountMinor), quantity: 1, reduced: reduced.has(l.ticketTypeId),
      facts: { productionId: performance.productionId, performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId },
    })),
  })
  return { discounts: priced.items.map(i => i.discountMinor), priced }
}

/** Writes the savings after the seats' claims; the reference each line keeps, in the lines' order. */
export async function redeemTickets(unit: UnitView, priced: PricedTickets, orderId: string, claimIds: readonly (string | undefined)[]): Promise<(string | null)[]> {
  const refs: Record<string, string> = {}
  priced.discounts.forEach((d, i) => {
    if (d > 0 && claimIds[i]) refs[String(i)] = claimIds[i]!
  })
  const kept = await redeemSale(unit, priced.priced, { kind: TICKET_KIND, saleRef: orderId, refs })
  return priced.discounts.map((_, i) => kept[String(i)] ?? null)
}

/** No saving on any line: for a sale priced without a code where nothing applies. */
export const unpriced = (count: number): PricedTickets => ({ discounts: Array.from({ length: count }, () => 0), priced: { items: [], applied: [], savings: [], stale: [] } })

/** What the promotions kept on lines were, for the basket's summary. */
/**
 * Moves the promotions' uses on tickets to the seats they were taken again on (a split booking):
 * each line's kept saving, by old redemption id, becomes a new one on the new claim and order.
 */
export async function moveTicketSavings(unit: UnitView, orderId: string, lines: readonly { redemptionId: string | null, claimId: string }[]): Promise<Map<string, string>> {
  const moves = lines.flatMap(l => l.redemptionId ? [{ id: l.redemptionId, ref: l.claimId, saleRef: orderId }] : [])
  return new Map(Object.entries(await moveSavings(unit, moves)))
}

export { describeSavings }
