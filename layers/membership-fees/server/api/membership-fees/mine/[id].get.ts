// The Pay page (tab 5, "Pay"): the holder's application, what it costs and whether it is waiting for
// the payment now, and whether this site takes payment online.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { methodsFor } from '#modules/payments'
import { chargeOf } from '../../../charges'
import { ownApplication } from '../../../paying'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const application = await ownApplication(getRouterParam(event, 'id')!, actor.accountId!)
  const charge = await chargeOf(application.id)
  const membershipState = application.state
  return {
    membershipId: application.id,
    schemeName: application.schemeName,
    state: membershipState === 'active' ? 'paid' : membershipState !== 'pending' ? 'closed' : application.waitingOnStaff ? 'checking' : charge?.state === 'open' ? 'to-pay' : charge?.state === 'paid' ? 'paid' : 'closed',
    amountMinor: charge?.amount_minor ?? null,
    currency: charge?.currency ?? null,
    expiresAt: application.expiresAt,
    online: (await methodsFor('online')).length > 0,
  }
})
