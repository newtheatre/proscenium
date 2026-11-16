// Box office: what is on sale, who holds which seats, orders and tickets (Box office specification,
// parts 2 to 6). It requires Payments, which collects and refunds, and Finance, where sales are
// posted. It names no module that provides a member price: that is a requirement reference checked
// through the kit. This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'box-office.settings.manage'
const performance = z.object({ performanceId: z.string() })

export default defineModule({
  id: 'box-office',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments', 'finance'],
  // Form builder joins this list with the checkout questions (R-17), once its module id exists.
  uses: ['front-of-house', 'communications'],

  settings: defineSettings('box-office', {
    'baskets.hold-for': setting.duration({ default: '10m', min: '2m', max: '60m', change, audience: 'public', quotable: true }),
    'orders.seat-cap': setting.integer({ default: 8, min: 1, max: 50, change, audience: 'public', quotable: true }),
    'sales.close-before': setting.duration({ default: '0m', min: '0m', max: '7d', change, audience: 'public', quotable: true }),
    'retention.holds': setting.duration({ default: '90d', min: '0d', max: '3650d', change, audience: 'staff' }),
  }),

  records: defineRecords('box-office', {
    'order': { table: 'box_office_orders', owner: 'account_id' },
    'ticket-type': { table: 'box_office_ticket_types' },
  }),
  abilities: defineAbilities('box-office', {
    'performance.manage': ability({ on: 'core.performance' }),
    'performance.exceed-venue': ability({ on: 'core.performance', risk: 'privileged' }),
    'pricing.manage': ability({ on: 'core.production' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      // Sale state is public: useful to a website or a listings feed.
      'box-office.performance.opened': event({ version: 1, payload: performance, internal: false }),
      'box-office.performance.paused': event({ version: 1, payload: performance, internal: false }),
    },
  },
})
