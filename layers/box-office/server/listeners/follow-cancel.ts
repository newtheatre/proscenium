// The performance was cancelled (BO-52): the decision recorded for its bookings is carried out.
import { defineListener } from '#kit'
import { performanceCancelled } from '../change'

export default defineListener(async (event, unit) => {
  await performanceCancelled(unit, (event.payload as { performanceId: string }).performanceId)
})
