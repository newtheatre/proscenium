// Performances whose set-up can be copied onto this one (BO-02): any other that has been set up for
// sale, past or to come, so last season's production can be the starting point. This production's
// own come first, then the others, the most recently played first; within each production the
// performances run in date order, oldest first.
import { getRouterParam } from 'h3'
import { all, can, defineRoute } from '#kit'
import { getPerformance } from '#modules/core'

const MOST = 200 // not-policy: how many performances the picker offers at once

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const target = await getPerformance(record!.id!)
  const rows = await all<{ id: string, production_id: string, title: string, label: string | null, starts_at: number }>(
    `SELECT f.id, f.production_id, p.title, f.label, f.starts_at FROM core_performances f JOIN core_productions p ON p.id = f.production_id
      WHERE f.id <> ? AND EXISTS (SELECT 1 FROM box_office_pools o WHERE o.performance_id = f.id)
      ORDER BY f.production_id = ? DESC, (SELECT max(g.starts_at) FROM core_performances g WHERE g.production_id = f.production_id) DESC, f.production_id, f.starts_at
      LIMIT ?`, target.id, target.productionId, MOST)
  const performances = []
  for (const r of rows) {
    if ((await can(actor, 'box-office.performance.manage', ['core.performance', r.id])).allowed)
      performances.push({ id: r.id, productionId: r.production_id, title: r.title, label: r.label, startsAt: r.starts_at, sameProduction: r.production_id === target.productionId })
  }
  return { performances }
})
