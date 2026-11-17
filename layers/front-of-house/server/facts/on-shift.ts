// front-of-house.on-shift (part 3): authority to work one performance while the shift's window is
// open. A standing, so asked with no record it answers for any performance now.
import { defineFact } from '#kit'
import { onShift, onShiftHolders, performanceOf } from '../authority'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const performanceId = await performanceOf(record)
  if (performanceId === null) return false
  const { holds, until } = await onShift(actor.accountId, performanceId)
  return { holds, until }
}, {
  holders: async (record) => {
    const performanceId = await performanceOf(record)
    return performanceId === null ? [] : onShiftHolders(performanceId)
  },
})
