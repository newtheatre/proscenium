// Expenses in the members' area (BC-15): the person's own requests, open ones first, and the lines
// they may ask against.
import { defineRoute } from '#kit'
import { myRequests, offeredLines } from '../../../requests'

export default defineRoute({ ability: 'budgets.request.make', rateLimit: 'default' }, async (_event, { actor }) => ({
  requests: await myRequests(actor.accountId!),
  lines: await offeredLines(),
}))
