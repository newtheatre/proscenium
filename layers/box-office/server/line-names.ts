// Whether a ticket needs its kind named wherever a booking is shown. Choose tickets leaves the name
// out where there is only one kind the public can book ("Tickets, £12"), so the basket, the booking
// pages and the messages do too: "2 tickets" rather than "2 × Full price" for a free show.
import { availability } from './availability'
import { sellableTypes } from './ticket-types'

/** The kinds of ticket that go unnamed at a performance, as `${bandId} ${ticketTypeId}`. */
export async function unnamedKinds(performanceId: string): Promise<Set<string>> {
  const [found, types] = await Promise.all([availability(performanceId), sellableTypes()])
  const bands = found.bands.map(b => ({
    bandId: b.bandId,
    // What anyone could book online, then what they may book without qualifying for it.
    offered: b.prices.map(p => types.get(p.ticketTypeId)).filter(type => !!type && type.kind !== 'complimentary' && type.channel !== 'desk'),
  })).filter(b => b.offered.length)
  if (bands.length !== 1) return new Set()
  const open = bands[0]!.offered.filter(type => !type!.requirementRefs.length)
  return open.length === 1 ? new Set([`${bands[0]!.bandId} ${open[0]!.id}`]) : new Set()
}

/** Which of a booking's lines go unnamed, as `${performance_id} ${band_id} ${ticket_type_id}`. */
export async function unnamedLines(lines: readonly { performance_id: string, band_id: string, ticket_type_id: string }[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const performanceId of new Set(lines.map(l => l.performance_id))) {
    for (const kind of await unnamedKinds(performanceId).catch(() => new Set<string>())) out.add(`${performanceId} ${kind}`)
  }
  return out
}

export const lineKey = (l: { performance_id: string, band_id: string, ticket_type_id: string }) => `${l.performance_id} ${l.band_id} ${l.ticket_type_id}`
