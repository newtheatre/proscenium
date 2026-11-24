// A bookable's name: its space and venue from core, or a resource's own name. A space's bookable
// sits under the space, so a grant on a venue reaches it; a resource has no parent.
import { first } from '#kit'
import { placeOf } from '#modules/core'

export default {
  async resolve(id: string) {
    const row = await first<{ kind: string, name: string | null, space_id: string | null, space: string | null, venue: string | null }>(
      'SELECT b.kind, b.name, b.space_id, s.name AS space, v.name AS venue FROM spaces_bookables b LEFT JOIN core_spaces s ON s.id = b.space_id LEFT JOIN core_venues v ON v.id = s.venue_id WHERE b.id = ?', id)
    if (!row) return null
    const title = row.kind === 'space' ? placeOf(row.space ?? '', row.venue ?? '') : row.name ?? ''
    return { title, to: `/admin/modules/spaces/bookables/${id}`, ...(row.space_id ? { parent: { type: 'core.space', id: row.space_id } } : {}) }
  },
}
