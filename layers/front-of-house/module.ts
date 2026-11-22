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
    // What volunteer hours are counted from: the shift's times, or check-in to check-out.
    'hours.count-from': setting.choice({ default: 'scheduled', options: ['scheduled', 'checked'], change, audience: 'staff' }),
    // After the performance ends, when an unsigned report is chased.
    'night-report.sign-off-by': setting.duration({ default: '12h', min: '1h', max: '7d', change, audience: 'staff' }),
    'night-report.auto-distribute': setting.boolean({ default: true, change, audience: 'staff' }),
    // When an incident nobody has opened is flagged.
    'incidents.review-within': setting.duration({ default: '72h', min: '1h', max: '30d', change, audience: 'staff' }),
    // At or above this, managers are told at once; below, in the daily digest.
    'incidents.immediate-severity': setting.choice({ default: 'serious', options: ['minor', 'moderate', 'serious'], change, audience: 'staff' }),
    // Shortening one deletes records at the next sweep, which cannot be undone: so it asks again.
    'retention.assignments': setting.duration({ default: '2y', min: '6mo', max: '7y', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'retention.checklists': setting.duration({ default: '1y', min: '3mo', max: '7y', change, audience: 'staff', onChange: 'confirm' }),
    'retention.incidents': setting.duration({ default: '3y', min: '1y', max: '10y', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'retention.incidents-child': setting.duration({ default: '21y', min: '3y', max: '25y', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    // When the health check warns that a venue's emergency card is stale.
    'emergency.review-every': setting.duration({ default: '1y', min: '1mo', max: '3y', change, audience: 'staff' }),
  }),

  records: defineRecords('front-of-house', {
    'shift': { table: 'front_of_house_shifts', parent: 'core.performance' },
    'assignment': { table: 'front_of_house_assignments', parent: 'front-of-house.shift', owner: 'account_id' },
    'checklist-run': { table: 'front_of_house_checklist_runs', parent: 'core.performance' },
    'incident': { table: 'front_of_house_incidents', owner: 'reported_by' },
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
    // The reporter sees their own reports in limited form: the service limits what, not the ability.
    'night-report.write': ability({ on: 'core.performance', implies: ['shift.view'] }),
    'night-report.sign-off': ability({ on: 'core.performance', implies: ['night-report.write'] }),
    'night-report.view': ability({ on: 'core.performance' }),
    'hours.view': ability({ audit: 'read' }),
    'incident.report': ability({ on: 'front-of-house.incident', owner: 'grants' }),
    'incident.view': ability({ on: 'front-of-house.incident', risk: 'privileged', audit: 'read' }),
    'incident.manage': ability({ on: 'front-of-house.incident', risk: 'privileged', implies: ['incident.view'] }),
    // Search for and redact a person with no account, for a data request. Each search is audited.
    'incident.redact-person': ability({ risk: 'privileged', fresh: true, audit: 'read', implies: ['incident.view'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Authority follows the rota (part 3, "The three facts"). Every answer is read from stored times.
  facts: defineFacts('front-of-house', {
    // Each brings the abilities part 7 suggests, mapped when the module is first switched on (FH-4).
    'on-shift': factDecl({ on: 'core.performance', standing: true, defaults: ['front-of-house.shift.view', 'front-of-house.checklist.complete', 'front-of-house.incident.report'] }),
    'leading-shift': factDecl({ on: 'core.performance', defaults: ['front-of-house.assignment.check-in', 'front-of-house.night-report.sign-off'] }),
    'rostered': factDecl({ standing: true, defaults: ['front-of-house.emergency-card.view'] }),
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
      // Never offered to webhooks: who was involved is not for outside systems.
      'front-of-house.incident.reported': event({ version: 1, payload: z.object({ incidentId: z.string(), severity: z.enum(['minor', 'moderate', 'serious']) }), internal: true }),
      'front-of-house.incident.closed': event({ version: 1, payload: z.object({ incidentId: z.string() }), internal: true }),
      // Nothing financial waits on it.
      'front-of-house.night-report.signed-off': event({ version: 1, payload: z.object({ performanceId: z.string() }), internal: false }),
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
    // Reminds action owners and sends the incident digest.
    'front-of-house.chase-actions': task({ dailyAt: '09:00' }),
    // Completes shifts past their window and opens tonight's draft reports.
    'front-of-house.close-shifts': task({ every: '15m' }),
    'front-of-house.chase-night-reports': task({ dailyAt: '10:00' }),
    // The retention sweep, once a day.
    'front-of-house.sweep-retention': task({ dailyAt: '04:20' }),
  },

  // Other modules' parts of the board and the night report. Front of house calls none of them.
  points: {
    'front-of-house.tonight-figure': point({ kind: 'code', contract: 'tonight-figure' }),
    'front-of-house.report-section': point({ kind: 'code', contract: 'report-section' }),
    // Who is coming tonight needing help, for the lead's Needs tonight panel (AC-1).
    'front-of-house.tonight-needs': point({ kind: 'code', contract: 'tonight-needs' }),
  },

  contributes: {
    // Front of house's lines of the privacy notice's "what we hold" table (/policies/privacy).
    'core.privacy-record': [
      { id: 'front-of-house.assignments', holds: 'Shifts you signed up for, whether you came and the hours you gave', why: 'To run performances safely and recognise volunteers\' time', basis: 'Our legitimate interests in staffing performances', keptFor: 'front-of-house.retention.assignments', order: 200 },
      { id: 'front-of-house.incidents', holds: 'Accident and incident records', why: 'Health and safety law requires them', basis: 'A legal duty, and to protect life', keptFor: 'front-of-house.retention.incidents', order: 210 },
      { id: 'front-of-house.incidents-child', holds: 'Accident and incident records involving a child', why: 'Health and safety law requires them', basis: 'A legal duty, and to protect life', keptFor: 'front-of-house.retention.incidents-child', order: 220 },
    ],
    'core.record-resolver': [
      { id: 'front-of-house.shift', file: 'shift' },
      { id: 'front-of-house.assignment', file: 'assignment' },
      { id: 'front-of-house.checklist-run', file: 'checklist-run' },
      { id: 'front-of-house.incident', file: 'incident' },
    ],
    'core.vocabulary': [{
      id: 'front-of-house.incident-category',
      label: 'Kinds of incident',
      terms: [
        { slug: 'slip-or-fall', label: 'Slip or fall' },
        { slug: 'illness', label: 'Illness' },
        { slug: 'behaviour', label: 'Behaviour' },
        { slug: 'fire-alarm', label: 'Fire alarm' },
        { slug: 'building', label: 'Building' },
        { slug: 'lost-child', label: 'Lost child' },
        { slug: 'other', label: 'Other' },
      ],
    }, {
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
    'core.navigation': [
      { id: 'front-of-house.shifts', menu: 'members', to: '/members/front-of-house', icon: 'i-lucide-calendar-clock', ability: 'front-of-house.shift.sign-up', order: 30 },
      // The reporter's own incidents (FH-8): shown once they have reported one.
      { id: 'front-of-house.my-reports', menu: 'members', to: '/members/front-of-house/reports', icon: 'i-lucide-shield-alert', ability: 'front-of-house.incident.report', order: 31, count: 'front-of-house.my-reports', hideEmpty: true },
      { id: 'front-of-house.tonight', menu: 'live', to: '/live/front-of-house', icon: 'i-lucide-drama', ability: ['front-of-house.shift.view', 'front-of-house.incident.report', 'front-of-house.emergency-card.view'], order: 10 },
      { id: 'front-of-house.rota', menu: 'console', group: 'front-of-house', section: 'everyday', to: '/console/front-of-house/rota', icon: 'i-lucide-calendar-range', ability: 'front-of-house.shift.view', order: 10 },
      { id: 'front-of-house.incidents', menu: 'console', group: 'front-of-house', section: 'everyday', to: '/console/front-of-house/incidents', icon: 'i-lucide-shield-alert', ability: 'front-of-house.incident.view', order: 20 },
      { id: 'front-of-house.night-reports', menu: 'console', group: 'front-of-house', section: 'everyday', to: '/console/front-of-house/night-reports', icon: 'i-lucide-notebook-pen', ability: 'front-of-house.night-report.view', order: 30 },
      { id: 'front-of-house.hours', menu: 'console', group: 'front-of-house', section: 'everyday', to: '/console/front-of-house/hours', icon: 'i-lucide-clock', ability: 'front-of-house.hours.view', order: 40 },
      { id: 'front-of-house.duties', menu: 'admin', group: 'modules', to: '/admin/modules/front-of-house/duties', icon: 'i-lucide-badge-check', ability: 'front-of-house.duty.manage', order: 60 },
      { id: 'front-of-house.rota-templates', menu: 'admin', group: 'modules', to: '/admin/modules/front-of-house/rota-templates', icon: 'i-lucide-layout-list', ability: 'front-of-house.duty.manage', order: 70 },
      { id: 'front-of-house.checklists', menu: 'admin', group: 'modules', to: '/admin/modules/front-of-house/checklists', icon: 'i-lucide-list-checks', ability: 'front-of-house.checklist.manage', order: 80 },
      { id: 'front-of-house.emergency-cards', menu: 'admin', group: 'modules', to: '/admin/modules/front-of-house/emergency-cards', icon: 'i-lucide-siren', ability: 'front-of-house.emergency-card.view', order: 90 },
    ],
    // Coming performances with no rota yet, on the console home of whoever runs the rota.
    // and the members' home card: the person's next shift and the open ones (AC-7).
    'core.count': [{ id: 'front-of-house.unrostered', file: 'unrostered' }, { id: 'front-of-house.members-home', file: 'members-home' }, { id: 'front-of-house.my-reports', file: 'my-reports' }],
    'core.home-card': [
      { id: 'front-of-house.unrostered', home: 'console', ability: 'front-of-house.shift.manage', component: 'FrontOfHouseUnrosteredCard', urgency: 'today', count: 'front-of-house.unrostered' },
      { id: 'front-of-house.shifts', home: 'members', ability: 'front-of-house.shift.sign-up', component: 'FrontOfHouseShiftsCard', urgency: 'info', count: 'front-of-house.members-home' },
    ],
    // Experience on the rota, for a duty's requirements (FH-5).
    'core.requirement': [{ id: 'front-of-house', file: 'front-of-house' }],
    // The roles part 7 suggests, made when the module is first switched on (FH-4).
    'core.role-preset': [
      { id: 'front-of-house.volunteer', key: 'volunteer', name: 'Volunteer', description: 'Signs up for shifts, reports incidents and opens the emergency card.', abilities: ['front-of-house.shift.sign-up', 'front-of-house.incident.report', 'front-of-house.emergency-card.view'], opensMembersArea: true },
      { id: 'front-of-house.manager', key: 'front-of-house-manager', name: 'Front of house manager', description: 'Runs the rota, duties and checklists, reviews incidents and reads night reports and hours.', abilities: ['front-of-house.shift.manage', 'front-of-house.checklist.manage', 'front-of-house.duty.manage', 'front-of-house.incident.manage', 'front-of-house.night-report.sign-off', 'front-of-house.night-report.view', 'front-of-house.hours.view', 'front-of-house.emergency-card.view'], opensMembersArea: true },
    ],
    'core.merge-handler': [{ id: 'front-of-house.assignments', file: 'assignments' }],
    'core.upcoming': [{ id: 'front-of-house.shifts', file: 'shifts' }],
    'core.erasure-hold': [{ id: 'front-of-house.incident-open', file: 'incident-open' }],
    'core.export-contributor': [{ id: 'front-of-house.reported-incidents', file: 'reported-incidents' }],
    'core.health-check': [{ id: 'front-of-house.emergency-cards', file: 'emergency-cards' }, { id: 'front-of-house.incidents-unopened', file: 'incidents-unopened' }],
    'core.notification-topic': [
      { id: 'front-of-house.cover-needed', side: 'members' as const, order: 60 },
      { id: 'front-of-house.night-reports', side: 'members' as const, order: 61 },
      { id: 'front-of-house.rota-published', side: 'members' as const, order: 59 },
    ],
    // Messages to people on the rota about their own shifts, so none can be switched off.
    'core.notification-type': [{
      id: 'front-of-house.shift-changed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const, details: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift has a new time: {{ show }}, {{ date }}',
          body: 'Your {{ duty }} shift for **{{ show }}** has moved. Please now arrive by **{{ when }}**.\n\n{{ details }}\n\nIf you can no longer do it, you can give it up at any time without the usual notice.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-moved',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const, where: 'text' as const, details: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift has moved: {{ show }}, {{ date }}',
          body: 'The performance of **{{ show }}** you are on as {{ duty }} has moved to **{{ where }}**. Please arrive there by {{ when }}.\n\n{{ details }}\n\nIf you can no longer do it, you can give it up at any time without the usual notice.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-cancelled',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Shift cancelled: {{ show }}, {{ date }}',
          body: 'Your shift for **{{ show }}** on {{ when }} has been cancelled, so you are no longer needed. Thank you for signing up.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-confirmed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const, details: 'text' as const, calendar: 'url' as const },
      wording: {
        'en-GB': {
          subject: 'You are on the rota: {{ show }}, {{ date }}',
          body: 'Thank you. You are confirmed as {{ duty }} for **{{ show }}**. Please arrive by **{{ when }}**.\n\n{{ details }}\n\n[Add to calendar]({{ calendar }})\n\nIf you find you cannot do it, give it up as early as you can from your shifts, so someone else can take it.',
          action: 'See my shifts',
        },
      },
    }, {
      // A manager put them on the shift, so they did not volunteer and are not thanked.
      id: 'front-of-house.shift-assigned',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const, details: 'text' as const, calendar: 'url' as const, by: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You have been put on the rota: {{ show }}, {{ date }}',
          body: '{{ by }} has put you on the rota as {{ duty }} for **{{ show }}**. Please arrive by **{{ when }}**.\n\n{{ details }}\n\n[Add to calendar]({{ calendar }})\n\nIf you cannot do it, you can give it up from your shifts, or tell {{ by }}.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-released',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house/open',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You have given up your shift: {{ show }}, {{ date }}',
          body: 'You have given up the {{ duty }} shift for **{{ show }}** on {{ when }}, and the place is free for someone else. Nothing more is needed.\n\nIf that was a mistake, find the shift in Open shifts and sign up again while places are free.',
          action: 'See open shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-cover-asked',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You have asked for cover: {{ show }}, {{ date }}',
          body: 'You have asked to give up the {{ duty }} shift for **{{ show }}** on {{ when }}. It is close, so the place stays yours until someone else takes it, and the front-of-house manager has been told.\n\nIf you find you can do it after all, choose Keep my place on the shift.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-reminder',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Reminder: your shift for {{ show }}, {{ date }}',
          body: 'A reminder that you are on as {{ duty }} for **{{ show }}**. Please arrive by **{{ when }}**.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.shift-removed',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You are no longer on a shift: {{ show }}, {{ date }}',
          body: 'You have been taken off the {{ duty }} shift for **{{ show }}** on {{ when }}, so you are not needed then. If you were not expecting this, ask the front-of-house manager.',
          action: 'See my shifts',
        },
      },
    }, {
      id: 'front-of-house.cover-taken',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/front-of-house',
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your shift is covered: {{ show }}, {{ date }}',
          body: 'Someone has taken your {{ duty }} shift for **{{ show }}** on {{ when }}, so you are no longer needed then.',
          action: 'See my shifts',
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
      variables: { duty: 'text' as const, show: 'text' as const, when: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Cover needed: {{ duty }}, {{ show }}, {{ date }}',
          body: 'Someone on the {{ duty }} shift for **{{ show }}** on {{ when }} has asked to give up their place. It stays theirs until someone takes it.',
          action: 'See open shifts',
        },
      },
    }, {
      // To volunteers when shifts go on the rota: one message for the whole publish.
      id: 'front-of-house.rota-published',
      category: 'optional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      topic: 'front-of-house.rota-published',
      link: '/members/front-of-house/open',
      variables: { count: 'text' as const, shifts: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'New shifts on the rota: {{ count }}',
          body: 'These shifts have just gone on the rota and are open for sign-up:\n\n{{ shifts }}\n\nChoose the ones that suit you from Open shifts. Places go to whoever signs up first.',
          action: 'See open shifts',
        },
      },
    }, {
      // To holders of incident.manage. Number, kind, severity and a link: never what happened or who.
      id: 'front-of-house.incident-reported',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'prompt' as const,
      link: '/console/front-of-house/incidents/{{ incident }}',
      variables: { reference: 'text' as const, kind: 'text' as const, severity: 'text' as const, incident: 'text' as const },
      wording: {
        'en-GB': {
          subject: '{{ severity }} incident reported: {{ reference }}',
          body: '{{ kind }} {{ reference }} has been reported, marked **{{ severity }}**. Open it to review it.',
          action: 'Open the incident',
        },
      },
    }, {
      id: 'front-of-house.incident-digest',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      link: '/console/front-of-house/incidents',
      variables: { count: 'text' as const, incidents: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Incidents reported: {{ count }}',
          body: 'These incidents were reported since the last summary:\n\n{{ incidents }}\n\nOpen the incidents list to review them.',
          action: 'Open the incidents',
        },
      },
    }, {
      id: 'front-of-house.action-due',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      link: '/console/front-of-house/incidents',
      variables: { what: 'text' as const, incident: 'text' as const, due: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Due tomorrow: {{ what }}',
          body: 'The action "{{ what }}" from {{ incident }} is due tomorrow ({{ due }}). Mark it done when it is, or drop it with a reason.',
          action: 'Open the incidents',
        },
      },
    }, {
      // Headline numbers and a link: never incident detail (question 9).
      id: 'front-of-house.night-report-ready',
      category: 'optional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      topic: 'front-of-house.night-reports',
      link: '/console/front-of-house/night-reports/{{ performance }}',
      variables: { show: 'text' as const, worked: 'text' as const, incidents: 'text' as const, performance: 'text' as const, date: 'text' as const, link: 'url' as const },
      wording: {
        'en-GB': {
          subject: 'Night report: {{ show }}, {{ date }}',
          body: 'The night report for **{{ show }}** on {{ date }} has been signed off. People on shift: {{ worked }}. Incidents: {{ incidents }}.\n\n[Read the night report]({{ link }})',
        },
      },
    }, {
      id: 'front-of-house.night-report-unsigned',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      link: '/console/front-of-house/night-reports/{{ performance }}',
      variables: { show: 'text' as const, performance: 'text' as const, date: 'text' as const, link: 'url' as const },
      wording: {
        'en-GB': {
          subject: 'Night report not signed off: {{ show }}, {{ date }}',
          body: 'The night report for **{{ show }}** on {{ date }} is still a draft. Please check who worked and sign it off.\n\n[Open the night report]({{ link }})',
        },
      },
    }, {
      id: 'front-of-house.action-overdue',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'bulk' as const,
      link: '/console/front-of-house/incidents',
      variables: { what: 'text' as const, incident: 'text' as const, due: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Overdue: {{ what }}',
          body: 'The action "{{ what }}" from {{ incident }} was due on {{ due }} and is still open. Mark it done when it is, or drop it with a reason.',
          action: 'Open the incidents',
        },
      },
    }],
  },
})
