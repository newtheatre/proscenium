// front-of-house.leading-shift (part 3): on shift in a lead duty. The person running the night.
import { defineFact } from '#kit'
import { onShift, onShiftHolders, performanceOf } from '../authority'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const performanceId = await performanceOf(record)
  if (performanceId === null) return false
  const { holds, until } = await onShift(actor.accountId, performanceId, { lead: true })
  return { holds, until }
}, {
  holders: async (record) => {
    const performanceId = await performanceOf(record)
    return performanceId === null ? [] : onShiftHolders(performanceId, { lead: true })
  },
})
