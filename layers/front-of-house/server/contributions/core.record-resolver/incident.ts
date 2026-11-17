// An incident's title is its number and kind, never what happened. It has no parent: grants on a
// performance do not reach incidents.
import { first } from '#kit'
import { reference } from '../../incidents'

export default {
  async resolve(id: string) {
    const row = await first<{ year: number, number: number, kind: string }>('SELECT year, number, kind FROM front_of_house_incidents WHERE id = ?', id)
    if (!row) return null
    return { title: `${reference(row.year, row.number)} (${row.kind === 'near_miss' ? 'near miss' : 'incident'})`, to: `/console/front-of-house/incidents/${id}` }
  },
}
