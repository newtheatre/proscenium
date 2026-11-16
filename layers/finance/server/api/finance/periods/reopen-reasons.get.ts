// The reasons a period may be reopened for, from the theatre's own list, for the Periods screen.
import { defineRoute } from '#kit'
import { listTerms } from '#modules/core'

export default defineRoute({ ability: 'finance.period.reopen', rateLimit: 'default' }, async () => ({
  reasons: (await listTerms('finance.reopen-reason')).map(t => ({ id: t.id, label: t.label })),
}))
