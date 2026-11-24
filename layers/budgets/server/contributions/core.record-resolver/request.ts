// A spending request: its line as parent, so a grant on the budget reaches it. Named by its line, not
// by its words, which are the requester's.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ lineId: string, line: string }>('SELECT r.line_id AS lineId, l.name AS line FROM budgets_spending_requests r JOIN budgets_lines l ON l.id = r.line_id WHERE r.id = ?', id)
    return row ? { title: row.line, to: '/console/budgets/approvals', parent: { type: 'budgets.line', id: row.lineId } } : null
  },
}
