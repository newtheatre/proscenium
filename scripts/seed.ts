#!/usr/bin/env bun
// Realistic test data in one command (K-120). It cannot touch production: the refusal is an
// allow-list of local targets, and there is no flag to override it.

import { Database } from 'bun:sqlite'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { assertLocalTarget, assertNotProduction, generatePassword, registrableAddress } from '../tests/helpers/seed'
import { currentShowNight, showNightBounds, showNightOf } from '../shared/utils/show-night'
import { DEPARTMENTS, readCatalogue } from './lib/catalogue'

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

// Re-runnable like the rooms above: a row already there is reused rather than duplicated.
function keyed(table: string, column: string, value: string, create: () => string): string {
  const held = db.query(`SELECT id FROM ${table} WHERE ${column} = ?`).get(value) as { id: string } | null
  return held ? held.id : create()
}

// The prices the box office actually sells at. Access and companion never appear in a public
// payload (D-128), which is what the access kind marks them for.
const TICKET_TYPES = [
  { name: 'Standard', description: 'The full price.', price: 700, kind: 'SINGLE', accessKind: null },
  { name: 'Concession', description: 'Students, over-65s, and anybody on benefits.', price: 500, kind: 'SINGLE', accessKind: null },
  { name: 'Access', description: 'For a patron whose access needs bring a companion.', price: 700, kind: 'SINGLE', accessKind: 'ACCESS' },
  { name: 'Companion', description: 'The companion seat, free.', price: 0, kind: 'SINGLE', accessKind: 'COMPANION' },
]

// A technical warning carries no level; a general one always does (D-102).
const CONTENT_WARNINGS = [
  { slug: 'strobe-lighting', title: 'Strobe lighting', kind: 'TECHNICAL', category: 'Lighting', sort: 0, level: null },
  { slug: 'suicide', title: 'Suicide', kind: 'GENERAL', category: 'Themes', sort: 1, level: 'DEPICTED' },
  { slug: 'firearms', title: 'Firearms', kind: 'GENERAL', category: 'Violence', sort: 2, level: 'DEPICTED' },
]

// A venue, a show and two performances, so every show-night and box-office screen has a night to
// open. The venue points at the auditorium, which is the only effect that attachment has (0043).
function seedProgramme(rooms: { id: string, name: string }[], people: Seeded[]): { performances: number } {
  const auditorium = rooms.find(room => room.name === 'The Auditorium')

  const venueId = keyed('venues', 'name', 'The Nottingham New Theatre', () => {
    const id_ = id()
    db.query(`INSERT INTO venues (id, name, address, capacity, is_external, description, room_id)
              VALUES (?, ?, ?, 120, 0, ?, ?)`)
      .run(id_, 'The Nottingham New Theatre', 'Nottingham University Students Union, University Park',
        'The house. General admission, no seat map, because we have never had one.',
        auditorium?.id ?? null)
    return id_
  })

  // The card front of house reads in the dark (E-113). It describes the building and nobody else.
  db.query(`INSERT INTO venue_emergency_info (venue_id, assembly_point, exits, isolation_points, what3words, notes, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (venue_id) DO NOTHING`)
    .run(venueId, 'The car park behind the Portland Building',
      'Two: stage left to the alley, and the foyer to Portland Hill.',
      'Lighting isolation is in the box; gas is in the workshop corridor.',
      'towns.match.press', 'The nearest defibrillator is inside the Portland Building foyer.',
      people[0]?.id ?? null, now)

  const seasonId = keyed('seasons', 'name', '2026/27', () => {
    const id_ = id()
    db.query('INSERT INTO seasons (id, name, starts_on, ends_on, sort) VALUES (?, ?, ?, ?, 0)')
      .run(id_, '2026/27', '2026-08-01', '2027-07-31')
    return id_
  })

  const categoryId = keyed('show_categories', 'name', 'In-house', () => {
    const id_ = id()
    db.query('INSERT INTO show_categories (id, name, sort) VALUES (?, ?, 0)').run(id_, 'In-house')
    return id_
  })

  for (const type of TICKET_TYPES) {
    keyed('ticket_types', 'name', type.name, () => {
      const id_ = id()
      db.query('INSERT INTO ticket_types (id, name, description, price, kind, access_kind) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id_, type.name, type.description, type.price, type.kind, type.accessKind)
      return id_
    })
  }

  const showId = keyed('shows', 'slug', 'the-seagull', () => {
    const id_ = id()
    db.query(`INSERT INTO shows (id, slug, title, subtitle, description, category_id, season_id,
                                age_guidance, latecomer_policy, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AT_INTERVAL', 'PUBLISHED')`)
      .run(id_, 'the-seagull', 'The Seagull', 'Chekhov, in a new translation',
        'Four acts, one lake, and nobody gets what they came for.', categoryId, seasonId,
        'Recommended 14 and over')
    return id_
  })

  for (const warning of CONTENT_WARNINGS) {
    const warningId = keyed('content_warnings', 'slug', warning.slug, () => {
      const id_ = id()
      db.query('INSERT INTO content_warnings (id, slug, title, kind, category, sort) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id_, warning.slug, warning.title, warning.kind, warning.category, warning.sort)
      return id_
    })
    db.query(`INSERT INTO show_content_warnings (id, show_id, warning_id, level) VALUES (?, ?, ?, ?)
              ON CONFLICT (show_id, warning_id) DO NOTHING`)
      .run(id(), showId, warningId, warning.level)
  }

  // 19:30 London on each night, which is 15.5 hours after the night's 04:00 start whatever the
  // clocks did in between (0014, E-110).
  const curtain = (night: string): number =>
    Math.floor(showNightBounds(night).from.getTime() / 1000) + Math.round(15.5 * 3600)
  const nextWeek = showNightOf(new Date(Date.now() + 7 * 86_400 * 1000))

  // Seeding after 19:30 would leave nothing sellable, so tonight's curtain moves forward, staying
  // inside the night it belongs to.
  const tonight = currentShowNight()
  const lastMoment = Math.floor(showNightBounds(tonight).to.getTime() / 1000) - 1
  const planned = [
    Math.min(Math.max(curtain(tonight), now + 2 * 3600), lastMoment),
    curtain(nextWeek),
  ]

  // Re-runnable, and tonight has to stay tonight: an existing performance moves rather than a
  // second one appearing beside it.
  const held = db.query('SELECT id FROM performances WHERE show_id = ? ORDER BY starts_at')
    .all(showId) as { id: string }[]

  for (const [index, startsAt] of planned.entries()) {
    const existing = held[index]
    if (existing) {
      db.query('UPDATE performances SET starts_at = ?, doors_at = ? WHERE id = ?')
        .run(startsAt, startsAt - 1800, existing.id)
      continue
    }
    db.query(`INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes,
                                        interval_count, interval_minutes, status)
              VALUES (?, ?, ?, ?, ?, 150, 1, 15, 'ON_SALE')`)
      .run(id(), showId, venueId, startsAt, startsAt - 1800)
  }

  return { performances: planned.length }
}

// The subcommittee's draft catalogue, so a development database looks like the real thing rather
// than like three modules somebody invented. The real one is migrated from the old database.
async function seedCatalogue(): Promise<{ departments: number, modules: number, prerequisites: number }> {
  for (const department of DEPARTMENTS) {
    db.query(`INSERT INTO departments (code, name, sort) VALUES (?, ?, ?)
              ON CONFLICT (code) DO UPDATE SET name = excluded.name, sort = excluded.sort`)
      .run(department.code, department.name, department.sort)
  }

  const modules = await readCatalogue()
  const known = new Set(DEPARTMENTS.map(department => department.code))

  for (const module of modules) {
    if (!known.has(module.department as typeof DEPARTMENTS[number]['code'])) {
      throw new Error(`${module.id} names unknown department "${module.department}"`)
    }

    db.query(`INSERT INTO modules (
                id, department, kind, name, description, notes, delivery_mode, expiry_mode,
                expiry_months, safety_critical, signoff_required, grants_trainer, grants_supervisor,
                status, sort
              ) VALUES (?, ?, ?, ?, ?, ?, 'IN_PERSON', ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, description = excluded.description, notes = excluded.notes,
                expiry_mode = excluded.expiry_mode, expiry_months = excluded.expiry_months,
                safety_critical = excluded.safety_critical, status = excluded.status,
                sort = excluded.sort`)
      .run(
        module.id, module.department, module.kind, module.name, module.description, module.notes,
        module.expiryMode, module.expiryMonths, Number(module.safetyCritical),
        Number(module.signoffRequired), Number(module.grantsTrainer), Number(module.grantsSupervisor),
        module.status, module.sort,
      )

    // One link per module in the draft, which is a row here rather than a column (G-107 c1).
    if (module.materialsUrl) {
      db.query(`INSERT INTO module_materials (id, module_id, label, url, sort)
                VALUES (?, ?, 'Training materials', ?, 0)
                ON CONFLICT DO NOTHING`)
        .run(id(), module.id, module.materialsUrl)
    }
  }

  let prerequisites = 0
  for (const module of modules) {
    for (const need of module.prerequisites) {
      db.query(`INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)
                ON CONFLICT (module_id, requires_id) DO NOTHING`)
        .run(id(), module.id, need)
      prerequisites++
    }
  }

  return { departments: DEPARTMENTS.length, modules: modules.length, prerequisites }
}

const rooms = seedRooms()
const spaces = seedExternalSpaces()
const catalogue = await seedCatalogue()
const people = await seedPeople()
const bookings = seedBookings(rooms, people)
const programme = seedProgramme(rooms, people)
db.close()

// Printed once, and nowhere else. Nothing here is committed and there is no way to read a
// password back (K-120 criterion 1).
console.info(`\nSeeded ${target}\n`)
console.info(`  ${rooms.length} rooms, ${spaces} SU rooms, ${people.length} people, ${bookings} bookings`)
console.info(`  ${catalogue.modules} training modules across ${catalogue.departments} departments, `
  + `${catalogue.prerequisites} prerequisites`)
console.info(`  1 venue and 1 show, with ${programme.performances} performances: one tonight, one next week\n`)
console.info('  Every module is a DRAFT, as the subcommittee draft has them, so members see none of')
console.info('  them until somebody publishes one.\n')
console.info('  Sign in as any of these. The passwords are shown here and nowhere else:\n')
for (const person of people) console.info(`    ${person.email}\n      ${person.password}`)
console.info('\n  Give one of them the run of the place with:')
console.info(`    bun run grant-admin ${people[0]!.email}\n`)
