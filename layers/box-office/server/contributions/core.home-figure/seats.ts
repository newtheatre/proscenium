// Seats taken at the next performances on the console home (core.home-figure): each one's share of its
// capacity, as its pools count them, so seats held in a basket count as taken until they lapse.
import { all, nowMs } from '#kit'

const NEXT = 6 // not-policy: as many as fit beside two other tiles

export default {
  label: 'box-office.home-figures.seats.label',
  ability: 'box-office.report.view',
  order: 20, // not-policy: its place on the grid
  size: 'tall' as const,
  to: '/console/box-office/performances',
  async read() {
    const rows = await all<{ id: string, starts_at: number, title: string, label: string | null, capacity: number, taken: number }>(
      `SELECT f.id, f.starts_at, p.title, f.label, sum(o.capacity) AS capacity, sum(o.claimed) AS taken
        FROM core_performances f JOIN core_productions p ON p.id = f.production_id JOIN box_office_pools o ON o.performance_id = f.id
        WHERE f.state = 'scheduled' AND f.starts_at >= ? GROUP BY f.id, f.starts_at, p.title, f.label ORDER BY f.starts_at, f.id LIMIT ${NEXT}`, nowMs())
    if (!rows.length) return { value: null, detail: { key: 'box-office.home-figures.seats.none' } }
    const capacity = rows.reduce((n, r) => n + r.capacity, 0)
    const taken = rows.reduce((n, r) => n + r.taken, 0)
    return {
      value: capacity ? Math.round(taken * 100 / capacity) : 0, // not-policy: a percentage
      unit: 'percent',
      detail: { key: 'box-office.home-figures.seats.detail', params: { taken, capacity, count: rows.length } },
      chart: {
        type: 'meters' as const,
        series: [],
        rows: rows.map(r => ({ label: r.label ? `${r.title}, ${r.label}` : r.title, at: r.starts_at, values: { taken: r.taken }, max: r.capacity })),
        summary: { key: 'box-office.home-figures.seats.summary', params: { count: rows.length } },
      },
    }
  },
}
