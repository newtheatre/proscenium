import { describe, expect, test } from 'bun:test'
import {
  addOpeningShiftStatement,
  addedSlotAuditStatement,
  approveOpeningShiftStatement,
  barSlotCountQuery,
  cancelOpeningShiftsStatement,
  cancelOpeningStatement,
  claimOpeningShiftStatement,
  confirmedOpeningShiftsTonightQuery,
  createOpeningStatement,
  declineOpeningShiftStatement,
  myOpeningShiftsQuery,
  removeOpeningShiftStatement,
  stampOpeningShiftsStatement,
  unconfirmOpeningShiftStatement,
} from '#server/utils/bar-openings'
import { replaceTemplateStatements } from '#server/utils/rota'
import { auditEntry, changes } from '#shared/utils/audit'
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

// The bar's training gate as the approval route hands it to the write (E-105 criterion 3).
const BAR_GATE = { moduleId: 'ADMN-102', today: '2026-10-12' }

function trained(database: TestDatabase, userId: string, expiresOn: string | null = null): void {
  database.batch([
    ['INSERT OR IGNORE INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
    ['INSERT OR IGNORE INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'ADMN-102', 'ADMN', 'MODULE', 'Bar induction'],
    [`INSERT INTO training_records (id, user_id, module_id, awarded_on, expires_on, source)
      VALUES (?, ?, ?, '2025-09-01', ?, 'SIGNOFF')`, `tr-${userId}`, userId, 'ADMN-102', expiresOn],
  ])
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

  // A bar row a venue kept from before it was marked external is read by nothing (E-101
  // criterion 5): the venue is staffed ad hoc, and its bar with it.
  test('an external venue\'s leftover bar row plans no opening and stamps no slot', async () => {
    await withDatabase(async (database) => {
      const venue = testVenue(database)
      template(database, venue.id, TWO_BAR)
      database.batch([['UPDATE venues SET is_external = 1 WHERE id = ?', venue.id]])
      expect(run(database, barSlotCountQuery(venue.id))).toEqual([])

      const actorId = person(database, 'officer')
      const input = { venueId: venue.id, night: NIGHT, label: 'Society social', startsAt: OPENS_AT, endsAt: CLOSES_AT }
      run(database, createOpeningStatement('opening-away', input, actorId))
      expect(rows(database, 'SELECT id FROM bar_openings WHERE id = ?', 'opening-away')).toHaveLength(0)

      database.batch([[`INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'PLANNED', ?)`, 'opening-forced', venue.id, NIGHT, 'Forced', OPENS_AT, CLOSES_AT, actorId]])
      run(database, stampOpeningShiftsStatement('opening-forced'))
      expect(slotsOn(database, 'opening-forced')).toHaveLength(0)
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

      trained(database, 'one')
      expect(run(database, approveOpeningShiftStatement(slot!.id, BAR_GATE))).toHaveLength(1)
      expect(authority()).toHaveLength(1)
    })
  })

  test('approval re-runs the bar gate: a claimant who no longer holds it stays claimed (#1302)', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CLAIMED'))
      trained(database, 'one', '2026-10-01')

      expect(run(database, approveOpeningShiftStatement(slot!.id, BAR_GATE))).toHaveLength(0)
      expect(slotsOn(database, openingId)[0]).toMatchObject({ status: 'CLAIMED', user_id: 'one' })
      expect(run(database, approveOpeningShiftStatement(slot!.id, { moduleId: null, today: BAR_GATE.today }))).toHaveLength(0)
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

describe('a planned opening\'s staffing changes one-off after stamping (E-130 criterion 7)', () => {
  test('an added slot is numbered after the highest the opening holds, open and naming nobody', async () => {
    await withDatabase(async (database) => {
      const { openingId, venueId } = opening(database)

      const added = run(database, addOpeningShiftStatement('slot-added', openingId)) as { id: string, slot: number }[]
      expect(added).toEqual([{ id: 'slot-added', slot: 3 }])

      const after = slotsOn(database, openingId)
      expect(after.map(slot => slot.slot)).toEqual([1, 2, 3])
      expect(after[2]).toMatchObject({ status: 'OPEN', user_id: null })
      // The venue's usual count is the template's business, and a one-off leaves it alone.
      expect(rows<{ count: number }>(database,
        `SELECT "count" AS count FROM shift_templates WHERE venue_id = ? AND role = 'BAR'`, venueId)[0])
        .toMatchObject({ count: 2 })
    })
  })

  // Numbers come back once the highest slot goes, so the entry carries the id as well.
  test('an added slot is audited with its id and the number the write chose, and only when added', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      const entryFor = (slotId: string) => auditEntry({
        actorId: 'officer',
        action: 'bar-opening-shift.added',
        target: `bar-opening:${openingId}`,
        detail: changes({ slotId: [null, slotId], slot: [null, null] }),
      })
      const detailsOf = (): unknown[] => rows<{ detail: string }>(database,
        `SELECT detail FROM audit_log WHERE action = 'bar-opening-shift.added' ORDER BY rowid`)
        .map(row => JSON.parse(row.detail))

      run(database, addOpeningShiftStatement('slot-added', openingId))
      run(database, addedSlotAuditStatement(entryFor('slot-added'), 'slot-added'))
      expect(detailsOf()).toEqual([{ changes: { slotId: { from: null, to: 'slot-added' }, slot: { from: null, to: 3 } } }])

      run(database, cancelOpeningStatement(openingId))
      expect(run(database, addOpeningShiftStatement('slot-late', openingId))).toHaveLength(0)
      run(database, addedSlotAuditStatement(entryFor('slot-late'), 'slot-late'))
      expect(detailsOf()).toHaveLength(1)
    })
  })

  test('two slots added at once are both added, one number apart', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)

      const answers = await race(2, async index =>
        run(database, addOpeningShiftStatement(`slot-added-${index}`, openingId)).length)

      expect(answers).toEqual([1, 1])
      expect(slotsOn(database, openingId).map(slot => slot.slot)).toEqual([1, 2, 3, 4])
    })
  })

  test('a cancelled opening takes no new slot', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      run(database, cancelOpeningStatement(openingId))
      run(database, cancelOpeningShiftsStatement(openingId))

      expect(run(database, addOpeningShiftStatement('slot-late', openingId))).toHaveLength(0)
      expect(slotsOn(database, openingId)).toHaveLength(2)
    })
  })

  test('an open slot is removed, and the others are left as they were', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      const [first, second] = slotsOn(database, openingId)

      expect(run(database, removeOpeningShiftStatement(second!.id))).toEqual([{ id: second!.id, slot: 2 }])
      expect(slotsOn(database, openingId).map(slot => slot.id)).toEqual([first!.id])
    })
  })

  test('a slot that names somebody is refused, claimed, confirmed or declined', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database, [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'BAR', count: 4 },
      ])
      person(database, 'one')
      person(database, 'two')
      person(database, 'three')
      const [claimed, confirmed, declined] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(claimed!.id, 'one', 'CLAIMED'))
      run(database, claimOpeningShiftStatement(confirmed!.id, 'two', 'CONFIRMED'))
      run(database, claimOpeningShiftStatement(declined!.id, 'three', 'CLAIMED'))
      run(database, declineOpeningShiftStatement(declined!.id, 'Not trained yet'))

      for (const slot of [claimed!, confirmed!, declined!]) {
        expect(run(database, removeOpeningShiftStatement(slot.id))).toHaveLength(0)
      }
      expect(slotsOn(database, openingId)).toHaveLength(4)
    })
  })

  test('the last slot on an opening is refused', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      const [first, second] = slotsOn(database, openingId)

      expect(run(database, removeOpeningShiftStatement(first!.id))).toHaveLength(1)
      expect(run(database, removeOpeningShiftStatement(second!.id))).toHaveLength(0)
      expect(slotsOn(database, openingId)).toHaveLength(1)
    })
  })

  test('a slot on a cancelled opening is refused', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      run(database, cancelOpeningStatement(openingId))
      run(database, cancelOpeningShiftsStatement(openingId))
      const [first] = slotsOn(database, openingId)

      expect(run(database, removeOpeningShiftStatement(first!.id))).toHaveLength(0)
    })
  })

  test('a removal and a claim racing on one open slot resolve to exactly one winner', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)

      const answers = await race(2, async (index) => {
        const written = index === 0
          ? run(database, removeOpeningShiftStatement(slot!.id))
          : run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CONFIRMED'))
        return { status: written.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)

      // Either the slot is gone and nobody holds it, or it is held and still there.
      const left = slotsOn(database, openingId).filter(one => one.id === slot!.id)
      if (left.length === 1) expect(left[0]).toMatchObject({ user_id: 'one', status: 'CONFIRMED' })
      else expect(rows(database, 'SELECT id FROM bar_opening_shifts WHERE user_id = ?', 'one')).toHaveLength(0)
    })
  })

  test('two removals racing for the last two slots leave one slot standing', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      const [first, second] = slotsOn(database, openingId)

      const answers = await race(2, async (index) => {
        const written = run(database, removeOpeningShiftStatement((index === 0 ? first : second)!.id))
        return { status: written.length === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)
      expect(slotsOn(database, openingId)).toHaveLength(1)
    })
  })
})

// An opening is tonight's work until 04:00, as a performance shift is, so My rota keeps it after
// the bar shuts rather than dropping it the moment the opening ends (0014, issue 1305).
describe('a member\'s own opening slots stay on their rota through the night (E-130 criterion 4)', () => {
  test('after the opening ends tonight it is still listed; once the night is over it is not', async () => {
    await withDatabase(async (database) => {
      const { openingId } = opening(database)
      person(database, 'one')
      const [slot] = slotsOn(database, openingId)
      run(database, claimOpeningShiftStatement(slot!.id, 'one', 'CONFIRMED'))

      const listed = (at: number): unknown[] => run(database, myOpeningShiftsQuery('one', at))
      expect(listed(CLOSES_AT + 3600)).toHaveLength(1)
      expect(listed(NIGHT_START + 24 * 3600 + 60)).toHaveLength(0)
    })
  })
})
