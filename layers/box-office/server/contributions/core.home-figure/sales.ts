// Box office's headline on the console home (core.home-figure): what tickets sold for tonight, by the
// theatre's operating day, with each of the last fortnight's days beside it. Sold means a live ticket
// line on a confirmed order, as the sales report counts it; complimentary tickets add nothing.
import { all, nowMs, useSetting } from '#kit'
import { recentDays } from '#modules/core'

const DAYS = 14 // not-policy: a fortnight is enough to see a run's pattern

export default {
  label: 'box-office.home-figures.sales.label',
  ability: 'box-office.report.view',
  order: 10, // not-policy: its place on the grid
  size: 'wide' as const,
  to: '/console/box-office/reports/sales',
  async read() {
    const { days, start, end, dayOf } = await recentDays(DAYS, nowMs())
    const rows = await all<{ at: number, tickets: number, value: number }>(
      `SELECT o.confirmed_at AS at, count(*) AS tickets, sum(l.amount_minor) AS value
        FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
        WHERE l.kind = 'ticket' AND l.state = 'live' AND o.state = 'confirmed' AND t.kind <> 'complimentary' AND o.confirmed_at >= ? AND o.confirmed_at < ?
        GROUP BY o.id`, start, end)
    const byDay = new Map(days.map(d => [d, { tickets: 0, value: 0 }]))
    for (const r of rows) {
      const day = byDay.get(dayOf(r.at))
      if (!day) continue
      day.tickets += r.tickets
      day.value += r.value
    }
    const today = byDay.get(days.at(-1)!)!
    const total = [...byDay.values()].reduce((n, d) => n + d.tickets, 0)
    return {
      value: today.value,
      unit: await useSetting('core.locale.currency') as string,
      detail: { key: 'box-office.home-figures.sales.detail', params: { count: today.tickets } },
      chart: {
        type: 'bar' as const,
        series: [{ key: 'value', label: 'box-office.home-figures.sales.series' }],
        rows: days.map(date => ({ date, values: { value: byDay.get(date)!.value } })),
        summary: { key: 'box-office.home-figures.sales.summary', params: { days: DAYS, count: total } },
      },
    }
  },
}
