// A verification list's title and address.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM membership_verification_lists WHERE id = ?', id)
    return row ? { title: row.name, to: `/admin/modules/membership/lists/${id}` } : null
  },
}
