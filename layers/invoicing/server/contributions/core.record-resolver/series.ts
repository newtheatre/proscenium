// A series' title and address.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM invoicing_series WHERE id = ?', id)
    return row ? { title: row.name, to: '/admin/modules/invoicing/series' } : null
  },
}
