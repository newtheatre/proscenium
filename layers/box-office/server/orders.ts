// What the order services share: the order and its live ticket lines as they are read, and the
// words a message uses for them.
import { all, first, refuse, theatreTimeZone, useSetting, wordsFrom } from '#kit'
import { getPerformance, getProduction, getVenue, latecomersAt, placeOf } from '#modules/core'
import { lineKey, unnamedLines } from './line-names'
import catalogue from '../i18n/en-GB.json'
import { HIDDEN_TYPE } from './ticket-types'

const say = wordsFrom(catalogue)

export interface OrderRow { id: string, reference: string, state: string, account_id: string | null, currency: string, total_minor: number, expires_at: number | null, release_at: number | null, intent_id: string | null, confirm_email: string | null, confirm_name: string | null, admit_on_payment: number, sold_by: string | null }
/** band_name is null when the production has one band, so there is no part of the house to name. */
export interface LineRow { id: string, performance_id: string, band_id: string, ticket_type_id: string, amount_minor: number, type_name: string, type_kind: string, band_name: string | null, /** 1 for a pass's entry. */ pass_entry?: number }

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
    // A pass entry is named by its pass, and a wheelchair space on a pass by both.
    `SELECT l.id, l.performance_id, l.band_id, l.ticket_type_id, l.amount_minor,
        CASE WHEN y.name IS NULL THEN t.name WHEN t.managed_by = '${HIDDEN_TYPE}' THEN y.name ELSE y.name || ', ' || t.name END AS type_name, t.kind AS type_kind, (l.pass_redemption_id IS NOT NULL) AS pass_entry,
        CASE WHEN (SELECT count(*) FROM box_office_bands o WHERE o.production_id = b.production_id) > 1 THEN b.name END AS band_name FROM box_office_order_lines l
      JOIN box_office_ticket_types t ON t.id = l.ticket_type_id JOIN box_office_bands b ON b.id = l.band_id
      LEFT JOIN box_office_pass_redemptions d ON d.id = l.pass_redemption_id LEFT JOIN box_office_passes p ON p.id = d.pass_id LEFT JOIN box_office_pass_types y ON y.id = p.pass_type_id
      WHERE l.order_id = ? AND l.kind = 'ticket' AND l.state = 'live' ORDER BY l.id`, orderId)
}

// What a message says about an order: the show, when, what is booked and what is owed.
export async function wordsFor(order: Pick<OrderRow, 'currency'>, lines: LineRow[], amountMinor: number) {
  const performance = await getPerformance(lines[0]!.performance_id)
  const production = await getProduction(performance.productionId)
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const counts = new Map<string, number>()
  const unnamed = await unnamedLines(lines)
  for (const line of lines) {
    // Named with its part of the house where the production has more than one, such as a wheelchair
    // space; not named at all where there is one kind to book, as Choose tickets shows it.
    const name = unnamed.has(lineKey(line)) ? '' : line.band_name ? `${line.band_name}, ${line.type_name}` : line.type_name
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const said = [...counts].map(([name, count]) => name ? `${count} × ${name}` : count === 1 ? '1 ticket' : `${count} tickets`).join(', ')
  return {
    show: production.title,
    when: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(performance.startsAt),
    tickets: said,
    /** The tickets, with the age every holder must be where the production is age-restricted, for the messages that carry the tickets. */
    ticketsWithAge: said
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
export async function visitFor(lines: LineRow[]): Promise<{ where: string, doors: string, access: string, latecomers: string }> {
  const performance = await getPerformance(lines[0]!.performance_id)
  const venue = await getVenue(performance.venueId)
  const space = venue.spaces.find(s => s.id === performance.spaceId)
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const address = [venue.addressLines?.replace(/\s*\n\s*/g, ', '), venue.locality, venue.postcode].filter(Boolean).join(', ')
  const place = placeOf(performance.spaceName, venue.name)
  const notes = [venue.accessInfo, space?.accessInfo].map(n => n?.trim()).filter(Boolean)
  return {
    where: address ? `${place}, ${address}` : place,
    doors: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(performance.doorsAt ?? performance.startsAt),
    access: notes.length ? say('box-office.visit.access', { notes: notes.join(' ') }) : say('box-office.visit.ask'),
    latecomers: say(`box-office.visit.latecomers.${await latecomersAt(performance.id)}`),
  }
}

/**
 * The pass an order's tickets were booked on, when any were: its type's name, whether the pass itself
 * is paid for, and whether every ticket on the order is a pass entry. Staff see it on the orders list
 * and the order, so an order of pass entries at £0 does not read as paid in full. Where an order holds
 * entries from more than one pass, an unpaid one is named first.
 */
export interface OrderPass { name: string, paid: boolean, only: boolean }

export async function passOf(orderId: string): Promise<OrderPass | null> {
  const row = await first<{ name: string, paid_at: number | null, others: number }>(`SELECT y.name, p.paid_at,
      (SELECT count(*) FROM box_office_order_lines x WHERE x.order_id = l.order_id AND x.kind = 'ticket' AND x.pass_redemption_id IS NULL) AS others
    FROM box_office_order_lines l JOIN box_office_pass_redemptions d ON d.id = l.pass_redemption_id
      JOIN box_office_passes p ON p.id = d.pass_id JOIN box_office_pass_types y ON y.id = p.pass_type_id
    WHERE l.order_id = ? ORDER BY p.paid_at IS NULL DESC LIMIT 1`, orderId)
  return row ? { name: row.name, paid: row.paid_at !== null, only: row.others === 0 } : null
}
