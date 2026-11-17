// A bar sale's title: its reference.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ reference: string }>('SELECT reference FROM bar_sales WHERE id = ?', id)
    return row ? { title: row.reference, to: `/console/bar/sales/${row.reference}` } : null
  },
}
