// Availability (module `availability`): a person's own word on when they are free, read by people
// who plan for them (docs/specs/availability). This file grows with the build; it declares what the
// code so far uses.
import { z } from 'zod'
import { ability, code, defineAbilities, defineModule, defineRecords, defineSettings, event, point, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'availability.settings.manage'

export default defineModule({
  id: 'availability',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  // Part 6. Every number is a proposed default for the workshops.
  settings: defineSettings('availability', {
    'grid.step': setting.choice({ default: '30', options: ['15', '30', '60'], change, audience: 'signed-in' }),
    'entry.unmarked-default': setting.choice({ default: 'unknown', options: ['unknown', 'free'], change, audience: 'staff' }),
    'entry.horizon': setting.duration({ default: '12mo', min: '1mo', max: '24mo', units: ['month'], change, audience: 'signed-in' }),
  }),

  records: defineRecords('availability', {
    request: { table: 'availability_requests' },
  }),

  abilities: defineAbilities('availability', {
    // Entering one's own needs only a sign-in (A1). Reaches every member's time, so it is audited
    // on read; it never shows a reason (A7).
    'find.anyone': ability({ risk: 'privileged', audit: 'read' }),
    'request.send': ability({}),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    // A kind of group whose members can be planned for: a production's team, a rehearsal unit.
    'availability.group': point({ kind: 'code', contract: 'group' }),
  },

  tasks: {
    // Lapsing at the end of the due date (R5) and closing at the end of the period (R7).
    'availability.sweep-requests': task({ dailyAt: '04:30' }),
  },

  contributes: {
    'core.record-resolver': [{ id: 'availability.request', file: 'request' }],
    'core.notification-type': [{
      id: 'availability.request-opened',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/availability',
      variables: { title: 'text' as const, period: 'text' as const, due: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Please check your availability: {{ title }}',
          body: 'You have been asked to check your availability for **{{ title }}**, {{ period }}, by {{ due }}. Mark the times you cannot do, then press "This is right".',
          action: 'Check my availability',
        },
      },
    }],
  },

  // Ids and dates only: no levels or reasons leave the module in an event (A6).
  events: {
    announces: {
      'availability.entry.updated': event({ version: 1, payload: z.object({ accountId: z.string(), from: code(), to: code() }), internal: true }),
      'availability.request.opened': event({ version: 1, payload: z.object({ requestId: z.string() }), internal: true }),
      'availability.request.closed': event({ version: 1, payload: z.object({ requestId: z.string() }), internal: true }),
    },
  },
})
