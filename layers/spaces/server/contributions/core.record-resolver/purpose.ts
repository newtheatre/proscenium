// A purpose's label is its name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM spaces_purposes WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/spaces/purposes` } : null
  },
}
