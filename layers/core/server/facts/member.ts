// core.member: the person holds at least one standing now (identity part 6). The members' area
// shows while this is true and the area is switched on.
import { defineFact } from '#kit'
import { hasStanding, standingHolders } from '../identity/standings'

export default defineFact(actor => hasStanding(actor), {
  holders: async () => (await standingHolders()).accountIds,
})
