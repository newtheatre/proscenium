// What the order services share: the order and its live ticket lines as they are read, and the
// words a message uses for them.
import { all, refuse, theatreTimeZone, useSetting } from '#kit'
import { getPerformance, getProduction, getVenue } from '#modules/core'

export interface OrderRow { id: string, reference: string, state: string, account_id: string | null, currency: string, total_minor: number, expires_at: number | null, release_at: number | null, intent_id: string | null, confirm_email: string | null, confirm_name: string | null, admit_on_payment: number, sold_by: string | null }
/** band_name is null when the production has one band, so there is no part of the house to name. */
export interface LineRow { id: string, performance_id: string, band_id: string, ticket_type_id: string, amount_minor: number, type_name: string, type_kind: string, band_name: string | null }

export const ORDER = 'SELECT id, reference, state, account_id, currency, total_minor, expires_at, release_at, intent_id, confirm_email, confirm_name, admit_on_payment, sold_by FROM box_office_orders'
export const RAN_OUT = { code: 'box-office.basket.expired', reason: 'Your basket has run out, and the seats are back on sale.', remedy: 'Choose your tickets again.' }

/**
 * A production only for people over an age is booked online only once the buyer has said everyone
 * using the tickets is that age: the box office's own check stays at the door, where ID may be asked for.
 */
export async function assertAgeConfirmed(lines: { performance_id: string }[], confirmed: boolean | undefined): Promise<void> {
  if (confirmed) return
  for (const performanceId of new Set(lines.map(l => l.performance_id))) {
    const production = await getProduction((await getPerformance(performanceId)).productionId)
    if (production.ageRestricted && production.ageMin !== null)
      refuse('box-office.order.age-not-confirmed', `Everyone using these tickets must be ${production.ageMin} or over.`, { status: 422, remedy: 'Tick the box to say they are.', fields: { ageConfirmed: 'box-office.order.age-not-confirmed' } })
  }
}

export function liveLines(orderId: string): Promise<LineRow[]> {
  return all<LineRow>(
    `SELECT l.id, l.performance_id, l.band_id, l.ticket_type_id, l.amount_minor, t.name AS type_name, t.kind AS type_kind,
        CASE WHEN (SELECT count(*) FROM box_office_bands o WHERE o.production_id = b.production_id) > 1 THEN b.name END AS band_name FROM box_office_order_lines l
      JOIN box_office_ticket_types t ON t.id = l.ticket_type_id JOIN box_office_bands b ON b.id = l.band_id WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, orderId)
}

// What a message says about an order: the show, when, what is booked and what is owed.
export async function wordsFor(order: Pick<OrderRow, 'currency'>, lines: LineRow[], amountMinor: number) {
  const performance = await getPerformance(lines[0]!.performance_id)
  const production = await getProduction(performance.productionId)
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const counts = new Map<string, number>()
  for (const line of lines) {
    // Named with its part of the house where the production has more than one, such as a wheelchair space.
    const name = line.band_name ? `${line.band_name}, ${line.type_name}` : line.type_name
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return {
    show: production.title,
    when: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(performance.startsAt),
    tickets: [...counts].map(([name, count]) => `${count} × ${name}`).join(', '),
    /** The tickets, with the age every holder must be where the production is age-restricted, for the messages that carry the tickets. */
    ticketsWithAge: [...counts].map(([name, count]) => `${count} × ${name}`).join(', ')
      + (production.ageRestricted && production.ageMin !== null ? `. Everyone using these tickets must be ${production.ageMin} or over; ID may be checked.` : ''),
    amount: new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(amountMinor / 100), // not-policy: minor units to units; every currency sold here has two decimals
    timeOf: (at: number) => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(at),
    startsAt: performance.startsAt,
  }
}

/**
 * What a booking confirmation says about coming to the performance: where it is, with the address,
 * when the doors open, and the venue's and space's access information (or where to ask about it).
 */
export async function visitFor(lines: LineRow[]): Promise<{ where: string, doors: string, access: string }> {
  const performance = await getPerformance(lines[0]!.performance_id)
  const venue = await getVenue(performance.venueId)
  const space = venue.spaces.find(s => s.id === performance.spaceId)
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const same = performance.spaceName.trim().localeCompare(venue.name.trim(), undefined, { sensitivity: 'accent' }) === 0
  const address = [venue.addressLines?.replace(/\s*\n\s*/g, ', '), venue.locality, venue.postcode].filter(Boolean).join(', ')
  const place = same ? venue.name : `${performance.spaceName}, ${venue.name}`
  const notes = [venue.accessInfo, space?.accessInfo].map(n => n?.trim()).filter(Boolean)
  return {
    where: address ? `${place}, ${address}` : place,
    doors: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(performance.doorsAt ?? performance.startsAt),
    access: notes.length ? `Access: ${notes.join(' ')}` : 'If anything would make your visit easier, tell the box office before you come.',
  }
}
