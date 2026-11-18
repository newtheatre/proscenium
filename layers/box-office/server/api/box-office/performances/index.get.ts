// Performances for box office staff (Box office specification, part 6, "Performances"): those still
// to come, soonest first, each with its production, its sale state and how many of its seats are taken, so a
// manager sees at a glance what is not yet on sale and what is selling.
import { all, defineRoute, nowMs } from '#kit'
import { getProduction, listPerformances } from '#modules/core'

const MOST = 200 // not-policy: how many performances the page lists at once
const DAY = 86_400_000 // not-policy: performances that started earlier today stay listed, for latecomers and the door

export default defineRoute({ ability: 'box-office.performance.manage', rateLimit: 'default' }, async () => {
  const coming = (await listPerformances({ from: nowMs() - DAY })).filter(p => p.state !== 'cancelled').slice(0, MOST)
  if (!coming.length) return { performances: [] }
  const marks = coming.map(() => '?').join(', ')
  const sales = new Map((await all<{ performance_id: string, state: string }>(`SELECT performance_id, state FROM box_office_performance_sales WHERE performance_id IN (${marks})`, ...coming.map(p => p.id))).map(s => [s.performance_id, s.state]))
  const seats = new Map((await all<{ performance_id: string, capacity: number, claimed: number }>(
    `SELECT performance_id, sum(capacity) AS capacity, sum(claimed) AS claimed FROM box_office_pools WHERE performance_id IN (${marks}) GROUP BY performance_id`, ...coming.map(p => p.id))).map(s => [s.performance_id, s]))
  const titles = new Map<string, string>()
  for (const p of coming) if (!titles.has(p.productionId)) titles.set(p.productionId, (await getProduction(p.productionId)).title)
  return {
    performances: coming.map(p => ({
      id: p.id,
      productionId: p.productionId,
      title: titles.get(p.productionId)!,
      label: p.label,
      startsAt: p.startsAt,
      scheduled: p.state === 'scheduled',
      sales: sales.get(p.id) ?? null,
      capacity: seats.get(p.id)?.capacity ?? 0,
      taken: seats.get(p.id)?.claimed ?? 0,
    })),
  }
})
