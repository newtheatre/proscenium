// Approvals (BC-16, BC-21): requests and claims waiting on the person, oldest first, each with how far
// over budget approving it would go, and claims with their late and "not asked first" marks.
import { can, defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import { waitingOn } from '../../requests'
import { claimsWaitingOn } from '../../claim-decisions'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const claims = []
  for (const claim of await claimsWaitingOn(actor)) claims.push({ ...claim, claimant: claim.claimantId ? await accountLabel(claim.claimantId) : null })
  return {
    requests: await waitingOn(actor),
    claims,
    approvesAny: (await can(actor, 'budgets.claim.approve-any')).allowed,
  }
})
