// membership.voter (MEM-09): a current membership of a scheme marked voting, held without a break for
// membership.voting.qualifying-period. No ballot is specified; this is the fact one would read, and
// any form or requirement can name it as fact:membership.voter.
import { defineFact } from '#kit'
import { voters, votes } from '../memberships'

export default defineFact(async (actor) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  return votes(actor.accountId)
}, {
  holders: voters,
})
