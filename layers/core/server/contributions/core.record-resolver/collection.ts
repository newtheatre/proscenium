// A collection's name and its console page, for the command palette and record fields.
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ name: string }>('SELECT name FROM core_collections WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/programme/collections/${encodeURIComponent(id)}` } : null
  },
} satisfies RecordResolver
