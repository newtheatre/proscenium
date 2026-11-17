// Front of house: who works each night, the authority a shift gives, and the record of the night
// (Front of house specification, parts 2 to 6). It requires only the core and calls no other
// module's services: figures from Box office and Payments arrive through its own points. This file
// grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettings, event, factDecl, point, setting, task } from '#kit'
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
    // Inside this before the call time, giving up a place waits for cover or a manager.
    'shifts.release-notice': setting.duration({ default: '48h', min: '0m', max: '14d', change, audience: 'staff' }),
    // 0 turns a reminder off.
    'reminders.first': setting.duration({ default: '48h', min: '0m', max: '14d', change, audience: 'staff' }),
    'reminders.second': setting.duration({ default: '3h', min: '0m', max: '48h', change, audience: 'staff' }),
    // After the call time, when the board flags someone as not arrived.
    'shifts.late-after': setting.duration({ default: '30m', min: '5m', max: '2h', change, audience: 'staff' }),
    // Off by default: the board warns instead.
    'checklists.block-house-open': setting.boolean({ default: false, change, audience: 'staff' }),
  }),

  records: defineRecords('front-of-house', {
    'shift': { table: 'front_of_house_shifts', parent: 'core.performance' },
    'assignment': { table: 'front_of_house_assignments', parent: 'front-of-house.shift', owner: 'account_id' },
    'checklist-run': { table: 'front_of_house_checklist_runs', parent: 'core.performance' },
  }),

  abilities: defineAbilities('front-of-house', {
    'shift.sign-up': ability(),
    'shift.view': ability({ on: 'core.performance' }),
    'shift.manage': ability({ on: 'core.performance', implies: ['shift.view', 'assignment.check-in'] }),
    // Mark others arrived, record timings, extend tonight.
    'assignment.check-in': ability({ on: 'core.performance', implies: ['shift.view'] }),
    'checklist.complete': ability({ on: 'core.performance' }),
    'checklist.manage': ability(),
    'duty.manage': ability(),
    'emergency-card.view': ability(),
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
      'front-of-house.shift.cancelled': event({ version: 1, payload: shift, internal: false }),
      // About a person, so internal (Foundations).
      'front-of-house.assignment.confirmed': event({ version: 1, payload: assignment, internal: true }),
      // Released, withdrawn, declined or removed; the state is on the record.
      'front-of-house.assignment.released': event({ version: 1, payload: assignment, internal: true }),
      'front-of-house.checklist-run.completed': event({ version: 1, payload: z.object({ runId: z.string(), checklistId: z.string(), performanceId: z.string() }), internal: false }),
    },
    listens: {
      'core.performance.rescheduled': 'move-shifts',
      'core.performance.cancelled': 'cancel-shifts',
      'core.performance.moved': 'follow-move',
    },
  },

  tasks: {
    // At most two reminders before each call time; `reminded` keeps a re-run from repeating one.
    'front-of-house.remind-shifts': task({ every: '15m' }),
  },

  // Other modules' parts of the board and the night report. Front of house calls none of them.
  points: {
    'front-of-house.tonight-figure': point({ kind: 'code', contract: 'tonight-figure' }),
    'front-of-house.report-section': point({ kind: 'code', contract: 'report-section' }),
  },

  contributes: {
    'core.record-resolver': [
      { id: 'front-of-house.shift', file: 'shift' },
      { id: 'front-of-house.assignment', file: 'assignment' },
      { id: 'front-of-house.checklist-run', file: 'checklist-run' },
    ],
    'core.vocabulary': [{
      id: 'front-of-house.exception-reason',
      label: 'Reasons a checklist item could not be done',
      terms: [
        { slug: 'broken', label: 'Broken' },
        { slug: 'missing', label: 'Missing' },
        { slug: 'not-safe', label: 'Not safe' },
        { slug: 'no-time', label: 'No time' },
        { slug: 'other', label: 'Other' },
      ],
    }],
    'core.notification-topic': [{ id: 'front-of-house.cover-needed', side: 'members' as const, order: 60 }],
    // Messages to people on the rota about their own shifts, so none can be switched off.
    'core.notification-type': [{
      id: 'front-of-house.shift-changed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift has a new time: {{ show }}',
          body: 'Your {{ duty }} shift for **{{ show }}** has moved. Please now arrive by **{{ when }}**.\n\nIf you can no longer do it, you can give it up without the usual notice.',
        },
      },
    }, {
      id: 'front-of-house.shift-moved',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, where: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift has moved: {{ show }}',
          body: 'The performance of **{{ show }}** you are on as {{ duty }} has moved to **{{ where }}**. Please arrive there by {{ when }}.\n\nIf you can no longer do it, you can give it up without the usual notice.',
        },
      },
    }, {
      id: 'front-of-house.shift-cancelled',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Shift cancelled: {{ show }}',
          body: 'Your shift for **{{ show }}** on {{ when }} has been cancelled, so you are no longer needed. Thank you for signing up.',
        },
      },
    }, {
      id: 'front-of-house.shift-confirmed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You are on the rota: {{ show }}',
          body: 'Thank you. You are confirmed as {{ duty }} for **{{ show }}**. Please arrive by **{{ when }}**.\n\nIf you find you cannot do it, give it up as early as you can from your shifts, so someone else can take it.',
        },
      },
    }, {
      id: 'front-of-house.shift-reminder',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Reminder: your shift for {{ show }}',
          body: 'A reminder that you are on as {{ duty }} for **{{ show }}**. Please arrive by **{{ when }}**.',
        },
      },
    }, {
      id: 'front-of-house.shift-removed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You are no longer on a shift: {{ show }}',
          body: 'You have been taken off the {{ duty }} shift for **{{ show }}** on {{ when }}, so you are not needed then. If you were not expecting this, ask the front-of-house manager.',
        },
      },
    }, {
      id: 'front-of-house.cover-taken',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift is covered: {{ show }}',
          body: 'Someone has taken your {{ duty }} shift for **{{ show }}** on {{ when }}, so you are no longer needed then.',
        },
      },
    }, {
      // To managers. Members following the topic are told once Communications can name who is eligible.
      id: 'front-of-house.cover-needed',
      category: 'optional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      topic: 'front-of-house.cover-needed',
      link: '/members/front-of-house/open',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Cover needed: {{ duty }}, {{ show }}',
          body: 'Someone on the {{ duty }} shift for **{{ show }}** on {{ when }} has asked to give up their place. It stays theirs until someone takes it.',
        },
      },
    }],
  },
})
