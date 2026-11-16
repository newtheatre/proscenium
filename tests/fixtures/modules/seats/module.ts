// A test fixture, not a product module: just enough of a box office to prove the kit's guarantees.
import { z } from 'zod'
import { ability, call, defineAbilities, defineFacts, defineModule, factDecl, defineRecords, defineSettings, event, job, record, setting, task } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'seats',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  settings: defineSettings('seats', {
    'orders.max-seats': setting.integer({ default: 6, min: 1, max: 10, unit: 'seats.units.seats', change: 'seats.settings.manage' }),
  }),
  records: defineRecords('seats', { performance: record({ table: 'seats_performances' }) }),
  abilities: defineAbilities('seats', {
    'orders.sell': ability({ on: 'seats.performance' }),
    'settings.manage': ability({ risk: 'privileged', implies: ['orders.sell'] }),
    'members.look-up': ability({ audit: 'read' }),
  }),
  facts: defineFacts('seats', { regular: factDecl() }),
  tables,
  events: {
    announces: {
      'seats.performance.sold': event({ version: 1, payload: z.object({ performanceId: z.string(), quantity: z.number() }), internal: false }),
    },
  },
  jobs: {
    'seats.retry-flaky': job({ payload: z.object({ failTimes: z.number() }), retries: 3 }),
  },
  tasks: {
    'seats.count-seats': task({ dailyAt: '02:00' }),
  },
  calls: {
    'seats.take-payment': call({ reconcileAfter: '1m' }),
  },
  signing: [{ purpose: 'seats.door-code', rotateEvery: '90d', keepFor: '365d' }],
  contributes: {
    'core.requirement': [{ id: 'seats' }],
    // A file the server makes for a performance, readable only through core.file-access.
    'core.file-slot': [{ id: 'seats.door-list', owner: 'seats.performance', ability: 'seats.settings.manage', accepts: ['json'], limit: 'core.files.brand-limit', access: 'record', textClass: 'personal', clean: false, source: 'server' }],
    'core.file-access': [{ id: 'seats.performance', file: 'seats-performance' }],
    'core.operating-day': [{ id: 'seats.performances', table: 'seats_performances', key: 'id', instant: 'starts_at', day: 'operating_day', done: 'completed_at' }],
  },
})
