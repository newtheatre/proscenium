// Who can see my availability (S6): each group I am in and who plans for it. Nothing about anyone else.
import { defineRoute } from '#kit'
import { groupsOf } from '../../planning'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) =>
  ({ groups: await groupsOf(actor.accountId!) }))
