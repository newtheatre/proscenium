// The screens nobody thinks about until they are empty: the audit trail, configuration that has
// actually been changed, the notification centre, the inbox, and the backup drill register.

import { auditEntry } from '../../shared/utils/audit'
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

export interface Governance {
  counts: { config: number, audit: number, inbox: number, notifications: number, drills: number }
}

// Keys a committee would plausibly have moved off their default, so the configuration screen
// shows the overridden state rather than every row reading as shipped.
const CONFIG: [string, unknown][] = [
  ['HOLD_RELEASE_MINUTES_BEFORE', 20],
  ['ROOM_MAX_BOOKING_HOURS', 5],
  ['BAR_TAB_CAP_PENCE', 4000],
  ['LISTING_LIMITED_THRESHOLD_PERCENT', 15],
  ['MEMBERSHIP_GRACE_DAYS', 21],
  // Set rather than left unset, so the rota actually gates on a record and the ineligible cases
  // in the seeded shifts are visible instead of theoretical (E-103).
  ['SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE', 'ADMN-101'],
  ['SHIFT_ELIGIBILITY_DOOR_MODULE', 'SFTY-001'],
  ['SHIFT_ELIGIBILITY_BAR_MODULE', 'ADMN-102'],
]

export function seedGovernance(target: SeedTarget, people: People, now: number): Governance {
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  for (const [key, value] of CONFIG) {
    statements.push(insert('config', {
      key,
      value: JSON.stringify(value),
      updated_by: officer,
      updated_at: now - 45 * DAY,
    }, '(key) DO NOTHING'))
  }

  target.batch(statements)

  const audit = seedAudit(target, people, now)
  const inbox = seedInbox(target, people, now)
  const notifications = seedNotifications(target, people, now)
  const drills = seedDrills(target, people, now)

  // Closed, never open: an open one makes `/api/health` report unhealthy, and a development
  // database that starts unhealthy teaches a developer to ignore the check (J-106).
  target.batch([insert('health_incidents', {
    id: seedId('healthincident', 'closed'),
    status: 'CLOSED',
    opened_at: now - 9 * DAY,
    closed_at: now - 9 * DAY + 2 * 3600,
  })])

  return { counts: { config: CONFIG.length, audit, inbox, notifications, drills } }
}

// Through `auditEntry` even from a script, so the action catalogue governs every writer and not
// only the ones inside a request (0027). `check audit` refuses any other shape.
function seedAudit(target: SeedTarget, people: People, now: number): number {
  const officer = personIn(people, 'rowan').id
  const trainer = personIn(people, 'aoife').id

  const acts: { slug: string, actorId: string | null, action: string, target: string, detail: Record<string, unknown>, daysAgo: number }[] = [
    { slug: 'config', actorId: officer, action: 'config.changed', target: 'config:HOLD_RELEASE_MINUTES_BEFORE', detail: { changes: { value: { from: 15, to: 20 } } }, daysAgo: 45 },
    { slug: 'role', actorId: officer, action: 'role.granted', target: `user:${personIn(people, 'priya').id}`, detail: { role: 'FRONT_OF_HOUSE' }, daysAgo: 40 },
    { slug: 'ticket-type', actorId: officer, action: 'ticket-type.created', target: 'ticket-type:standard', detail: { price: 700 }, daysAgo: 60 },
    { slug: 'bar-price', actorId: officer, action: 'bar.category.price.set', target: 'bar-category:spirits', detail: { servingKind: 'single', pricePence: 250 }, daysAgo: 30 },
    { slug: 'stocktake', actorId: personIn(people, 'devon').id, action: 'bar.stocktake.applied', target: 'stocktake:applied', detail: { lines: 5 }, daysAgo: 14 },
    { slug: 'checklist', actorId: officer, action: 'checklist.closed', target: 'venue:house', detail: { phase: 'POST' }, daysAgo: 6 },
    { slug: 'session', actorId: trainer, action: 'session.scheduled', target: 'session:tech-delivered', detail: { capacity: 12 }, daysAgo: 21 },
    { slug: 'drill', actorId: officer, action: 'backup.drill-recorded', target: 'backup-drill:passed', detail: { outcome: 'PASS' }, daysAgo: 25 },
  ]

  const statements: BoundStatement[] = []
  let written = 0

  for (const act of acts) {
    const id = seedId('audit', act.slug)
    if (holds(target, 'audit_log', { id })) continue

    const entry = auditEntry({ actorId: act.actorId, action: act.action, target: act.target, detail: act.detail })
    statements.push(insertOnly('audit_log', {
      id,
      actor_id: entry.actorId,
      action: entry.action,
      target: entry.target,
      detail: JSON.stringify(entry.detail),
      created_at: now - act.daysAgo * DAY,
    }))
    written++
  }

  if (statements.length) target.batch(statements)
  return written
}

// Read and unread, because an inbox that is entirely one or the other never shows its own count.
function seedInbox(target: SeedTarget, people: People, now: number): number {
  const rows: { person: string, slug: string, type: string, title: string, body: string, link: string, read: boolean, hoursAgo: number }[] = [
    { person: 'rowan', slug: 'shift-reminder', type: 'SHIFT_REMINDER', title: 'You are duty manager tonight', body: 'Doors at 19:00, curtain at 19:30.', link: '/tonight', read: false, hoursAgo: 6 },
    { person: 'rowan', slug: 'booking', type: 'RESERVATION_CONFIRMED', title: 'Your booking is confirmed', body: 'Two standard tickets for The Seagull.', link: '/my/bookings', read: true, hoursAgo: 72 },
    { person: 'priya', slug: 'shift-open', type: 'SHIFT_OPEN', title: 'A door shift is open next week', body: 'The Seagull, next Thursday.', link: '/rota', read: false, hoursAgo: 20 },
    { person: 'tomasz', slug: 'training-expiry', type: 'TRAINING_EXPIRING', title: 'Your safety brief has expired', body: 'You cannot take a shift until it is renewed.', link: '/training', read: false, hoursAgo: 30 * 24 },
    { person: 'devon', slug: 'comp-decided', type: 'COMP_DECIDED', title: 'Your comp request was approved', body: 'Two cans of lager, approved by the duty manager.', link: '/tonight/till', read: true, hoursAgo: 1 },
    { person: 'mira', slug: 'room-approved', type: 'ROOM_DECIDED', title: 'Your room request needs a decision', body: 'Auditions, spring slot: still waiting on the theatre manager.', link: '/rooms', read: false, hoursAgo: 48 },
  ]

  target.batch(rows.map(row => insert('inbox_items', {
    id: seedId('inbox', row.person, row.slug),
    user_id: personIn(people, row.person).id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read_at: row.read ? now - row.hoursAgo * 3600 + 1800 : null,
    created_at: now - row.hoursAgo * 3600,
  })))

  return rows.length
}

// Every status the log records, including the two a retry screen is about (H-105).
function seedNotifications(target: SeedTarget, people: People, now: number): number {
  const rows: { person: string, slug: string, type: string, channel: string, subject: string, status: string, hoursAgo: number, error?: string }[] = [
    { person: 'rowan', slug: 'sent-email', type: 'SHIFT_REMINDER', channel: 'EMAIL', subject: 'You are duty manager tonight', status: 'SENT', hoursAgo: 6 },
    { person: 'rowan', slug: 'sent-inbox', type: 'SHIFT_REMINDER', channel: 'INBOX', subject: 'You are duty manager tonight', status: 'SENT', hoursAgo: 6 },
    { person: 'priya', slug: 'pending', type: 'SHIFT_OPEN', channel: 'EMAIL', subject: 'A door shift is open next week', status: 'PENDING', hoursAgo: 0 },
    { person: 'tomasz', slug: 'retrying', type: 'TRAINING_EXPIRING', channel: 'EMAIL', subject: 'Your safety brief has expired', status: 'RETRYING', hoursAgo: 2, error: 'Upstream returned 502; the third attempt is queued.' },
    { person: 'mira', slug: 'failed', type: 'ROOM_DECIDED', channel: 'EMAIL', subject: 'Your room request needs a decision', status: 'FAILED', hoursAgo: 48, error: 'Mailbox unavailable after four attempts.' },
    { person: 'checkout-guest', slug: 'skipped', type: 'RESERVATION_CONFIRMED', channel: 'PUSH', subject: 'Your booking is confirmed', status: 'SKIPPED_UNDELIVERABLE', hoursAgo: 10, error: 'No push subscription for this account.' },
  ]

  target.batch(rows.map(row => insert('notification_log', {
    id: seedId('notification', row.slug),
    user_id: personIn(people, row.person).id,
    type: row.type,
    channel: row.channel,
    subject: row.subject,
    status: row.status,
    sent_at: row.status === 'SENT' ? now - row.hoursAgo * 3600 : null,
    error: row.error ?? null,
    created_at: now - row.hoursAgo * 3600,
  })))

  return rows.length
}

// A drill that passed and one that did not, because a register showing only successes tells an
// operator nothing about what a failure looks like (K-108).
function seedDrills(target: SeedTarget, people: People, now: number): number {
  const operator = personIn(people, 'rowan').id
  const rows: { slug: string, daysAgo: number, outcome: string, minutes: number, rows: number, money: number, notes: string }[] = [
    { slug: 'passed', daysAgo: 25, outcome: 'PASS', minutes: 18, rows: 1, money: 1, notes: 'Restored to a scratch database from the Time Travel bookmark. Counts and totals matched.' },
    { slug: 'failed', daysAgo: 115, outcome: 'FAIL', minutes: 95, rows: 0, money: 1, notes: 'Restore ran, but two migrations had not applied so three tables were missing. Fixed by applying them before the comparison.' },
  ]

  const statements: BoundStatement[] = []
  let written = 0
  for (const drill of rows) {
    const id = seedId('drill', drill.slug)
    if (holds(target, 'backup_drills', { id })) continue
    statements.push(insertOnly('backup_drills', {
      id,
      ran_on: londonDay(now, -drill.daysAgo),
      operator_id: operator,
      outcome: drill.outcome,
      time_to_restore_minutes: drill.minutes,
      row_counts_match: drill.rows,
      money_totals_match: drill.money,
      notes: drill.notes,
      created_at: now - drill.daysAgo * DAY,
    }))
    written++
  }

  if (statements.length) target.batch(statements)
  return written
}
