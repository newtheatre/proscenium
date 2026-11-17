// A form's title and where it is built.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM forms_forms WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/forms/${id}` } : null
  },
}
