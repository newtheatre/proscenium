// A season's name, for the command palette and record fields. A season has no page of its own in the
// console, so its address is the productions list filtered to it.
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ name: string }>('SELECT name FROM core_seasons WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/programme/productions?seasonId=${encodeURIComponent(id)}` } : null
  },
} satisfies RecordResolver
