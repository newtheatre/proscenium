// A request's label is its title.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM availability_requests WHERE id = ?', id)
    return row ? { title: row.title, to: '/members/availability' } : null
  },
}
