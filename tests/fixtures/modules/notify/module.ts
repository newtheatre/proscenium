// A second test fixture: listens to seats.sold, so events cross a module boundary.
import { defineModule } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'notify',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['seats'],
  tables,
  events: { listens: { 'seats.performance.sold': 'on-sold' } },
})
