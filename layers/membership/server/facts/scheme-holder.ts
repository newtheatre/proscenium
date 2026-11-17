// membership.scheme-holder: a current membership of one scheme ("life members may book the studio").
// Not a standing: a supporters' scheme can never open the members' area through it.
import { defineFact } from '#kit'
import { holders, holdsScheme } from '../memberships'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (!record || record.type !== 'membership.scheme' || !record.id) return false
  return holdsScheme(actor.accountId, record.id)
}, {
  holders: async record => (record?.type === 'membership.scheme' && record.id ? holders({ schemeId: record.id }) : []),
})
