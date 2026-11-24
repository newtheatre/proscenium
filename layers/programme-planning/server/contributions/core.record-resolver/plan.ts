// A plan's title is its season's name; its parent is the season, so a grant on a season reaches it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ season_id: string, name: string, slug: string }>('SELECT p.season_id, s.name, s.slug FROM programme_planning_plans p JOIN core_seasons s ON s.id = p.season_id WHERE p.id = ?', id)
    return row ? { title: row.name, to: `/console/programme/${row.slug}`, parent: { type: 'core.season', id: row.season_id } } : null
  },
}
