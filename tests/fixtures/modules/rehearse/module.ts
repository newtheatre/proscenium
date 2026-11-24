// A fixture for the support-module kind (C-65): it requires the support module occupancy, so
// switching it on brings occupancy on, and it reports rehearsal calls to core.space-busy.
import { defineModule } from '#kit'

export default defineModule({
  id: 'rehearse',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['occupancy'],
  contributes: { 'core.space-busy': [{ id: 'rehearse' }] },
})
