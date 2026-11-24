// A course's title and its page on the console.
import { all, first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM training_courses WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/training/courses/${id}` } : null
  },
  async choices(limit: number) {
    return all<{ id: string, title: string }>('SELECT id, title FROM training_courses WHERE status != \'retired\' ORDER BY lower(title) LIMIT ?', limit)
  },
}
