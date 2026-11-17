// An award's title: the award's name and its year, never the person's name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ type_id: string, name: string, awarded_on: string }>('SELECT a.type_id, t.name, a.awarded_on FROM awards_awards a JOIN awards_types t ON t.id = a.type_id WHERE a.id = ?', id)
    return row ? { title: `${row.name}, ${row.awarded_on.slice(0, 4)}`, to: `/console/awards/${id}`, parent: { type: 'awards.type', id: row.type_id } } : null // not-policy: the year of a date
  },
}
