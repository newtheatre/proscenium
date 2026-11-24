// A campaign's title and its console page.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string }>('SELECT title FROM fundraising_campaigns WHERE id = ?', id)
    return row ? { title: row.title, to: `/console/fundraising/campaigns/${id}` } : null
  },
}
