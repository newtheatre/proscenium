// A fixture step source for Training's tests (amended part 9): shifts worked alongside someone, held
// in memory, so Training's activity steps are tested without Front of house built.
import { z } from 'zod'
import { defineModule, event } from '#kit'

export default defineModule({
  id: 'stint',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['training'],
  events: {
    announces: {
      'stint.shift.confirmed': event({ version: 1, payload: z.object({ shiftId: z.string(), accountId: z.string() }), internal: true }),
    },
  },
  contributes: { 'training.step-source': [{ id: 'stint.shift', file: 'shift' }] },
})
