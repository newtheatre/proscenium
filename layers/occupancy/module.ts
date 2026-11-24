// Occupancy (Programme planning's question 1, decided (d); stories OC-01 to OC-03): the one read of
// a space's time that the programme board, the room calendar and the rehearsal planner all draw.
// A support module (C-65): it has no switch, and is on while a module that requires it is on.
import { defineModule } from '#kit'

export default defineModule({
  id: 'occupancy',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  support: true,
})
