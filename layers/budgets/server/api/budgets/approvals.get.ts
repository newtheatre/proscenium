// Approvals (BC-16): requests waiting on the person, oldest first, each with how far over budget
// approving it would go. Claims join the queue with their slice.
import { can, defineRoute } from '#kit'
import { waitingOn } from '../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({
  requests: await waitingOn(actor),
  approvesAny: (await can(actor, 'budgets.claim.approve-any')).allowed,
}))
