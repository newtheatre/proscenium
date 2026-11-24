// A competency's title and its page on the console.
import { all, first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM training_competencies WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/training/competencies/${id}` } : null
  },
  async choices(limit: number) {
    return all<{ id: string, title: string }>('SELECT id, title FROM training_competencies WHERE status = \'active\' ORDER BY lower(title) LIMIT ?', limit)
  },
}
