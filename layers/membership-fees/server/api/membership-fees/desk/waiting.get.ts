// Applications waiting only for their fee, for the till's membership panel (P8): found by name or address.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { waitingFees } from '../../../desk'

export default defineRoute({ ability: 'membership-fees.payment.take', rateLimit: 'default' }, async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 100) // not-policy: shape bound
  return { fees: await waitingFees(q) }
})
