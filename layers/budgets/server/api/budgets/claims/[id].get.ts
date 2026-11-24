// One claim (BC-21): for its claimant, an approver of its lines, or view-all, whose read is audited.
// An approver also gets what they may decide, how far over budget it would go, and the marks.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { accountLabel } from '#modules/core'
import { eventsOf, heldBudgets, budgetsOf, isClaimant, itemsOf, mayView, requireClaim } from '../../../claims'
import { reviewOf } from '../../../claim-decisions'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  const items = await itemsOf(claim.id)
  if (!(await mayView(actor, claim, items))) refuse('core.not-found', 'There is no such claim.', { status: 404 })
  const mine = await isClaimant(claim, actor)
  const { held, any } = await heldBudgets(actor, budgetsOf(items))
  if (!mine && !held.size) unit.audit({ action: 'read', ability: 'budgets.claim.view-all', record: ['budgets.claim', claim.id] })
  const review = !mine && held.size ? await reviewOf(actor, claim) : null
  return {
    claim: { ...claim, claimant: claim.claimantId ? await accountLabel(claim.claimantId) : null },
    items,
    events: await eventsOf(claim.id),
    mine,
    review: review ? { yours: review.yours, overMinor: review.overMinor, marks: review.marks, any, awaitingSecond: review.awaitingSecond, mayApproveSecond: review.mayApproveSecond } : null,
    canVoid: !mine && claim.state === 'approved' && claim.paidMinor === 0 && (await can(actor, 'budgets.claim.approve-any')).allowed,
  }
})
