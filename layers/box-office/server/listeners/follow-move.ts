// The performance moved to another space (BO-53): ticket holders are told the new place, or refunded,
// as decided, and the performance takes the new space's usual seating layout.
import { defineListener } from '#kit'
import { performanceChanged } from '../change'
import { relayout } from '../layouts'

export default defineListener(async (event, unit) => {
  const { performanceId } = event.payload as { performanceId: string }
  await relayout(unit, performanceId)
  await performanceChanged(unit, performanceId, 'has moved to a new place')
})
