// front-of-house.rostered (part 3): a live assignment on a shift that has not finished. A standing,
// so it opens the members' area to someone whose only tie to the theatre is a coming shift.
import { defineFact } from '#kit'
import { rostered, rosteredHolders } from '../authority'

export default defineFact(async (actor) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const { holds, until } = await rostered(actor.accountId)
  return { holds, until }
}, { holders: () => rosteredHolders() })
