// The reasons a refund may be declined for, from the theatre's own list, for the Refunds screen.
import { defineRoute } from '#kit'
import { listTerms } from '#modules/core'

export default defineRoute({ ability: 'payments.refund.approve', rateLimit: 'default' }, async () => ({
  reasons: (await listTerms('payments.refund-decline-reason')).map(t => ({ id: t.id, label: t.label })),
}))
