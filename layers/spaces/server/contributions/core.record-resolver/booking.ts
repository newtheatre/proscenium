// A room booking's label is its title; it sits under its bookable.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string, bookable_id: string }>('SELECT title, bookable_id FROM spaces_bookings WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/spaces/bookings/${id}`, parent: { type: 'spaces.bookable', id: row.bookable_id } } : null
  },
}
