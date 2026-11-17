// The performance was cancelled (part 3, rule 4): every shift is cancelled, every live assignment
// released, and people are told once.
import { defineListener } from '#kit'
import { performanceCancelled } from '../rota'

export default defineListener(async (event, unit) => {
  await performanceCancelled(unit, (event.payload as { performanceId: string }).performanceId)
})
