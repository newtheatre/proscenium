// A fixture performance's title, and the performances a pinned fact mapping may name.
import { all, first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM seats_performances WHERE id = ?', id)
    return row ? { title: row.title } : null
  },
  async choices(limit: number) {
    return all<{ id: string, title: string }>('SELECT id, title FROM seats_performances ORDER BY title LIMIT ?', limit)
  },
}
