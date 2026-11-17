// A scheme's title and address, wherever records are listed.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM membership_schemes WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/membership/schemes/${id}` } : null
  },
}
