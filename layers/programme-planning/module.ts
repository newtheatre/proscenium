// Programme planning (module `programme-planning`; docs/specs/programme-planning): a season's
// programme worked out on a board before it is scheduled. This file grows with the build; it
// declares what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'programme-planning.plan.manage'
const entry = z.object({ entryId: z.string(), planId: z.string() })

export default defineModule({
  id: 'programme-planning',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  // Occupancy is the board's one read of a space's time (OC-01); it comes on with this module.
  requires: ['occupancy'],

  // Part 6. Every number is a proposed default for the workshops.
  settings: defineSettings('programme-planning', {
    'board.changeover': setting.duration({ default: '30m', min: '0m', max: '12h', change, audience: 'staff' }),
    'board.snap': setting.choice({ default: '5', options: ['5', '10', '15', '30'], change, audience: 'staff' }),
    'board.day-starts': setting.time({ default: '09:00', change, audience: 'staff' }),
    'board.day-ends': setting.time({ default: '00:00', change, audience: 'staff' }),
    'publish.productions': setting.boolean({ default: true, change, audience: 'staff' }),
    'notices.send': setting.choice({ default: 'automatic', options: ['automatic', 'manual'], change, audience: 'staff' }),
    'notices.gather': setting.duration({ default: '30m', min: '0m', max: '24h', change, audience: 'staff' }),
    'plans.close-after': setting.duration({ default: '1d', min: '0d', max: '90d', change, audience: 'staff' }),
    'retention.unsuccessful': setting.duration({ default: '730d', min: '182d', max: '2555d', change, audience: 'staff', onChange: 'confirm' }),
  }),

  records: defineRecords('programme-planning', {
    plan: { table: 'programme_planning_plans', parent: 'core.season' },
    entry: { table: 'programme_planning_entries', parent: 'programme-planning.plan', owner: 'applicant_account_id' },
  }),

  // Part 6. Who programmes is a grant on a season, so a festival's programmers cannot move the
  // autumn season's shows.
  abilities: defineAbilities('programme-planning', {
    'plan.view': ability({ on: 'core.season', audit: false }),
    'plan.manage': ability({ on: 'core.season', implies: ['plan.view', 'placement.manage', 'entry.manage'] }),
    'placement.manage': ability({ on: 'core.season', implies: ['plan.view'] }),
    'entry.view': ability({ on: 'programme-planning.plan', audit: false, implies: ['plan.view'] }),
    'entry.manage': ability({ on: 'programme-planning.plan', implies: ['entry.view'] }),
  }),

  tables,

  contributes: {
    'core.navigation': [
      { id: 'programme-planning.plans', menu: 'console', group: 'programme', section: 'everyday', to: '/console/programme', match: '/console/programme/plans', icon: 'i-lucide-layout-dashboard', ability: 'programme-planning.plan.view', order: 5 },
    ],
    'core.record-resolver': [
      { id: 'programme-planning.plan', file: 'plan' },
      { id: 'programme-planning.entry', file: 'entry' },
    ],
    // Part 6, presets (question 5): the programmer holds the module; others look.
    'core.role-preset': [
      { id: 'programme-planning.programmer', key: 'programmer', name: 'Programmer', description: 'Plans a season\'s programme on the board.', abilities: ['programme-planning.plan.manage'] },
    ],
  },

  events: {
    announces: {
      'programme-planning.plan.started': event({ version: 1, payload: z.object({ planId: z.string(), seasonId: z.string() }), internal: true }),
      'programme-planning.entry.added': event({ version: 1, payload: entry, internal: true }),
    },
  },
})
