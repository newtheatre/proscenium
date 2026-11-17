// What the order services share: the order and its live ticket lines as they are read, and the
// words a message uses for them.
import { all, theatreTimeZone, useSetting } from '#kit'
import { getPerformance, getProduction } from '#modules/core'

export interface OrderRow { id: string, reference: string, state: string, account_id: string | null, currency: string, total_minor: number, expires_at: number | null, release_at: number | null, intent_id: string | null, confirm_email: string | null, confirm_name: string | null, admit_on_payment: number, sold_by: string | null }
/** band_name is null when the production has one band, so there is no part of the house to name. */
export interface LineRow { id: string, performance_id: string, band_id: string, ticket_type_id: string, amount_minor: number, type_name: string, type_kind: string, band_name: string | null }

export const ORDER = 'SELECT id, reference, state, account_id, currency, total_minor, expires_at, release_at, intent_id, confirm_email, confirm_name, admit_on_payment, sold_by FROM box_office_orders'
export const RAN_OUT = { code: 'box-office.basket.expired', reason: 'Your basket has run out, and the seats are back on sale.', remedy: 'Choose your tickets again.' }

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
    amount: new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(amountMinor / 100), // not-policy: minor units to units; every currency sold here has two decimals
    timeOf: (at: number) => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(at),
    startsAt: performance.startsAt,
  }
}
