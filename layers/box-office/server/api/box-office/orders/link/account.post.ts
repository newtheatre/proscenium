// "Send me the link again" on a booking's page: emails the buyer the link that opens their account,
// if they have never signed in. Anyone holding the booking link may ask; the email goes only to the
// address on the booking. The answer says whether a link went: the page already shows whether the
// account is waiting to be opened, so it tells the holder nothing new.
import { getHeader } from 'h3'
import { z } from 'zod'
import { defineRoute, first } from '#kit'
import { sendClaimLink } from '#modules/core'
import { hashOf } from '../../../../codes'

export default defineRoute({ public: true, rateLimit: 'sign-in', input: z.object({}).strict() }, async (event, { unit }) => {
  const token = getHeader(event, 'x-order-token') ?? ''
  const order = token ? await first<{ account_id: string | null }>('SELECT account_id FROM box_office_orders WHERE link_token_hash = ? AND state <> \'basket\'', await hashOf(token)) : null
  if (!order?.account_id) return { sent: true, outcome: 'claimed' as const }
  return sendClaimLink(unit, order.account_id)
})
