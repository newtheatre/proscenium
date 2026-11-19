// The tickets one of the signed-in person's passes could cover (Matt, 19 November): tickets they
// already have for shows it covers, each ticked to begin with, on their passes page.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { coverChoicesFor, ownPass } from '../../../../../pass-covers'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const passId = await ownPass(getRouterParam(event, 'id')!, actor.accountId!)
  return coverChoicesFor(passId)
})
