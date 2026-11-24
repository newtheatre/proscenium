// An entry's working title, under its plan.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ plan_id: string, title: string, slug: string }>('SELECT e.plan_id, e.title, s.slug FROM programme_planning_entries e JOIN programme_planning_plans p ON p.id = e.plan_id JOIN core_seasons s ON s.id = p.season_id WHERE e.id = ?', id)
    return row ? { title: row.title, to: `/console/programme/${row.slug}`, parent: { type: 'programme-planning.plan', id: row.plan_id } } : null
  },
}
