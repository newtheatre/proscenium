// A fund's title and where funds are kept.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM fundraising_funds WHERE id = ?', id)
    return row ? { title: row.name, to: '/admin/modules/fundraising/funds' } : null
  },
}
