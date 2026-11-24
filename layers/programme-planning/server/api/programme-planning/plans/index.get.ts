// The Programme list (screen 1): every season the person may plan, newest first, with its plan.
import { all, can, defineRoute } from '#kit'
import { overviewOf } from '../../../plans'

interface Row { id: string, slug: string, name: string, startsOn: string, endsOn: string, state: string, planId: string | null, planState: string | null }

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const rows = await all<Row>(`SELECT s.id, s.slug, s.name, s.starts_on AS startsOn, s.ends_on AS endsOn, s.state, p.id AS planId, p.state AS planState
    FROM core_seasons s LEFT JOIN programme_planning_plans p ON p.season_id = s.id
    WHERE s.state <> 'archived' OR p.id IS NOT NULL
    ORDER BY s.starts_on DESC, s.id`)
  const seasons = []
  for (const row of rows) {
    if (!(await can(actor, 'programme-planning.plan.view', ['core.season', row.id])).allowed) continue
    const mayStart = !row.planId && (await can(actor, 'programme-planning.plan.manage', ['core.season', row.id])).allowed
    seasons.push({ ...row, mayStart, overview: row.planId ? await overviewOf(row.planId) : null })
  }
  return { seasons }
})
