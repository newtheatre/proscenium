// A checklist run's title and parent: its performance, so the board's grants reach it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ performance_id: string | null, name: string }>(
      'SELECT r.performance_id, c.name FROM front_of_house_checklist_runs r JOIN front_of_house_checklists c ON c.id = r.checklist_id WHERE r.id = ?', id)
    if (!row) return null
    return {
      title: row.name,
      ...(row.performance_id ? { to: `/live/front-of-house/${row.performance_id}`, parent: { type: 'core.performance', id: row.performance_id } } : {}),
    }
  },
}
