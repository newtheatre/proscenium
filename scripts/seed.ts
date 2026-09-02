#!/usr/bin/env bun
// Realistic test data in one command (K-120). It cannot touch production: the refusal is an
// allow-list of local targets, and there is no flag to override it.

import { Database } from 'bun:sqlite'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { assertLocalTarget, assertNotProduction, generatePassword, registrableAddress } from '../tests/helpers/seed'

const DEFAULT_TARGET = '.data/db/sqlite.db'
const target = process.argv[2] ?? DEFAULT_TARGET

// Before the database is opened, so a mistake cannot get as far as a connection.
assertNotProduction()
assertLocalTarget(target)

// The same scrypt the application hashes with, so a seeded password actually signs in. The app
// reaches it through nuxt-auth-utils, which a script cannot import.
const hash = new Hash(new Scrypt({}))

const db = new Database(target)

if (!db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()) {
  console.error(`${target} has no schema. Run \`bun run dev\` once, or apply the migrations, then try again.`)
  process.exit(1)
}

const id = (): string => crypto.randomUUID().replaceAll('-', '')
const now = Math.floor(Date.now() / 1000)

// Named the way the society names them, so a screen looks like the real thing rather than like a
// fixture. Hours are left empty on most: a room with none is open whenever (C-101).

// Where a room is and who to ask are optional: ours are in one building and need no telling.
interface SeedRoom {
  name: string
  capacity: number
  description: string
  sensitive: boolean
  campus?: string
  building?: string
  contact?: string
  hours?: { weekday: number, opens: string, closes: string }[]
}

const ROOMS: SeedRoom[] = [
  { name: 'The Studio', capacity: 40, description: 'The rehearsal room upstairs.', sensitive: false },
  { name: 'The Workshop', capacity: 25, description: 'Bench space, and the only room with a sink.', sensitive: false },
  {
    name: 'The Auditorium',
    capacity: 120,
    description: 'The house. Booked around the season, so every request is agreed by a person.',
    sensitive: true,
    hours: [1, 2, 3, 4, 5, 6, 0].map(weekday => ({ weekday, opens: '09:00', closes: '23:00' })),
  },
]

function seedRooms(): { id: string, name: string }[] {
  const seeded: { id: string, name: string }[] = []

  for (const room of ROOMS) {
    const held = db.query('SELECT id FROM rooms WHERE name = ?').get(room.name) as { id: string } | null
    if (held) {
      seeded.push({ id: held.id, name: room.name })
      continue
    }

    const roomId = id()
    db.query(`
      INSERT INTO rooms (id, name, description, capacity, sensitive, campus, building, contact)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      roomId, room.name, room.description ?? null, room.capacity, room.sensitive ? 1 : 0,
      room.campus ?? null, room.building ?? null, room.contact ?? null,
    )

    for (const hours of room.hours ?? []) {
      db.query('INSERT INTO room_hours (id, room_id, weekday, opens, closes) VALUES (?, ?, ?, ?, ?)')
        .run(id(), roomId, hours.weekday, hours.opens, hours.closes)
    }
    seeded.push({ id: roomId, name: room.name })
  }

  return seeded
}

// Obviously synthetic, and on the one domain registration accepts: the reserved .invalid domains
// are refused at registration, so a person nobody can sign in as would be no use here.
const PEOPLE = [
  'Rowan Ellis (test)',
  'Priya Nair (test)',
  'Tomasz Zielinski (test)',
  'Aoife Brennan (test)',
  'Sam Okonkwo (test)',
]

interface Seeded { name: string, email: string, password: string, id: string }

async function seedPeople(): Promise<Seeded[]> {
  const seeded: Seeded[] = []

  for (const name of PEOPLE) {
    const email = registrableAddress(name.split(' ')[0]!.toLowerCase())
    const password = generatePassword()
    const userId = id()

    db.query(`
      INSERT INTO users (id, email, name, password, password_set_at, verified)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(userId, email, name, await hash.make(password), now)

    // Booking a room needs a current membership (C-105 criterion 2), so a seeded member has one.
    db.query(`
      INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
      VALUES (?, ?, date('now', '-60 days'), date('now', '+300 days'), 'MANUAL')
    `).run(id(), userId)

    seeded.push({ name, email, password, id: userId })
  }

  return seeded
}

// A week that looks like a week: mostly confirmed, one waiting on a decision, one already over.
function seedBookings(rooms: { id: string, name: string }[], people: Seeded[]): number {
  const studio = rooms.find(room => room.name === 'The Studio')!
  const workshop = rooms.find(room => room.name === 'The Workshop')!
  const auditorium = rooms.find(room => room.name === 'The Auditorium')!

  const day = 86_400
  const at = (days: number, hour: number): number => {
    const when = new Date()
    when.setHours(hour, 0, 0, 0)
    return Math.floor(when.getTime() / 1000) + days * day
  }

  const planned = [
    { room: studio, who: 0, title: 'Read-through, The Seagull', from: at(1, 18), hours: 2, status: 'CONFIRMED' },
    { room: studio, who: 1, title: 'Blocking, act one', from: at(2, 19), hours: 2, status: 'CONFIRMED' },
    { room: studio, who: 0, title: 'Blocking, act two', from: at(3, 19), hours: 2, status: 'CONFIRMED' },
    { room: workshop, who: 2, title: 'Set build', from: at(2, 14), hours: 4, status: 'CONFIRMED', purpose: 'GET_IN' },
    { room: workshop, who: 3, title: 'Paint call', from: at(4, 10), hours: 3, status: 'CONFIRMED' },
    // Two waiting on a decision, so the approval queue has something in it to look at (C-109).
    {
      room: auditorium,
      who: 4,
      title: 'Technical rehearsal',
      from: at(5, 18),
      hours: 4,
      status: 'PENDING_APPROVAL',
      reason: 'The auditorium is the only room the set fits in.',
    },
    {
      room: workshop,
      who: 1,
      title: 'Emergency paint call',
      from: at(1, 9),
      hours: 3,
      status: 'PENDING_APPROVAL',
      reason: 'The flats have to be dry before the get-in on Saturday.',
    },
    { room: studio, who: 1, title: 'Last week\'s rehearsal', from: at(-4, 19), hours: 2, status: 'CONFIRMED' },
  ]

  for (const booking of planned) {
    db.query(`
      INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status, reason)
      VALUES (?, ?, ?, ?, ?, ?, 'REHEARSAL', ?, ?, ?)
    `).run(id(), booking.room.id, people[booking.who]!.id, booking.title,
      booking.from, booking.from + booking.hours * 3600,
      ('purpose' in booking ? booking.purpose : undefined) ?? 'REHEARSAL',
      booking.status, ('reason' in booking ? booking.reason : null) ?? null)
  }

  return planned.length
}

// The rooms we do not manage, and the lesson that cost somebody an evening (C-119).
function seedExternalSpaces(): number {
  const spaces = [
    { id: id(), name: 'Portland B12', building: 'Portland Building', campus: 'University Park', capacity: 20 },
    { id: id(), name: 'Portland A9', building: 'Portland Building', campus: 'University Park', capacity: 60 },
    { id: id(), name: 'Hallward Seminar 3', building: 'Hallward Library', campus: 'University Park', capacity: 15 },
    { id: id(), name: 'Coates C15', building: 'Coates Building', campus: 'University Park', capacity: 45 },
  ]

  // Re-runnable, like the rooms above: seeding twice adds people, never a second catalogue.
  for (const space of spaces) {
    const held = db.query('SELECT id FROM external_spaces WHERE name = ?').get(space.name) as { id: string } | null
    if (held) {
      space.id = held.id
      continue
    }

    db.query(`INSERT INTO external_spaces (id, name, building, campus, capacity, contact)
              VALUES (?, ?, ?, ?, ?, 'SU reception, room bookings desk')`)
      .run(space.id, space.name, space.building, space.campus, space.capacity)
  }

  const notes = [
    { space: spaces[0]!.id, purpose: 'REHEARSAL', verdict: 'UNSUITABLE', reason: 'A fixed table fills the room; there is no floor to work on.' },
    { space: spaces[0]!.id, purpose: 'MEETING', verdict: 'SUITABLE', reason: 'The table everybody complains about is the point here.' },
    { space: spaces[2]!.id, purpose: 'REHEARSAL', verdict: 'CAUTION', reason: 'Next to a silent study area, so nothing loud.' },
  ]

  for (const note of notes) {
    db.query(`INSERT INTO external_space_notes (id, space_id, purpose, verdict, reason)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (space_id, purpose) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason`)
      .run(id(), note.space, note.purpose, note.verdict, note.reason)
  }

  return spaces.length
}

const rooms = seedRooms()
const spaces = seedExternalSpaces()
const people = await seedPeople()
const bookings = seedBookings(rooms, people)
db.close()

// Printed once, and nowhere else. Nothing here is committed and there is no way to read a
// password back (K-120 criterion 1).
console.info(`\nSeeded ${target}\n`)
console.info(`  ${rooms.length} rooms, ${spaces} SU rooms, ${people.length} people, ${bookings} bookings\n`)
console.info('  Sign in as any of these. The passwords are shown here and nowhere else:\n')
for (const person of people) console.info(`    ${person.email}\n      ${person.password}`)
console.info('\n  Give one of them the run of the place with:')
console.info(`    bun run grant-admin ${people[0]!.email}\n`)
