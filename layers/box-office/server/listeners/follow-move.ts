// The performance moved to another space (BO-53): ticket holders are told the new place, or refunded, as decided.
import { defineListener } from '#kit'
import { performanceChanged } from '../change'

export default defineListener(async (event, unit) => {
  await performanceChanged(unit, (event.payload as { performanceId: string }).performanceId, 'has moved to a new place')
})
