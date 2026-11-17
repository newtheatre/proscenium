// Front of house: who works each night, the authority a shift gives, and the record of the night
// (Front of house specification, parts 2 to 6). It requires only the core and calls no other
// module's services: figures from Box office and Payments arrive through its own points. This file
// grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettings, event, factDecl, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'front-of-house.settings.manage'
const shift = z.object({ shiftId: z.string(), performanceId: z.string().nullable() })
const assignment = z.object({ assignmentId: z.string(), shiftId: z.string(), accountId: z.string() })

export default defineModule({
  id: 'front-of-house',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  settings: defineSettings('front-of-house', {
    // Read when a shift is made or its times change; a later change does not move shifts that exist.
    'shifts.window-before': setting.duration({ default: '30m', min: '0m', max: '4h', change, audience: 'staff' }),
    'shifts.window-after': setting.duration({ default: '60m', min: '0m', max: '6h', change, audience: 'staff' }),
    'shifts.sign-up-closes': setting.duration({ default: '2h', min: '0m', max: '14d', change, audience: 'staff' }),
    'shifts.confirmation': setting.choice({ default: 'automatic', options: ['automatic', 'manager'], change, audience: 'staff' }),
  }),

  records: defineRecords('front-of-house', {
    shift: { table: 'front_of_house_shifts', parent: 'core.performance' },
    assignment: { table: 'front_of_house_assignments', parent: 'front-of-house.shift', owner: 'account_id' },
  }),

  abilities: defineAbilities('front-of-house', {
    'shift.sign-up': ability(),
    'shift.view': ability({ on: 'core.performance' }),
    'shift.manage': ability({ on: 'core.performance', implies: ['shift.view'] }),
    'duty.manage': ability(),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Authority follows the rota (part 3, "The three facts"). Every answer is read from stored times.
  facts: defineFacts('front-of-house', {
    'on-shift': factDecl({ on: 'core.performance', standing: true }),
    'leading-shift': factDecl({ on: 'core.performance' }),
    'rostered': factDecl({ standing: true }),
  }),

  tables,

  events: {
    announces: {
      'front-of-house.shift.published': event({ version: 1, payload: shift, internal: false }),
      // About a person, so internal (Foundations).
      'front-of-house.assignment.confirmed': event({ version: 1, payload: assignment, internal: true }),
    },
    listens: {
      'core.performance.rescheduled': 'move-shifts',
    },
  },

  contributes: {
    'core.record-resolver': [{ id: 'front-of-house.shift', file: 'shift' }, { id: 'front-of-house.assignment', file: 'assignment' }],
  },
})
