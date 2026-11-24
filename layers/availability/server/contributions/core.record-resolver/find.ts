// A poll's label is its title; it opens on the organiser's results page.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM availability_finds WHERE id = ?', id)
    return row ? { title: row.title, to: `/members/find-a-time/${id}` } : null
  },
}
