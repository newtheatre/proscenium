// A choice's title: its name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM bar_choice_groups WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/bar/products?choice=${id}` } : null
  },
}
