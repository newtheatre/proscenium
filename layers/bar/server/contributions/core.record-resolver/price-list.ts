// A price list's title: its name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM bar_price_lists WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/bar/price-lists/${id}` } : null
  },
}
