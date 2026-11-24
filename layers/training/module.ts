// Training (module `training`): courses and the sign-offs that complete them, the training records
// that result, and the competencies other modules ask for (docs/specs/training-records, amended by
// docs/specs/training). Whether a person is trained is worked out from rows and dates when asked.
// This file grows with the build; it declares what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettingRules, defineSettings, event, factDecl, point, setting, task } from '#kit'
import { tables } from './server/db/schema'
import { SIGN_OFF_KINDS } from './shared/states'

const change = 'training.settings.manage'
const record = { recordId: z.string(), accountId: z.string(), courseId: z.string() }
const session = z.object({ sessionId: z.string(), courseId: z.string() })
const place = { placeId: z.string(), sessionId: z.string(), accountId: z.string() }

// Session notices (second-round part 4). Only the reminder can be switched off.
const sessionNotice = (id: string, subject: string, body: string, { extra = {}, optional = false }: { extra?: Record<string, 'text'>, optional?: boolean } = {}) => ({
  id,
  category: optional ? 'optional' as const : 'transactional' as const,
  ...(optional ? { topic: 'training.sessions' } : {}),
  side: 'members' as const,
  channels: ['email' as const, 'inbox' as const],
  link: '/members/training',
  variables: { session: 'text' as const, when: 'text' as const, ...extra },
  wording: { 'en-GB': { subject, body, action: 'See my training' } },
})
const SESSION_NOTICES = [
  sessionNotice('training.place-booked', 'Your place on {{ session }}', 'You have a place on **{{ session }}**, {{ when }}.'),
  sessionNotice('training.place-promoted', 'A place has come up on {{ session }}', 'A place came up on **{{ session }}**, {{ when }}, and it is yours. If you cannot come after all, cancel it so the next person can have it.'),
  sessionNotice('training.session-reminder', 'Reminder: {{ session }}', '**{{ session }}** is {{ when }}. Where: {{ where }}.', { extra: { where: 'text' }, optional: true }),
  sessionNotice('training.session-changed', '{{ session }} has changed', '**{{ session }}** has moved. It is now {{ when }}.'),
  sessionNotice('training.session-cancelled', '{{ session }} is cancelled', '**{{ session }}**, {{ when }}, is cancelled: {{ reason }}', { extra: { reason: 'text' } }),
  sessionNotice('training.place-cancelled-by-staff', 'Your place on {{ session }} is cancelled', 'Your place on **{{ session }}**, {{ when }}, has been cancelled. If you think this is a mistake, talk to whoever runs training.'),
]

export default defineModule({
  id: 'training',
  manifest: 1,
  since: '0.5.0',
  stability: 'experimental',
  requires: ['forms', 'occupancy'],
  uses: ['front-of-house', 'bar', 'spaces'],

  // Part 6. No rule holds a number; every period is one of these. A course's own validity is a
  // column on the course that defaults from records.default-valid-for.
  settings: defineSettings('training', {
    'records.default-valid-for': setting.duration({ default: '730d', min: '30d', max: '3650d', change, audience: 'staff' }),
    'records.warn-before': setting.duration({ default: '30d', min: '1d', max: '180d', change, audience: 'signed-in' }),
    'records.renew-window': setting.duration({ default: '60d', min: '0d', max: '365d', change, audience: 'signed-in' }),
    'records.renew-grace': setting.duration({ default: '30d', min: '0d', max: '365d', change, audience: 'signed-in' }),
    'records.digest': setting.boolean({ default: true, change, audience: 'staff' }),
    // Lengthening it keeps people competent on training a new version has replaced.
    'versions.retrain-grace': setting.duration({ default: '28d', min: '0d', max: '180d', change, audience: 'staff', onChange: 'confirm' }),
    'progress.complete-within': setting.duration({ default: '180d', min: '7d', max: '730d', change, audience: 'signed-in' }),
    'sessions.default-capacity': setting.integer({ default: 12, min: 1, max: 500, unit: 'training.units.places', change, audience: 'staff' }),
    'sessions.sign-up-closes-before': setting.duration({ default: '2h', min: '0m', max: '14d', change, audience: 'signed-in' }),
    'sessions.cancel-until': setting.duration({ default: '24h', min: '0m', max: '14d', change, audience: 'signed-in' }),
    'sessions.reminder-before': setting.duration({ default: '24h', min: '1h', max: '14d', change, audience: 'staff' }),
    'sessions.waiting-list': setting.boolean({ default: true, change, audience: 'signed-in' }),
    'sessions.mark-within': setting.duration({ default: '7d', min: '1d', max: '60d', change, audience: 'staff' }),
    'evidence.self-submit': setting.boolean({ default: true, change, audience: 'signed-in' }),
    'evidence.chase-after': setting.duration({ default: '7d', min: '1d', max: '60d', change, audience: 'staff' }),
    'quizzes.default-max-attempts': setting.integer({ default: 3, min: 1, max: 20, unit: 'training.units.attempts', change, audience: 'staff' }),
    'quizzes.retry-after': setting.duration({ default: '1d', min: '10m', max: '30d', change, audience: 'signed-in' }),
    // Shortening one lets the next retention run remove rows that cannot be brought back.
    'retention.records': setting.duration({ default: '1095d', min: '0d', max: '3650d', change, audience: 'staff', onChange: 'confirm' }),
    'retention.evidence': setting.duration({ default: '90d', min: '0d', max: '1095d', change, audience: 'staff', onChange: 'confirm' }),
    'retention.attendance': setting.duration({ default: '730d', min: '30d', max: '3650d', change, audience: 'staff', onChange: 'confirm' }),
  }),
  settingRules: defineSettingRules('training', [
    { id: 'warn-inside-validity', check: s => (s['records.warn-before'] as number) < (s['records.default-valid-for'] as number) },
    { id: 'renew-inside-validity', check: s => (s['records.renew-window'] as number) <= (s['records.default-valid-for'] as number) },
    { id: 'evidence-not-outliving-record', check: s => (s['retention.evidence'] as number) <= (s['retention.records'] as number) },
    { id: 'reminder-before-cancel-deadline', check: s => (s['sessions.reminder-before'] as number) >= (s['sessions.cancel-until'] as number) },
    { id: 'retry-inside-progress', check: s => (s['quizzes.retry-after'] as number) < (s['progress.complete-within'] as number) },
  ]),

  // A grant on a course reaches its sessions and the training records for it.
  records: defineRecords('training', {
    course: { table: 'training_courses' },
    session: { table: 'training_sessions', parent: 'training.course' },
    record: { table: 'training_records', parent: 'training.course', owner: 'account_id' },
    competency: { table: 'training_competencies' },
  }),

  // Each ability is declared with the first route that needs it (part 6).
  abilities: defineAbilities('training', {
    'course.view': ability({ grantAt: ['site'] }),
    'course.manage': ability({ on: 'training.course', implies: ['course.view'] }),
    'sign-off.record': ability({ on: 'training.course', implies: ['course.view', 'core.account.find'] }),
    // A person sees their own training records by ownership; every other read is audited.
    'record.view': ability({ on: 'training.record', owner: 'grants', audit: 'read', implies: ['course.view', 'core.account.find'] }),
    'record.award': ability({ on: 'training.course', risk: 'privileged', implies: ['record.view'] }),
    'record.revoke': ability({ on: 'training.record', risk: 'privileged', implies: ['record.view'] }),
    // Changes who meets every requirement that names the competency (R9).
    'competency.manage': ability({ on: 'training.competency', risk: 'privileged', implies: ['course.view'] }),
    'session.manage': ability({ on: 'training.course', implies: ['course.view'] }),
    // Marking attendance, a walk-in and closing; mapped to the course-trainer fact by default.
    'session.run': ability({ on: 'training.course', implies: ['course.view', 'core.account.find'] }),
    'place.book': ability({ grantAt: ['site'], implies: ['course.view'] }),
    'place.manage': ability({ on: 'training.course', implies: ['course.view', 'core.account.find'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Part 6, "The facts". Both may be pinned to one record on Identity's permission screen.
  facts: defineFacts('training', {
    'course-trainer': factDecl({ on: 'training.course', pin: true, defaults: ['training.sign-off.record', 'training.session.run'] }),
    'competent': factDecl({ on: 'training.competency', pin: true }),
  }),

  tables,

  tasks: {
    'training.send-reminders': task({ every: '30m' }),
  },

  points: {
    // Another module's activity that signs off an activity step, such as a shadowed shift (H1 to H4).
    'training.step-source': point({ kind: 'code', contract: 'step-source' }),
  },

  contributes: {
    'core.notification-topic': [
      { id: 'training.records', side: 'members' as const, order: 70 },
      { id: 'training.sessions', side: 'members' as const, order: 71 },
    ],
    'core.space-busy': [{ id: 'training' }],
    // Two places on one session after an account merge: the stronger is kept.
    'core.merge-handler': [{ id: 'training.places', file: 'places' }],
    'core.notification-type': [{
      id: 'training.record-awarded',
      category: 'optional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      topic: 'training.records',
      link: '/members/training',
      variables: { course: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You have completed {{ course }}',
          body: 'Your training record for **{{ course }}** has been awarded. You can see it, and when it runs until, on your training page.',
          action: 'See my training',
        },
      },
    }, {
      // About something taken away from them, so it cannot be switched off.
      id: 'training.record-revoked',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/members/training',
      variables: { course: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your training record for {{ course }} has been withdrawn',
          body: 'Your training record for **{{ course }}** has been withdrawn, so it no longer counts. If you think this is a mistake, talk to whoever runs training.',
          action: 'See my training',
        },
      },
    }, ...SESSION_NOTICES],
    'core.requirement': [{ id: 'training', file: 'training' }],
    'core.record-resolver': [
      { id: 'training.course', file: 'course' },
      { id: 'training.session', file: 'session' },
      { id: 'training.record', file: 'record' },
      { id: 'training.competency', file: 'competency' },
    ],
  },

  // Payloads carry ids and codes. Every event about a person is internal: that somebody was trained,
  // lapsed or had training revoked must not reach a webhook.
  events: {
    announces: {
      'training.course.published': event({ version: 1, payload: z.object({ courseId: z.string(), versionId: z.string(), number: z.number().int(), changeKind: z.enum(['records-stand', 'retraining-required']) }), internal: false }),
      'training.course.retired': event({ version: 1, payload: z.object({ courseId: z.string() }), internal: false }),
      'training.sign-off.recorded': event({ version: 1, payload: z.object({ signOffId: z.string(), accountId: z.string(), courseId: z.string(), stepId: z.string(), kind: z.enum(SIGN_OFF_KINDS) }), internal: true }),
      'training.sign-off.voided': event({ version: 1, payload: z.object({ signOffId: z.string(), accountId: z.string(), courseId: z.string() }), internal: true }),
      'training.record.awarded': event({ version: 1, payload: z.object({ ...record, expiresAt: z.number().int().nullable() }), internal: true }),
      'training.record.revoked': event({ version: 1, payload: z.object(record), internal: true }),
      // Who holds the competency may have changed; listeners ask core.requirement again.
      'training.session.published': event({ version: 1, payload: session, internal: false }),
      'training.session.changed': event({ version: 1, payload: session, internal: false }),
      'training.session.cancelled': event({ version: 1, payload: session, internal: false }),
      'training.session.completed': event({ version: 1, payload: session, internal: false }),
      'training.place.booked': event({ version: 1, payload: z.object({ ...place, state: z.enum(['booked', 'waiting', 'attended']) }), internal: true }),
      'training.place.promoted': event({ version: 1, payload: z.object(place), internal: true }),
      'training.place.cancelled': event({ version: 1, payload: z.object(place), internal: true }),
      'training.competency.routes-changed': event({ version: 1, payload: z.object({ competencyId: z.string() }), internal: false }),
    },
  },

  presets: {
    'student-society': { settings: { 'training.records.default-valid-for': '365d' } },
    'small-venue': { on: false },
  },
})
