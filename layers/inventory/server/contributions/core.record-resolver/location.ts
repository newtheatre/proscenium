// A location's name, under its venue when it names one.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string, venue_id: string | null }>('SELECT name, venue_id FROM inventory_locations WHERE id = ?', id)
    if (!row) return null
    return { title: row.name, to: '/admin/modules/inventory/locations', ...(row.venue_id ? { parent: { type: 'core.venue', id: row.venue_id } } : {}) }
  },
}
