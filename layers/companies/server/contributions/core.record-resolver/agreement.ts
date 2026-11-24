// An agreement version, named by its number; its parent is the engagement, so grants there reach it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ version: number, engagement_id: string }>('SELECT version, engagement_id FROM companies_agreements WHERE id = ?', id)
    return row ? { title: `Agreement version ${row.version}`, parent: { type: 'companies.engagement', id: row.engagement_id } } : null
  },
}
