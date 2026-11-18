// The performance moved in time (part 3, "The shift window", rule 3): its shifts keep their offsets,
// and everyone on one is told the new call time.
import { defineListener } from '#kit'
import { moveShifts } from '../shifts'
import { performanceRescheduled } from '../rota'

export default defineListener(async (event, unit) => {
  const p = event.payload as { performanceId: string, oldStartsAt: number, oldEndsAt: number, startsAt: number, endsAt: number }
  const startDelta = p.startsAt - p.oldStartsAt
  moveShifts(unit, { performanceId: p.performanceId, startDelta, endDelta: p.endsAt - p.oldEndsAt })
  await performanceRescheduled(unit, p.performanceId, { startDelta, endDelta: p.endsAt - p.oldEndsAt }, event.id)
})
