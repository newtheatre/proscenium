// membership.holder: a current membership of any members' scheme. A standing, so it opens the
// members' area through core.member, and closes it the day after the end of grace with nothing run.
import { defineFact } from '#kit'
import { holders, holdsSide } from '../memberships'

export default defineFact(async (actor) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  return holdsSide(actor.accountId, 'members')
}, {
  holders: () => holders({ side: 'members' }),
})
