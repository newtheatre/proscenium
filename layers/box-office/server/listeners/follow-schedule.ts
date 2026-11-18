// A performance was scheduled (S1, S2): it takes the rest of its run's set-up, or its ticket preset
// when it is the production's first, and goes on sale with the run if the run is on sale.
import { defineListener } from '#kit'
import { setUpFromRun } from '../run-setup'

export default defineListener(async (event, unit) => {
  await setUpFromRun(unit, (event.payload as { performanceId: string }).performanceId)
})
