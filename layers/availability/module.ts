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
  // Find a time shows when the chosen rooms are taken (F5).
  requires: ['occupancy'],
  since: '0.1.0',
  stability: 'experimental',

  // Part 6. Every number is a proposed default for the workshops.
  settings: defineSettings('availability', {
    'grid.step': setting.choice({ default: '30', options: ['15', '30', '60'], change, audience: 'signed-in' }),
    'grid.day-starts': setting.time({ default: '09:00', min: '00:00', max: '12:00', change, audience: 'signed-in' }),
    'grid.day-ends': setting.time({ default: '23:00', min: '15:00', max: '23:59', change, audience: 'signed-in' }),
    'entry.unmarked-default': setting.choice({ default: 'unknown', options: ['unknown', 'free'], change, audience: 'staff' }),
    'entry.horizon': setting.duration({ default: '12mo', min: '1mo', max: '24mo', units: ['month'], change, audience: 'signed-in' }),
    'requests.default-due': setting.duration({ default: '7d', min: '1d', max: '60d', units: ['day'], change, audience: 'staff' }),
    'requests.first-reminder': setting.duration({ default: '3d', min: '0d', max: '14d', units: ['day'], change, audience: 'staff' }),
    'requests.second-reminder': setting.duration({ default: '1d', min: '0d', max: '7d', units: ['day'], change, audience: 'staff' }),
    'retention.past': setting.duration({ default: '90d', min: '0d', max: '730d', units: ['day'], change, audience: 'staff', onChange: 'confirm' }),
    'retention.history': setting.duration({ default: '12mo', min: '3mo', max: '36mo', units: ['month'], change, audience: 'staff', onChange: 'confirm' }),
  }),

  records: defineRecords('availability', {
    request: { table: 'availability_requests' },
  }),

  abilities: defineAbilities('availability', {
    // Entering one's own needs only a sign-in (A1). Reaches every member's time, so it is audited
    // on read; it never shows a reason (A7).
    'find.anyone': ability({ risk: 'privileged', audit: 'read' }),
    // Find a time for groups one plans for; the group check does the real work (F1).
    'find.use': ability({}),
    'request.send': ability({}),
    // A8: busy or maybe for a member of a group one plans for; the group check limits it.
    'entry.on-behalf': ability({}),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    // A kind of group whose members can be planned for: a production's team, a rehearsal unit.
    'availability.group': point({ kind: 'code', contract: 'group' }),
  },

  tasks: {
    // Joiners and leavers (R2, R6), past exceptions and old requests (retention), lapsing at the end of the due date (R5) and closing at the end of the period (R7).
    'availability.sweep-requests': task({ dailyAt: '04:30' }),
    // Reminders before the due date (R3).
    'availability.send-reminders': task({ every: '1h' }),
  },

  contributes: {
    'core.navigation': [
      { id: 'availability.mine', menu: 'members', to: '/members/availability', icon: 'i-lucide-calendar-check', order: 45 },
      { id: 'availability.find', menu: 'members', to: '/members/find-a-time', icon: 'i-lucide-calendar-search', ability: 'availability.find.use', order: 46 },
      { id: 'availability.requests', menu: 'members', to: '/members/find-a-time/requests', icon: 'i-lucide-send', ability: 'availability.request.send', order: 47 },
    ],
    'core.record-resolver': [{ id: 'availability.request', file: 'request' }],
    'core.notification-type': [{
      id: 'availability.request-opened',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/availability/requests',
      variables: { title: 'text' as const, period: 'text' as const, due: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Please check your availability: {{ title }}',
          body: 'You have been asked to check your availability for **{{ title }}**, {{ period }}, by {{ due }}. Mark the times you cannot do, then press "This is right".',
          action: 'Check my availability',
        },
      },
    }, {
      id: 'availability.entry-added-for-you',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/availability',
      variables: { planner: 'text' as const, period: 'text' as const, level: 'text' as const },
      wording: {
        'en-GB': {
          subject: '{{ planner }} marked you {{ level }}',
          body: '{{ planner }} marked you **{{ level }}** for {{ period }} on your availability. If that is wrong, you can change or remove it.',
          action: 'See my availability',
        },
      },
    }, {
      id: 'availability.request-reminder',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/availability/requests',
      variables: { title: 'text' as const, period: 'text' as const, due: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Reminder: please check your availability for {{ title }}',
          body: 'Please check your availability for **{{ title }}**, {{ period }}, by {{ due }}. Mark the times you cannot do, then press "This is right". If nothing has changed, pressing it is enough.',
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
