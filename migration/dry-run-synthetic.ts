#!/usr/bin/env bun
// A dry run over synthetic data, never real dumps: proves the documented pipeline (README.md)
// runs end to end, including the parts no existing test exercises (epic #338 audit, 10 Sept).
import { Database } from 'bun:sqlite'
import { createCore, transformIdentity } from './identity'
import { buildLoad, applyLoad } from './load'
import { reconcile as reconcileBookings, transformBookings } from './bookings'
import { buildLoad as buildMoneyLoad, reconcileMoney, transformMoney } from './money'
import { reconcileTraining, transformTraining } from './training'
import { count } from './lib'
import { createTestDatabase } from '../tests/helpers/database'
import type { TicketRow } from './money'

const failures: string[] = []
const notes: string[] = []
function check(name: string, ok: boolean, detail: string): void {
  if (ok) notes.push(`ok   ${name} (${detail})`)
  else failures.push(`FAIL ${name} (${detail})`)
}

// --- Synthetic sources, built here rather than read from migration/dumps/: no real export, no
// personal data, nothing that could be mistaken for the real thing (dumps/ and out/ untouched).

function syntheticAuth(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, password TEXT,
      google_sub TEXT, pending_google_email TEXT, email_verified INTEGER, disabled INTEGER,
      session_epoch INTEGER, last_login INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE user_roles (
      user_id TEXT, role TEXT, expires_at INTEGER, granted_by TEXT, granted_at INTEGER,
      note TEXT, expiry_warned_at INTEGER);
    CREATE TABLE totp_secrets (
      user_id TEXT, secret TEXT, confirmed_at INTEGER, last_used_step INTEGER, created_at INTEGER);
    CREATE TABLE mfa_recovery_codes (user_id TEXT, code_hash TEXT, used_at INTEGER);

    INSERT INTO users (id, email, name, password, email_verified, disabled, session_epoch, created_at, updated_at) VALUES
      ('a-officer', 'officer@example.invalid', 'An Officer (synthetic)', 'scrypt$hash', 1, 0, 0, 1700000000, 1700000000),
      ('a-workspace', 'grad@newtheatre.org.uk', 'A Committee Member (synthetic)', 'scrypt$leftover-password', 1, 0, 0, 1700000000, 1700000000),
      ('a-tombstone', 'deleted-abc@anonymised.invalid', 'Erased', NULL, 0, 1, 1, 1699000000, 1699000000);

    INSERT INTO user_roles (user_id, role, expires_at, granted_by, granted_at) VALUES
      ('a-officer', 'ticketing:BOX_OFFICE', NULL, NULL, 1700000000),
      ('a-officer', 'legacy:GHOST_ROLE', NULL, NULL, 1700000000);

    INSERT INTO totp_secrets (user_id, secret, confirmed_at, created_at) VALUES ('a-officer', 'JBSWY3DPEHPK3PXP', 1700000000, 1700000000);
  `)
  return db
}

// A mirror app's own local users table (K-113): one id that resolves against auth, one that
// does not, which is exactly the case no existing test seeds.
function syntheticMirror(knownId: string): Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY);`)
  db.query('INSERT INTO users (id) VALUES (?), (?)').run(knownId, 'orphaned-mirror-user')
  return db
}

const MARCH = Date.UTC(2024, 2, 4, 19)

function syntheticRooms(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY, user_id TEXT, room_id INTEGER, external_venue_id INTEGER,
      event_title TEXT NOT NULL, number_of_attendees INTEGER,
      start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
      status TEXT NOT NULL, notes TEXT, rejection_reason TEXT,
      parent_booking_id INTEGER, occurrence_number INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE recurring_patterns (
      id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL, frequency TEXT NOT NULL,
      interval INTEGER NOT NULL DEFAULT 1, days_of_week TEXT,
      max_occurrences INTEGER NOT NULL, end_date INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id TEXT, endpoint TEXT);

    INSERT INTO bookings (id, user_id, room_id, external_venue_id, event_title, number_of_attendees,
      start_time, end_time, status, notes, rejection_reason, parent_booking_id, occurrence_number, created_at)
    VALUES
      (1, 'a-officer', 1, NULL, 'Rehearsal (synthetic)', NULL, ${MARCH}, ${MARCH + 2 * 3_600_000}, 'CONFIRMED',
        NULL, NULL, NULL, NULL, ${MARCH - 86_400_000}),
      -- No account survived the identity import for this one: the exact case K-113 criterion 2
      -- asks to be an exception rather than a guess or a silent drop.
      (2, 'somebody-erasure-removed', 1, NULL, 'Orphaned booking (synthetic)', NULL,
        ${MARCH}, ${MARCH + 3_600_000}, 'CONFIRMED', NULL, NULL, NULL, NULL, ${MARCH - 86_400_000});
  `)
  return db
}

function syntheticTraining(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE department_leads (id TEXT PRIMARY KEY, department TEXT, user_id TEXT, granted_by TEXT, created_at INTEGER);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, held_on TEXT, trainer_user_id TEXT, location TEXT, notes TEXT,
      status TEXT, starts_at INTEGER, ends_at INTEGER, capacity INTEGER,
      register_opened_at INTEGER, cancelled_at INTEGER, cancel_reason TEXT,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE session_modules (id TEXT PRIMARY KEY, session_id TEXT, module_id TEXT);
    CREATE TABLE session_attendees (
      id TEXT PRIMARY KEY, session_id TEXT, user_id TEXT, status TEXT, signed_up_at INTEGER,
      source TEXT, marked_at INTEGER, marked_by_user_id TEXT);
    CREATE TABLE module_requests (
      id TEXT PRIMARY KEY, user_id TEXT, module_id TEXT, note TEXT, status TEXT,
      resolved_at INTEGER, resolved_by TEXT, decline_reason TEXT, created_at INTEGER);
    CREATE TABLE records (
      id TEXT PRIMARY KEY, user_id TEXT, module_id TEXT, awarded_at TEXT, expires_at TEXT,
      expiry_overridden INTEGER, source TEXT, session_id TEXT, granted_by TEXT,
      external_ref TEXT, revoked_at INTEGER, revoked_by TEXT, revoke_reason TEXT, created_at INTEGER);

    INSERT INTO sessions (id, held_on, trainer_user_id, location, notes, status, starts_at, ends_at, capacity, created_at, updated_at)
      VALUES ('ts-1', '2024-03-04', 'a-officer', 'Studio 1', 'Bring harnesses (synthetic)', 'DELIVERED',
        ${MARCH}, ${MARCH + 2 * 3_600_000}, 12, ${MARCH - 86_400_000}, ${MARCH - 86_400_000});
    INSERT INTO session_modules (id, session_id, module_id) VALUES ('tsm-1', 'ts-1', 'TECH-111');
    INSERT INTO session_attendees (id, session_id, user_id, status, signed_up_at, source)
      VALUES ('tsa-1', 'ts-1', 'a-officer', 'ATTENDED', ${MARCH - 3_600_000}, 'SELF');
    INSERT INTO records (id, user_id, module_id, awarded_at, source, session_id, created_at)
      VALUES ('tr-1', 'a-officer', 'TECH-111', '2024-03-04', 'SESSION', 'ts-1', ${MARCH});
    -- No account survived the identity import for this one, the same exception shape bookings hits.
    INSERT INTO records (id, user_id, module_id, awarded_at, source, created_at)
      VALUES ('tr-2', 'somebody-erasure-removed', 'TECH-111', '2024-03-04', 'EXTERNAL', ${MARCH});
  `)
  return db
}

function syntheticTickets(): TicketRow[] {
  return [
    { id: 't-1', price_paid: 900, refunded_at: null, created_at: '2024-03-04 19:00:00', price_confidence: 'EXACT' },
    { id: 't-2', price_paid: 1200, refunded_at: Date.UTC(2024, 2, 5), created_at: '2024-03-04 20:00:00', price_confidence: 'EXACT' },
    { id: 't-3', price_paid: 750, refunded_at: null, created_at: '2024-03-04 21:00:00', price_confidence: 'ESTIMATED' },
  ]
}

// --- Stage 1: identity, with every mirror populated, unlike every existing test (K-112, K-113).

const auth = syntheticAuth()
const mirrors = [
  { source: 'rooms', db: syntheticMirror('a-officer') },
  { source: 'training', db: syntheticMirror('a-officer') },
  { source: 'proscenium', db: syntheticMirror('a-officer') },
]
const roleMap = { 'ticketing:BOX_OFFICE': 'BOX_OFFICE' }
const idMap = new Map<string, string>()
const core = await createCore(':memory:')

const identityResult = transformIdentity({ auth, mirrors, roleMap, idMap, target: core })

check('every user imported', count(core, 'users') === 3, `${count(core, 'users')} of 3`)
check('tombstone preserved', count(core, 'users', 'anonymised_at IS NOT NULL') === 1, `${identityResult.summary.tombstones}`)
check('Workspace password wiped', count(core, 'users', 'email LIKE \'%@newtheatre.org.uk\' AND password IS NOT NULL') === 0, `wiped ${identityResult.summary.workspaceWiped}`)
check('unmapped role caught, not silently dropped', identityResult.unmappedRoles.includes('legacy:GHOST_ROLE'), identityResult.unmappedRoles.join(', ') || 'none found')
check(
  'K-113: an orphaned mirror user is an exception, not a guess',
  identityResult.exceptions.some(exception => exception.includes('orphaned-mirror-user') && exception.includes('no auth row')),
  identityResult.exceptions.find(exception => exception.includes('orphaned-mirror-user')) ?? 'no such exception was raised',
)

// --- Stage 2: load the core into a target carrying the real application schema (K-112 criterion 4).

const rehearsal = await createTestDatabase()
rehearsal.batch([['INSERT INTO rooms (id, name) VALUES (?, ?)', 'new-studio', 'The Synthetic Studio']])
applyLoad(buildLoad(core), rehearsal.raw)
check('load reached the real schema', count(rehearsal.raw, 'users') === 3, `${count(rehearsal.raw, 'users')} of 3`)

// --- Stage 3: bookings, keyed on the same idMap identity minted (C-118, K-113).

const roomsSource = syntheticRooms()
const bookingsResult = transformBookings({
  source: roomsSource,
  accounts: idMap,
  rooms: new Map([['room:1', 'new-studio']]),
  spaces: new Map(),
  bookingIds: new Map(),
  seriesIds: new Map(),
  externalIds: new Map(),
  target: rehearsal.raw,
})
const bookingsCheck = reconcileBookings(roomsSource, rehearsal.raw, bookingsResult.summary)
check('a mapped booking writes', bookingsResult.summary.written === 1, `${bookingsResult.summary.written} of 1`)
check(
  'K-113: a booking with no canonical account is an exception, not a guess',
  bookingsResult.exceptions.some(exception => exception.includes('no canonical account')),
  bookingsResult.exceptions.find(exception => exception.includes('no canonical account')) ?? 'no such exception was raised',
)
check('bookings reconciliation is green', bookingsCheck.ok, bookingsCheck.problems.join('; ') || 'no problems')

// --- Stage 4: training, keyed on the same idMap identity minted, against a catalogue authored
// here rather than migrated (K-113).

rehearsal.batch([
  ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
  ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
])
const trainingSource = syntheticTraining()
const trainingResult = transformTraining({
  source: trainingSource,
  accounts: idMap,
  moduleIds: new Set(['TECH-111']),
  departmentCodes: new Set(['TECH']),
  sessionIds: new Map(),
  requestIds: new Map(),
  recordIds: new Map(),
  target: rehearsal.raw,
})
const trainingCheck = reconcileTraining(rehearsal.raw, trainingResult.summary)
check('a mapped session and its record write', trainingResult.summary.sessionsWritten === 1 && trainingResult.summary.recordsWritten === 1, `${trainingResult.summary.sessionsWritten} session, ${trainingResult.summary.recordsWritten} record`)
check(
  'K-113: a record with no canonical account is an exception, not a guess',
  trainingResult.exceptions.some(exception => exception.includes('no canonical account')),
  trainingResult.exceptions.find(exception => exception.includes('no canonical account')) ?? 'no such exception was raised',
)
check('training reconciliation is green', trainingCheck.ok, trainingCheck.problems.join('; ') || 'no problems')

// --- Stage 5: money, straight into the real ledger tables, no staging (K-114).

const tickets = syntheticTickets()
const moneyResult = transformMoney(tickets, new Map(), new Map())
rehearsal.raw.transaction(() => rehearsal.raw.exec(buildMoneyLoad(moneyResult.entries, moneyResult.lines)))()
const ticketsDb = new Database(':memory:')
ticketsDb.exec('CREATE TABLE tickets (id TEXT PRIMARY KEY, price_paid INTEGER, refunded_at INTEGER, price_confidence TEXT);')
for (const ticket of tickets) {
  ticketsDb.query('INSERT INTO tickets (id, price_paid, refunded_at, price_confidence) VALUES (?, ?, ?, ?)')
    .run(ticket.id, ticket.price_paid, ticket.refunded_at, ticket.price_confidence)
}
const moneyCheck = reconcileMoney(ticketsDb, rehearsal.raw, moneyResult.summary)
check('every ticket produced a ledger entry', count(rehearsal.raw, 'ledger_entries', 'source = \'IMPORT\'') === 4, `${count(rehearsal.raw, 'ledger_entries', 'source = \'IMPORT\'')} of 4 (3 sales, 1 refund)`)
check(
  'a non-EXACT price is an exception, not a silent trust',
  moneyResult.exceptions.some(exception => exception.includes('ESTIMATED')),
  moneyResult.exceptions.join('; ') || 'no such exception was raised',
)
check('money reconciliation is green', moneyCheck.ok, moneyCheck.problems.join('; ') || 'no problems')

// --- Stage 6: what this dry run cannot cover, named rather than left implicit.

notes.push('note export.sh, inventory.ts and reconcile.ts read real files (migration/dumps/, migration/out/) and are not exercised here: this proves the transforms, not the file-handling CLI wrappers around them')
notes.push('note programme and reservations-as-records still have no transform: this harness cannot exercise what does not exist')

console.log(notes.join('\n'))
if (failures.length) {
  console.error(`\n${failures.join('\n')}`)
  rehearsal.close()
  auth.close()
  for (const mirror of mirrors) mirror.db.close()
  roomsSource.close()
  trainingSource.close()
  ticketsDb.close()
  process.exit(1)
}
console.log('\nSynthetic dry run green: every transform ran end to end, and every exception path this harness can reach without real dumps fired correctly.')
rehearsal.close()
auth.close()
for (const mirror of mirrors) mirror.db.close()
roomsSource.close()
trainingSource.close()
ticketsDb.close()
