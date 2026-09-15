import { describe, expect, test } from 'bun:test'
import {
  approveOpeningShiftStatement,
  cancelOpeningShiftsStatement,
  cancelOpeningStatement,
  claimOpeningShiftStatement,
  confirmedOpeningShiftsTonightQuery,
  createOpeningStatement,
  declineOpeningShiftStatement,
  stampOpeningShiftsStatement,
  unconfirmOpeningShiftStatement,
} from '#server/utils/bar-openings'
import { replaceTemplateStatements } from '#server/utils/rota'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { TemplateSlot } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// A bar opening is a planned event in its own right, staffed and claimed like a rota slot but
// naming no performance and no show (E-130, 0077).

const NIGHT = currentShowNight()
const NIGHT_START = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000)
// 18:00 to 23:00 on the night, measured from its own 04:00 start (0014).
const OPENS_AT = NIGHT_START + 14 * 3600
const CLOSES_AT = NIGHT_START + 19 * 3600

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function template(database: TestDatabase, venueId: string, slots: TemplateSlot[]): void {
  const actorId = person(database, 'officer')
  for (const statement of replaceTemplateStatements(venueId, slots, actorId)) run(database, statement)
}

const TWO_BAR: TemplateSlot[] = [
  { role: 'DUTY_MANAGER', count: 1 },
  { role: 'DOOR', count: 2 },
  { role: 'BAR', count: 2 },
]

interface OpeningFixture { openingId: string, venueId: string }

// A venue with a template, an opening on tonight, and its slots stamped: what every claim below
// starts from.
function opening(database: TestDatabase, slots: TemplateSlot[] = TWO_BAR, stamp = true): OpeningFixture {
  const venue = testVenue(database)
  template(database, venue.id, slots)
  const actorId = person(database, 'officer')
  run(database, createOpeningStatement('opening-a', {
    venueId: venue.id,
    night: NIGHT,
    label: 'Society social',
    startsAt: OPENS_AT,
    endsAt: CLOSES_AT,
  }, actorId))
  if (stamp) run(database, stampOpeningShiftsStatement('opening-a'))
  return { openingId: 'opening-a', venueId: venue.id }
}

interface SlotRow { id: string, slot: number, user_id: string | null, status: string }

function slotsOn(database: TestDatabase, openingId: string): SlotRow[] {
  return rows<SlotRow>(database,
    'SELECT id, slot, user_id, status FROM bar_opening_shifts WHERE opening_id = ? ORDER BY slot',
    openingId)
}

describe('an opening records its own window and status (E-130 criterion 1)', () => {
  test('the database refuses an end at or before the start', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      template(database, venue.id, TWO_BAR)
      const actorId = person(database, 'officer')
      const closesFirst = createOpeningStatement('opening-backwards', {
        venueId: venue.id,
        night: NIGHT,
        label: 'A bar that shuts before it opens',
        startsAt: CLOSES_AT,
        endsAt: OPENS_AT,
      }, actorId)
      expect(() => run(database, closesFirst)).toThrow()

      const zeroLength = createOpeningStatement('opening-instant', {
        venueId: venue.id,
        night: NIGHT,
        label: 'A bar open for no time at all',
        startsAt: OPENS_AT,
        endsAt: OPENS_AT,
      }, actorId)
      expect(() => run(database, zeroLength)).toThrow()
    })
  })

  test('an opening is PLANNED or CANCELLED, and never a shift status', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      expect(rows<{ status: string }>(database, 'SELECT status FROM bar_openings WHERE id = ?', openingId)[0])
        .toMatchObject({ status: 'PLANNED' })

      expect(() => database.batch([['UPDATE bar_openings SET status = ? WHERE id = ?', 'OPEN', openingId]])).toThrow()
      expect(() => database.batch([['UPDATE bar_openings SET status = ? WHERE id = ?', 'CONFIRMED', openingId]])).toThrow()
      expect(() => database.batch([['UPDATE bar_openings SET status = ? WHERE id = ?', 'CANCELLED', openingId]])).not.toThrow()
    })
  })
})

describe('creating an opening stamps bar slots from the template (E-130 criterion 2)', () => {
  test('a template with two bar slots stamps two, numbered from one and naming nobody', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)

      const stamped = slotsOn(database, openingId)
      expect(stamped.map(slot => slot.slot)).toEqual([1, 2])
      expect(stamped.every(slot => slot.status === 'OPEN' && slot.user_id === null)).toBe(true)
    })
  })

  test('a venue with no bar row in its template stamps nothing, and plans no opening either', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 2 },
      ])

      expect(rows(database, 'SELECT id FROM bar_openings WHERE id = ?', openingId)).toHaveLength(0)
      expect(slotsOn(database, openingId)).toHaveLength(0)
    })
  })

  test('a second stamping stamps nothing, because a slot is unique within its opening', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)

      run(database, stampOpeningShiftsStatement(openingId))
      expect(slotsOn(database, openingId)).toHaveLength(2)

      expect(() => database.batch([[
        `INSERT INTO bar_opening_shifts (id, opening_id, slot, status) VALUES (?, ?, 1, 'OPEN')`,
        'slot-duplicate', openingId,
      ]])).toThrow()
    })
  })

  test('an open slot names nobody and a claimed one names somebody', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)

      expect(() => database.batch([['UPDATE bar_opening_shifts SET user_id = ? WHERE id = ?', 'one', slot!.id]])).toThrow()
      expect(() => database.batch([['UPDATE bar_opening_shifts SET status = ? WHERE id = ?', 'CLAIMED', slot!.id]])).toThrow()
    })
  })
})

describe('a slot is claimed through the rota\'s own race-safe write (E-130 criterion 3)', () => {
  test('two simultaneous claims on one slot resolve to exactly one winner', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      person(database, 'two')
      const [slot] = slotsOn(database, openingId)

      const answers = await race(2, async (index) => {
        const claimant = index === 0 ? 'one' : 'two'
        const claimed = run(database, claimOpeningShiftStatement(slot!.id, claimant, 'CONFIRMED'))
        return { status: claimed.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      const held = slotsOn(database, openingId)[0]!
      expect(['one', 'two']).toContain(held.user_id!)
      expect(held.status).toBe('CONFIRMED')
    })
  })

  test('one person holds one slot on an opening, whichever slot they reach for second', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [first, second] = slotsOn(database, openingId)

      expect(run(database, claimOpeningShiftStatement(first!.id, 'one', 'CONFIRMED'))).toHaveLength(1)
      expect(run(database, claimOpeningShiftStatement(second!.id, 'one', 'CONFIRMED'))).toHaveLength(0)

      const held = slotsOn(database, openingId)
      expect(held.filter(slot => slot.user_id === 'one')).toHaveLength(1)
      expect(held[1]!.status).toBe('OPEN')
    })
  })

  test('a queued claim is not authority until it is approved', async () => {
    await withDatabase(async (database) => {
      const { openingId, venueId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)

      expect(run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CLAIMED'))).toHaveLength(1)

      const bounds = showNightBounds(NIGHT)
      const from = Math.floor(bounds.from.getTime() / 1000)
      const to = Math.floor(bounds.to.getTime() / 1000)
      const authority = (): unknown[] =>
        run(database, confirmedOpeningShiftsTonightQuery('one', from, to, { venueId }))

      expect(authority()).toHaveLength(0)

      expect(run(database, approveOpeningShiftStatement(slot!.id))).toHaveLength(1)
      expect(authority()).toHaveLength(1)
    })
  })

  // An opening has no approvals queue of its own, so nothing else would ever reopen the slot.
  test('a declined claim is stood back down to open, naming nobody', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CLAIMED'))
      run(database, declineOpeningShiftStatement(slot!.id, 'Not trained yet'))

      expect(run(database, unconfirmOpeningShiftStatement(slot!.id))).toHaveLength(1)

      const reopened = slotsOn(database, openingId)[0]!
      expect(reopened).toMatchObject({ status: 'OPEN', user_id: null })
      expect(run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CONFIRMED'))).toHaveLength(1)
    })
  })

  test('a cancelled opening holds no authority, whoever is confirmed on it', async () => {
    await withDatabase(async (database) => {
      const { openingId, venueId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CONFIRMED'))

      const bounds = showNightBounds(NIGHT)
      const from = Math.floor(bounds.from.getTime() / 1000)
      const to = Math.floor(bounds.to.getTime() / 1000)
      expect(run(database, confirmedOpeningShiftsTonightQuery('one', from, to, { venueId }))).toHaveLength(1)

      run(database, cancelOpeningStatement(openingId))
      run(database, cancelOpeningShiftsStatement(openingId))

      expect(run(database, confirmedOpeningShiftsTonightQuery('one', from, to, { venueId }))).toHaveLength(0)
    })
  })
})

describe('cancelling an opening cancels its shifts (E-130 criterion 5)', () => {
  test('whoever held a slot keeps their name on it, and an unclaimed one still names nobody', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [first] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(first!.id, 'one', 'CONFIRMED'))

      run(database, cancelOpeningStatement(openingId))
      run(database, cancelOpeningShiftsStatement(openingId))

      const after = slotsOn(database, openingId)
      expect(after.every(slot => slot.status === 'CANCELLED')).toBe(true)
      expect(after[0]!.user_id).toBe('one')
      expect(after[1]!.user_id).toBeNull()
    })
  })
})
