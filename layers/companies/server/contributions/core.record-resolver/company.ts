// A company's name. Its screens come with the slices after the gate.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM companies_companies WHERE id = ?', id)
    return row ? { title: row.name } : null
  },
}
