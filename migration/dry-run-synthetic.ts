#!/usr/bin/env bun
// A dry run over synthetic data, never real dumps: proves the documented pipeline (README.md)
// runs end to end, including the parts no existing test exercises (epic #338 audit, 10 Sept).
import { Database } from 'bun:sqlite'
import { createCore, transformIdentity } from './identity'
import { buildLoad, applyLoad } from './load'
import { reconcile as reconcileBookings, transformBookings } from './bookings'
import { buildLoad as buildMoneyLoad, reconcileMoney, transformMoney } from './money'
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

// --- Stage 4: money, straight into the real ledger tables, no staging (K-114).

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

// --- Stage 5: what this dry run cannot cover, named rather than left implicit.

notes.push('note training: no transform exists yet; the mirror-consistency check above is the only thing synthetic "training" data exercises')
notes.push('note export.sh, inventory.ts and reconcile.ts read real files (migration/dumps/, migration/out/) and are not exercised here: this proves the transforms, not the file-handling CLI wrappers around them')

console.log(notes.join('\n'))
if (failures.length) {
  console.error(`\n${failures.join('\n')}`)
  rehearsal.close()
  auth.close()
  for (const mirror of mirrors) mirror.db.close()
  roomsSource.close()
  ticketsDb.close()
  process.exit(1)
}
console.log('\nSynthetic dry run green: every transform ran end to end, and every exception path this harness can reach without real dumps fired correctly.')
rehearsal.close()
auth.close()
for (const mirror of mirrors) mirror.db.close()
roomsSource.close()
ticketsDb.close()
