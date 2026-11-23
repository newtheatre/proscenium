// The reasons a refund may be declined for, from the theatre's own list, for the Refunds screen.
// The reason a kept payment's refunds carry is given by the system only.
import { defineRoute } from '#kit'
import { listTerms } from '#modules/core'
import { KEPT_TERM } from '../../../keep'

export default defineRoute({ ability: 'payments.refund.approve', rateLimit: 'default' }, async () => ({
  reasons: (await listTerms('payments.refund-decline-reason')).filter(t => t.slug !== KEPT_TERM).map(t => ({ id: t.id, label: t.label })),
}))
