// Performances whose set-up can be copied onto this one (BO-02): any other that has been set up for
// sale, past or to come, newest first, so last season's production can be the starting point.
import { getRouterParam } from 'h3'
import { all, can, defineRoute } from '#kit'

const MOST = 200 // not-policy: how many performances the picker offers at once

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const rows = await all<{ id: string, title: string, label: string | null, starts_at: number }>(
    `SELECT f.id, p.title, f.label, f.starts_at FROM core_performances f JOIN core_productions p ON p.id = f.production_id
      WHERE f.id <> ? AND EXISTS (SELECT 1 FROM box_office_pools o WHERE o.performance_id = f.id)
      ORDER BY f.starts_at DESC LIMIT ?`, record!.id, MOST)
  const performances = []
  for (const r of rows) {
    if ((await can(actor, 'box-office.performance.manage', ['core.performance', r.id])).allowed)
      performances.push({ id: r.id, title: r.title, label: r.label, startsAt: r.starts_at })
  }
  return { performances }
})
