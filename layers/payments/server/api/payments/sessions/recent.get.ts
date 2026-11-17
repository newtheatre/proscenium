// The last twelve closed sessions in the theatre's currency, oldest first, for the chart on Till
// sessions: a till that is short every Friday shows as a pattern.
import { all, defineRoute, useSetting } from '#kit'
import { describeSessions } from '../../../sessions'

const RECENT = 12 // not-policy: how many sessions the chart draws

export default defineRoute({ ability: 'payments.session.view', rateLimit: 'default' }, async () => {
  const currency = await useSetting('core.locale.currency') as string
  const ids = await all<{ id: string }>("SELECT id FROM payments_sessions WHERE state = 'closed' AND counted_cash_minor IS NOT NULL AND currency = ? ORDER BY opened_at DESC LIMIT ?", currency, RECENT)
  return { sessions: (await describeSessions(ids.map(r => r.id))).reverse() }
})
