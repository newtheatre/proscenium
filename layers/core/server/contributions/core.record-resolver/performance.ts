// A performance's title, address and parent: its production, so a grant on a production covers
// every one of its dates (part 6, "Scheduling and cancelling act on the production").
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ production_id: string, title: string }>(`SELECT f.production_id, p.title FROM core_performances f
      JOIN core_productions p ON p.id = f.production_id WHERE f.id = ?`, id)
    if (!row) return null
    return { title: row.title, to: `/console/programme/productions/${row.production_id}`, parent: { type: 'core.production', id: row.production_id } }
  },
} satisfies RecordResolver
