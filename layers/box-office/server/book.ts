// What the public Choose tickets page shows (Box office specification, part 6, "Choose tickets"):
// one performance of a published production, whether it is on sale, and each band's ticket types
// and prices. It never says how many seats the house holds or how many are sold: a band is either
// available or sold out.
import { all, refuse, useSetting } from '#kit'
import { getPerformance, getProduction } from '#modules/core'
import { availability } from './availability'
import { timingFor, type PaymentTiming } from './reservations'
import { salesOf } from './setup'

export interface BookingPage {
  performance: { id: string, startsAt: number, venue: string, state: string }
  production: { id: string, slug: string, title: string, subtitle: string | null }
  state: 'none' | 'draft' | 'on_sale' | 'paused' | 'closed'
  onSaleAt: number | null
  currency: string | null
  /** The most tickets one order may hold. */
  maxPerOrder: number
  timing: PaymentTiming
  bands: {
    bandId: string
    name: string
    soldOut: boolean
    types: { ticketTypeId: string, name: string, kind: string, proofNote: string | null, needsPaidTicket: boolean, amountMinor: number }[]
  }[]
}

export async function bookingPage(performanceId: string): Promise<BookingPage> {
  const performance = await getPerformance(performanceId).catch(() => null)
  const production = performance ? await getProduction(performance.productionId) : null
  // Only what the public can already see: a published production's scheduled performance.
  if (!performance || !production || production.state !== 'published' || performance.state !== 'scheduled')
    refuse('box-office.book.not-found', 'There is no such performance.', { status: 404 })
  const found = await availability(performanceId)
  const sales = await salesOf(performanceId)
  const types = new Map((await all<{ id: string, name: string, kind: string, proof_note: string | null, needs_paid_ticket: number, active: number }>(
    'SELECT id, name, kind, proof_note, needs_paid_ticket, active FROM box_office_ticket_types')).map(t => [t.id, t]))
  return {
    performance: { id: performance.id, startsAt: performance.startsAt, venue: `${performance.venueName}, ${performance.spaceName}`, state: performance.state },
    production: { id: production.id, slug: production.slug, title: production.title, subtitle: production.subtitle },
    state: found.state,
    onSaleAt: found.onSaleAt,
    currency: found.currency,
    maxPerOrder: sales?.maxPerOrder ?? await useSetting('box-office.orders.seat-cap') as number,
    timing: await timingFor(performanceId),
    bands: found.bands.map(b => ({
      bandId: b.bandId,
      name: b.name,
      soldOut: b.free <= 0,
      types: b.prices.flatMap((p) => {
        const type = types.get(p.ticketTypeId)
        // Complimentary tickets are given, never bought.
        if (!type || !type.active || type.kind === 'complimentary') return []
        return [{ ticketTypeId: type.id, name: type.name, kind: type.kind, proofNote: type.proof_note, needsPaidTicket: !!type.needs_paid_ticket || type.kind === 'companion', amountMinor: p.amountMinor }]
      }),
    })).filter(b => b.types.length),
  }
}
