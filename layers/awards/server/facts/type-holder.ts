// awards.type-holder: a current award of one type ("fellows may book the studio"). Not a standing:
// it opens no members' area.
import { defineFact } from '#kit'
import { holders, holdsType } from '../awards'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (!record || record.type !== 'awards.type' || !record.id) return false
  return holdsType(actor.accountId, record.id)
}, {
  holders: async record => (record?.type === 'awards.type' && record.id ? holders(record.id) : []),
})
