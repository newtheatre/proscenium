// An award type's title and address, wherever records are listed.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM awards_types WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/awards/types/${id}` } : null
  },
}
