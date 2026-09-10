// The training catalogue and what people have done with it: records that are current, expiring,
// expired and revoked, sessions at each step, and the requests waiting on somebody to schedule.

import { DEPARTMENTS, readCatalogue } from '../lib/catalogue'
import { londonParts } from '../../shared/utils/london'
import { holds, insert, insertOnly, seedId } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

function londonDay(now: number, days: number): string {
  const { year, month, day } = londonParts(new Date((now + days * DAY) * 1000))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export interface Training {
  counts: { departments: number, modules: number, prerequisites: number, records: number, sessions: number, requests: number }
  // Modules published rather than left as the subcommittee's draft, so a member sees a catalogue.
  published: string[]
}

// The ones a shift is gated on, plus enough beside them that the catalogue screen is not three
// rows. The rest stay DRAFT, which is how the subcommittee's own draft has them.
const PUBLISH = ['SFTY-001', 'SFTY-002', 'ADMN-101', 'ADMN-102', 'ADMN-103', 'TECH-101', 'STGE-101', 'MGMT-101']

export async function seedTraining(target: SeedTarget, people: People, now: number): Promise<Training> {
  const statements: BoundStatement[] = []

  for (const department of DEPARTMENTS) {
    statements.push(insert('departments', {
      code: department.code,
      name: department.name,
      sort: department.sort,
    }, '(code) DO UPDATE SET name = excluded.name, sort = excluded.sort'))
  }

  const modules = await readCatalogue()
  const known = new Set<string>(DEPARTMENTS.map(department => department.code))

  for (const module of modules) {
    if (!known.has(module.department)) {
      throw new Error(`${module.id} names unknown department "${module.department}"`)
    }
    statements.push(insert('modules', {
      id: module.id,
      department: module.department,
      kind: module.kind,
      name: module.name,
      description: module.description,
      notes: module.notes,
      delivery_mode: 'IN_PERSON',
      expiry_mode: module.expiryMode,
      expiry_months: module.expiryMonths,
      safety_critical: Number(module.safetyCritical),
      signoff_required: Number(module.signoffRequired),
      grants_trainer: Number(module.grantsTrainer),
      grants_supervisor: Number(module.grantsSupervisor),
      status: PUBLISH.includes(module.id) ? 'ACTIVE' : module.status,
      sort: module.sort,
    }, `(id) DO UPDATE SET
        name = excluded.name, description = excluded.description, notes = excluded.notes,
        expiry_mode = excluded.expiry_mode, expiry_months = excluded.expiry_months,
        safety_critical = excluded.safety_critical, status = excluded.status, sort = excluded.sort`))

    if (module.materialsUrl) {
      statements.push(insert('module_materials', {
        id: seedId('material', module.id),
        module_id: module.id,
        label: 'Training materials',
        url: module.materialsUrl,
        sort: 0,
      }))
    }
  }

  let prerequisites = 0
  for (const module of modules) {
    for (const need of module.prerequisites) {
      statements.push(insert('module_prerequisites', {
        id: seedId('prereq', module.id, need),
        module_id: module.id,
        requires_id: need,
      }))
      prerequisites++
    }
  }

  // The department leads a request is routed to, one expiring with the committee year.
  const leads: [string, string][] = [['SFTY', 'aoife'], ['TECH', 'tomasz'], ['ADMN', 'priya']]
  for (const [department, slug] of leads) {
    statements.push(insert('department_leads', {
      id: seedId('lead', department),
      department,
      user_id: personIn(people, slug).id,
      expires_at: now + 200 * DAY,
      granted_by: personIn(people, 'rowan').id,
    }))
  }

  target.batch(statements)

  const published = PUBLISH.filter(id => modules.some(module => module.id === id))
  const sessions = seedSessions(target, people, published, now)
  const records = seedRecords(target, people, published, now)
  const requests = seedRequests(target, people, published, now)

  return {
    counts: { departments: DEPARTMENTS.length, modules: modules.length, prerequisites, records, sessions, requests },
    published,
  }
}

interface SeedSession {
  slug: string
  module: number
  trainer: string
  days: number
  status: 'PLANNED' | 'OPEN' | 'FULL' | 'DELIVERED' | 'CANCELLED'
  capacity: number
  place: string
  attendees: { person: string, status: 'SIGNED_UP' | 'CANCELLED' | 'ATTENDED' | 'ABSENT', source?: 'WALK_IN' }[]
  cancelReason?: string
}

// Every step a session goes through, so the register, the signup list and the trainer's own view
// each have a session in the state they are about (G-110 onwards).
const SESSIONS: SeedSession[] = [
  {
    slug: 'safety-brief-open',
    module: 0,
    trainer: 'aoife',
    days: 6,
    status: 'OPEN',
    capacity: 20,
    place: 'The Studio',
    attendees: [
      { person: 'devon', status: 'SIGNED_UP' },
      { person: 'mira', status: 'SIGNED_UP' },
      { person: 'jonah', status: 'SIGNED_UP' },
      { person: 'kavya', status: 'CANCELLED' },
    ],
  },
  {
    slug: 'foh-planned',
    module: 2,
    trainer: 'priya',
    days: 20,
    status: 'PLANNED',
    capacity: 16,
    place: 'The Green Room',
    attendees: [],
  },
  {
    slug: 'foh-full',
    module: 3,
    trainer: 'priya',
    days: 11,
    status: 'FULL',
    capacity: 4,
    place: 'The Green Room',
    attendees: [
      { person: 'ellis', status: 'SIGNED_UP' },
      { person: 'noor', status: 'SIGNED_UP' },
      { person: 'bram', status: 'SIGNED_UP' },
      { person: 'iris', status: 'SIGNED_UP' },
    ],
  },
  {
    slug: 'tech-delivered',
    module: 5,
    trainer: 'tomasz',
    days: -21,
    status: 'DELIVERED',
    capacity: 12,
    place: 'The Auditorium',
    attendees: [
      { person: 'rowan', status: 'ATTENDED' },
      { person: 'devon', status: 'ATTENDED' },
      { person: 'sam', status: 'ABSENT' },
      { person: 'noor', status: 'ATTENDED', source: 'WALK_IN' },
    ],
  },
  {
    slug: 'stage-cancelled',
    module: 6,
    trainer: 'tomasz',
    days: -3,
    status: 'CANCELLED',
    capacity: 10,
    place: 'The Workshop',
    cancelReason: 'The trainer was ill and nobody else is signed off to deliver it.',
    attendees: [
      { person: 'mira', status: 'CANCELLED' },
      { person: 'kavya', status: 'CANCELLED' },
    ],
  },
]

function seedSessions(target: SeedTarget, people: People, published: string[], now: number): number {
  const statements: BoundStatement[] = []

  for (const session of SESSIONS) {
    const moduleId = published[session.module]
    if (!moduleId) continue

    const id = seedId('session', session.slug)
    const delivered = session.status === 'DELIVERED'
    const cancelled = session.status === 'CANCELLED'

    statements.push(insert('training_sessions', {
      id,
      held_on: londonDay(now, session.days),
      starts_at: '18:00',
      ends_at: '20:00',
      place: session.place,
      capacity: session.capacity,
      opens_at: session.status === 'PLANNED' ? now + 5 * DAY : now - 20 * DAY,
      status: session.status,
      description: 'Seeded so the training screens have a session in this state.',
      trainer_id: personIn(people, session.trainer).id,
      register_opened_at: delivered ? now + session.days * DAY : null,
      register_opened_by: delivered ? personIn(people, session.trainer).id : null,
      marked_at: delivered ? now + session.days * DAY + 2 * 3600 : null,
      marked_by: delivered ? personIn(people, session.trainer).id : null,
      cancelled_at: cancelled ? now - 4 * DAY : null,
      cancelled_by: cancelled ? personIn(people, 'rowan').id : null,
      cancel_reason: session.cancelReason ?? null,
    }))

    statements.push(insert('session_modules', {
      id: seedId('sessionmodule', session.slug, moduleId),
      session_id: id,
      module_id: moduleId,
    }))

    for (const attendee of session.attendees) {
      statements.push(insert('session_attendees', {
        id: seedId('attendee', session.slug, attendee.person),
        session_id: id,
        user_id: personIn(people, attendee.person).id,
        status: attendee.status,
        source: attendee.source ?? 'SIGNUP',
        signed_up_at: now - 25 * DAY,
        marked_at: attendee.status === 'ATTENDED' || attendee.status === 'ABSENT' ? now + session.days * DAY + 2 * 3600 : null,
        marked_by: attendee.status === 'ATTENDED' || attendee.status === 'ABSENT' ? personIn(people, session.trainer).id : null,
      }))
    }
  }

  target.batch(statements)
  return SESSIONS.length
}

interface SeedRecord {
  person: string
  module: number
  awardedDays: number
  expiresDays: number | null
  source: 'SESSION' | 'SIGNOFF' | 'EXTERNAL' | 'SELF' | 'LEGACY'
  revoked?: string
}

// Current, expiring within the warning window, already expired, revoked, and one that never
// expires: the five states the register and the expiry sweep each have to distinguish (G-114).
const RECORDS: SeedRecord[] = [
  { person: 'rowan', module: 0, awardedDays: -100, expiresDays: 265, source: 'SESSION' },
  { person: 'rowan', module: 2, awardedDays: -100, expiresDays: null, source: 'SESSION' },
  { person: 'priya', module: 0, awardedDays: -350, expiresDays: 15, source: 'SESSION' },
  { person: 'priya', module: 2, awardedDays: -350, expiresDays: null, source: 'SESSION' },
  // Expired, and still holding a claimed door shift, which is the case the rota has to catch.
  { person: 'tomasz', module: 0, awardedDays: -400, expiresDays: -35, source: 'SESSION' },
  { person: 'tomasz', module: 5, awardedDays: -21, expiresDays: 344, source: 'SESSION' },
  { person: 'aoife', module: 0, awardedDays: -60, expiresDays: 305, source: 'SIGNOFF' },
  { person: 'aoife', module: 1, awardedDays: -60, expiresDays: 305, source: 'EXTERNAL' },
  { person: 'aoife', module: 2, awardedDays: -60, expiresDays: null, source: 'SIGNOFF' },
  { person: 'devon', module: 0, awardedDays: -30, expiresDays: 335, source: 'SESSION' },
  { person: 'devon', module: 3, awardedDays: -30, expiresDays: 335, source: 'SESSION' },
  { person: 'sam', module: 0, awardedDays: -800, expiresDays: -435, source: 'LEGACY' },
  { person: 'noor', module: 0, awardedDays: -40, expiresDays: 325, source: 'SESSION' },
  { person: 'noor', module: 5, awardedDays: -21, expiresDays: 344, source: 'SESSION' },
  { person: 'ellis', module: 0, awardedDays: -200, expiresDays: 165, source: 'SESSION' },
  { person: 'ellis', module: 3, awardedDays: -200, expiresDays: 165, source: 'SESSION' },
  { person: 'bram', module: 0, awardedDays: -10, expiresDays: 355, source: 'SELF' },
  // Revoked with a reason rather than edited, because the register is append-only (0010).
  { person: 'mira', module: 0, awardedDays: -120, expiresDays: 245, source: 'SESSION', revoked: 'Awarded against the wrong module at the register.' },
]

function seedRecords(target: SeedTarget, people: People, published: string[], now: number): number {
  const statements: BoundStatement[] = []
  let written = 0

  for (const record of RECORDS) {
    const moduleId = published[record.module]
    if (!moduleId) continue

    const id = seedId('record', record.person, moduleId)
    if (holds(target, 'training_records', { id })) continue

    statements.push(insertOnly('training_records', {
      id,
      user_id: personIn(people, record.person).id,
      module_id: moduleId,
      awarded_on: londonDay(now, record.awardedDays),
      expires_on: record.expiresDays === null ? null : londonDay(now, record.expiresDays),
      source: record.source,
      granted_by: personIn(people, 'aoife').id,
      revoked_at: record.revoked ? now - 10 * DAY : null,
      revoked_by: record.revoked ? personIn(people, 'aoife').id : null,
      revoke_reason: record.revoked ?? null,
      created_at: now + record.awardedDays * DAY,
    }))
    written++
  }

  if (statements.length) target.batch(statements)
  return written
}

// Somebody asking for training that is not scheduled, which is what the requests queue is for.
function seedRequests(target: SeedTarget, people: People, published: string[], now: number): number {
  const rows: { person: string, module: number, status: 'OPEN' | 'SCHEDULED' | 'DECLINED' | 'WITHDRAWN', note: string, reason?: string }[] = [
    { person: 'kavya', module: 5, status: 'OPEN', note: 'I am lighting the spring show and have never used the desk.' },
    { person: 'jonah', module: 6, status: 'OPEN', note: 'Happy to come to anything in the next month.' },
    { person: 'noor', module: 0, status: 'SCHEDULED', note: 'Needed before I can take a door shift.' },
    { person: 'bram', module: 7, status: 'DECLINED', note: 'Can I do this on my own?', reason: 'This one is delivered in person only; the next session is in October.' },
    { person: 'ellis', module: 5, status: 'WITHDRAWN', note: 'No longer needed, I have swapped roles.' },
  ]

  const statements: BoundStatement[] = []
  let written = 0
  for (const request of rows) {
    const moduleId = published[request.module]
    if (!moduleId) continue
    const decided = request.status === 'DECLINED' || request.status === 'SCHEDULED'
    statements.push(insert('module_requests', {
      id: seedId('modulerequest', request.person, moduleId),
      user_id: personIn(people, request.person).id,
      module_id: moduleId,
      note: request.note,
      status: request.status,
      reason: request.reason ?? null,
      decided_by: decided ? personIn(people, 'aoife').id : null,
      decided_at: decided ? now - 3 * DAY : null,
      created_at: now - 12 * DAY,
    }))
    written++
  }

  target.batch(statements)
  return written
}
