// Expenses in the members' area (BC-15, BC-19): the person's own claims and requests, open ones first,
// with the lines and categories they may choose and their approved requests a claim may fulfil.
import { can, defineRoute, refuse } from '#kit'
import { myRequests, offeredLines } from '../../requests'
import { myClaims } from '../../claims'
import { listCategories } from '../../categories'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const canClaim = (await can(actor, 'budgets.claim.make')).allowed
  const canRequest = (await can(actor, 'budgets.request.make')).allowed
  if (!canClaim && !canRequest) refuse('core.access.denied', 'You cannot make claims or requests.', { status: 403 })
  const requests = await myRequests(actor.accountId!)
  return {
    canClaim,
    canRequest,
    claims: canClaim ? await myClaims(actor.accountId!) : [],
    requests,
    lines: await offeredLines(),
    categories: (await listCategories()).filter(c => !c.archivedAt).map(c => ({ id: c.id, name: c.name, description: c.description })),
  }
})
