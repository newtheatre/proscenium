// A claim: named by its number, never by its words or its claimant, which are personal.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ number: string | null }>('SELECT number FROM budgets_claims WHERE id = ?', id)
    return row ? { title: row.number ?? 'Draft claim', to: `/console/budgets/claims/${id}` } : null
  },
}
