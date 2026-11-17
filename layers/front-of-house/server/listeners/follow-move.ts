// The performance moved to another place: the shifts take its venue, and people are told. The
// default rota template is not reapplied (part 4).
import { defineListener } from '#kit'
import { performanceMoved } from '../rota'

export default defineListener(async (event, unit) => {
  await performanceMoved(unit, (event.payload as { performanceId: string }).performanceId, event.id)
})
