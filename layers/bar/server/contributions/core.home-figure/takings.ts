// The bar's headline on the console home (core.home-figure): what paid bar sales took tonight, by the
// theatre's operating day, with each of the last fortnight's days beside it. Refunds are not taken off.
import { all, nowMs, useSetting } from '#kit'
import { recentDays } from '#modules/core'

const DAYS = 14 // not-policy: a fortnight is enough to see a run's pattern

export default {
  label: 'bar.home-figures.takings.label',
  ability: 'bar.sale.view',
  order: 30, // not-policy: its place on the grid
  size: 'wide' as const,
  to: '/console/bar/sales',
  async read() {
    const { days, start, end, dayOf } = await recentDays(DAYS, nowMs())
    const rows = await all<{ at: number, value: number }>(
      "SELECT paid_at AS at, total_minor AS value FROM bar_sales WHERE state = 'paid' AND paid_at >= ? AND paid_at < ?", start, end)
    const byDay = new Map(days.map(d => [d, { sales: 0, value: 0 }]))
    for (const r of rows) {
      const day = byDay.get(dayOf(r.at))
      if (!day) continue
      day.sales += 1
      day.value += r.value
    }
    const today = byDay.get(days.at(-1)!)!
    return {
      value: today.value,
      unit: await useSetting('core.locale.currency') as string,
      detail: { key: 'bar.home-figures.takings.detail', params: { count: today.sales } },
      chart: {
        type: 'bar' as const,
        series: [{ key: 'value', label: 'bar.home-figures.takings.series' }],
        rows: days.map(date => ({ date, values: { value: byDay.get(date)!.value } })),
        summary: { key: 'bar.home-figures.takings.summary', params: { days: DAYS, count: rows.length } },
      },
    }
  },
}
