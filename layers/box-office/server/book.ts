// What the public Choose tickets page shows (Box office specification, part 6, "Choose tickets"):
// one performance of a published production, whether it is on sale, and each band's ticket types
// and prices. It never says how many seats the house holds or how many are sold: a band is either
// available or sold out.
import { refuse, requirements, useContext, useSetting } from '#kit'
import { getPerformance, getProduction } from '#modules/core'
import { availability } from './availability'
import { timingFor, type PaymentTiming } from './reservations'
import { salesOf } from './setup'
import { sellableTypes } from './ticket-types'

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
    /**
     * `most` is how many this visitor may have, for a type with requirements they meet; `unmet` is
     * the source's own words when they do not, and the type cannot be chosen, unless it takes a
     * `reference`: then the visitor may type one for each ticket instead, such as a student ID,
     * worded by the source ("NNT member? Enter your student ID").
     */
    types: { ticketTypeId: string, name: string, kind: string, proofNote: string | null, needsPaidTicket: boolean, amountMinor: number, most?: number, unmet?: string, reference?: { label: string, field?: string, shape: string } }[]
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
  const types = await sellableTypes()
  // What the visitor may have of each type with requirements, judged for them alone. A type whose
  // source is off is withheld; a companion type is shown only to someone it is for.
  const account = useContext().actor.accountId ?? null
  const judged = new Map<string, { most?: number, unmet?: string, reference?: { label: string, field?: string, shape: string } } | null>()
  for (const type of types.values()) {
    if (!type.requirementRefs.length) continue
    const answers = await requirements.check({ accounts: [account], refs: type.requirementRefs, record: ['core.performance', performanceId], whenUnavailable: 'not-met' })
    const met = answers.find(a => a.verdict === 'met' && !a.unavailable)
    if (met) judged.set(type.id, { most: met.quantity ?? type.maxPerHolder })
    else if (answers.every(a => a.unavailable) || type.kind === 'companion') judged.set(type.id, null)
    else {
      const described = await requirements.describe(type.requirementRefs)
      const reference = type.requirementRefs.map(ref => described[ref]?.presentable).find(Boolean)
      judged.set(type.id, { unmet: answers.find(a => a.reason)?.reason ?? 'Only for people who qualify.', ...(reference ? { reference } : {}) })
    }
  }
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
        // Complimentary tickets are given, never bought; a desk-only type is sold at the box office.
        if (!type || type.kind === 'complimentary' || type.channel === 'desk' || judged.get(type.id) === null) return []
        return [{ ticketTypeId: type.id, name: type.name, kind: type.kind, proofNote: type.proofNote, needsPaidTicket: type.needsPaidTicket || type.kind === 'companion', amountMinor: p.amountMinor, sort: type.sort, ...judged.get(type.id) }]
      }).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(({ sort: _, ...type }) => type),
    })).filter(b => b.types.length),
  }
}
