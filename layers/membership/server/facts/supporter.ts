// membership.supporter: a current membership of any supporters' scheme. Never a standing: a Friend
// gets their benefits and never sees member things.
import { defineFact } from '#kit'
import { holders, holdsSide } from '../memberships'

export default defineFact(async (actor) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  return holdsSide(actor.accountId, 'audience')
}, {
  holders: () => holders({ side: 'audience' }),
})
