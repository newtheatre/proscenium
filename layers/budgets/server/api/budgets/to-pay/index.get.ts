// Payments to make (BC-29): approved claims with money owed, not the payer's own, and the routes offered.
import { defineRoute, useSetting } from '#kit'
import { claimsToPay } from '../../../paying'

export default defineRoute({ ability: 'budgets.claim.pay', rateLimit: 'default' }, async (_event, { actor, unit }) => {
  const claims = await claimsToPay(actor)
  unit.audit({ action: 'read', ability: 'budgets.claim.view-all', detail: { toPay: claims.length } })
  return { claims, routes: await useSetting('budgets.claims.routes') as string[] }
})
