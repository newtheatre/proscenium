// A venue's name and address, for the command palette and record fields.
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ name: string }>('SELECT name FROM core_venues WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/core/venues/${id}` } : null
  },
} satisfies RecordResolver
