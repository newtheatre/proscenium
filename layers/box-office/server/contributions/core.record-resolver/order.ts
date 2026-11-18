// An order's title and address: its booking reference, never the buyer's name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ reference: string }>('SELECT reference FROM box_office_orders WHERE id = ?', id)
    return row ? { title: `Order ${row.reference}`, to: `/console/box-office/orders/${id}` } : null
  },
}
