// An engagement's title; its parent is the company, so a grant on a company reaches its engagements.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string, company_id: string }>('SELECT title, company_id FROM companies_engagements WHERE id = ?', id)
    return row ? { title: row.title, parent: { type: 'companies.company', id: row.company_id } } : null
  },
}
