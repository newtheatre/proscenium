// An invoice's title and address: its number once issued, else "Draft for" its party.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ number: string | null, name: string }>('SELECT number, bill_to_name AS name FROM invoicing_invoices WHERE id = ?', id)
    return row ? { title: row.number ?? `Draft for ${row.name}`, to: `/console/invoicing/invoices/${id}` } : null
  },
}
