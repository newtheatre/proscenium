// Refunds approved and waiting for a person to hand the money back (cash, or a card machine not
// connected to the site), for the till and Your session: anyone who takes payments may hand one back
// and confirm it, so the buyer is not left waiting for the treasurer. Oldest first; nothing for
// someone who does not take payments, so the till and Your session can always ask.
import { z } from 'zod'
import { all, can, defineRoute } from '#kit'
import { describeRefunds } from '../../../refunds'
import { providers } from '../../../providers'

const MOST = 50 // not-policy: one screen of refunds to hand back

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { actor }) => {
  if (!(await can(actor, 'payments.attempt.attest')).allowed) return { refunds: [] }
  const known = await providers()
  const rows = await all<{ id: string, provider: string }>(
    `SELECT r.id, pa.provider FROM payments_refunds r JOIN payments_attempts a ON a.id = r.attempt_id JOIN payments_provider_accounts pa ON pa.id = a.provider_account_id
      WHERE r.state = 'approved' ORDER BY r.created_at, r.id`)
  const ids = rows.filter(r => !known.get(r.provider)?.refund).slice(0, MOST).map(r => r.id)
  return { refunds: (await describeRefunds(ids)).map(r => ({ id: r.id, amountMinor: r.amountMinor, currency: r.currency, method: r.method, owner: r.owner, approvedByName: r.approvedByName, createdAt: r.createdAt })) }
})
