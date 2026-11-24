// A meeting's label is its title; it opens on the meeting's page.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM availability_meetings WHERE id = ?', id)
    return row ? { title: row.title, to: `/members/availability/meetings/${id}` } : null
  },
}
