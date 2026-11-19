// The programme's headline on the console home (core.home-figure): the performances in the coming
// week and how many productions they belong to.
import { first, nowMs } from '#kit'

const WEEK = 7 * 24 * 60 * 60 * 1000 // not-policy: a week in milliseconds

export default {
  label: 'core.home-figures.performances.label',
  ability: 'core.production.view',
  order: 50, // not-policy: its place on the grid
  size: 'small' as const,
  to: '/console/programme/calendar',
  async read() {
    const at = nowMs()
    const row = await first<{ n: number, productions: number }>(
      "SELECT count(*) AS n, count(DISTINCT production_id) AS productions FROM core_performances WHERE state = 'scheduled' AND starts_at >= ? AND starts_at < ?", at, at + WEEK)
    return { value: row?.n ?? 0, detail: { key: 'core.home-figures.performances.detail', params: { count: row?.productions ?? 0 } } }
  },
}
