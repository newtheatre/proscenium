// A settlement's version; its parent is the engagement, so a grant on an engagement reaches it.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ engagement_id: string, title: string }>('SELECT s.engagement_id, e.title FROM companies_settlements s JOIN companies_engagements e ON e.id = s.engagement_id WHERE s.id = ?', id)
    return row ? { title: row.title, parent: { type: 'companies.engagement', id: row.engagement_id } } : null
  },
}
