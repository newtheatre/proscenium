// Membership's headline on the console home (core.home-figure): the people whose membership is current
// today, with how many joined in each of the last twelve months. A renewal is not a join.
import { all, first, today } from '#kit'

const MONTHS = 12 // not-policy: a year shows the joining season

function monthsEndingWith(day: string): string[] {
  const [y, m] = day.split('-').map(Number) as [number, number]
  return Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (MONTHS - 1 - i), 1))
    return d.toISOString().slice(0, 7) // not-policy: the year and month of an ISO date
  })
}

export default {
  label: 'membership.home-figures.members.label',
  ability: 'membership.membership.view',
  order: 40, // not-policy: its place on the grid
  size: 'wide' as const,
  to: '/console/membership',
  async read() {
    const day = await today()
    const months = monthsEndingWith(day)
    const current = (await first<{ n: number }>(
      "SELECT count(DISTINCT account_id) AS n FROM membership_memberships WHERE state = 'active' AND (starts_on IS NULL OR starts_on <= ?1) AND (ends_on IS NULL OR ends_on >= ?1)", day))?.n ?? 0
    const joins = await all<{ month: string, n: number }>(
      `SELECT substr(starts_on, 1, 7) AS month, count(*) AS n FROM membership_memberships -- not-policy: the year and month
        WHERE renews_id IS NULL AND state IN ('active', 'expired', 'ended') AND starts_on >= ? AND starts_on <= ? GROUP BY month`, `${months[0]}-01`, day) // not-policy: a month's first day
    const byMonth = new Map(joins.map(j => [j.month, j.n]))
    const joined = months.reduce((n, m) => n + (byMonth.get(m) ?? 0), 0)
    return {
      value: current,
      detail: { key: 'membership.home-figures.members.detail', params: { count: byMonth.get(months.at(-1)!) ?? 0 } },
      chart: {
        type: 'bar' as const,
        series: [{ key: 'joined', label: 'membership.home-figures.members.series' }],
        rows: months.map(m => ({ month: m, values: { joined: byMonth.get(m) ?? 0 } })),
        summary: { key: 'membership.home-figures.members.summary', params: { months: MONTHS, count: joined } },
      },
    }
  },
}
