// The performance moved in time (part 3, "The shift window", rule 3): its shifts keep their offsets.
import { defineListener } from '#kit'
import { moveShifts } from '../shifts'

export default defineListener(async (event, unit) => {
  const p = event.payload as { performanceId: string, oldStartsAt: number, oldEndsAt: number, startsAt: number, endsAt: number }
  moveShifts(unit, { performanceId: p.performanceId, startDelta: p.startsAt - p.oldStartsAt, endDelta: p.endsAt - p.oldEndsAt })
})
