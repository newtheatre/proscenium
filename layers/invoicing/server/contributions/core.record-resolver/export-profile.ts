// An export profile's title and address.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM invoicing_export_profiles WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/invoicing/exports/${id}` } : null
  },
}
