// A template's name. It is started from under New form, so it leads to the forms list.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM forms_templates WHERE id = ?', id)
    return row ? { title: row.name, to: '/console/forms' } : null
  },
}
