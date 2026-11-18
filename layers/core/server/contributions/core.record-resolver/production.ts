// A production's title and address, for the command palette and record fields.
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/programme/productions/${id}` } : null
  },
} satisfies RecordResolver
