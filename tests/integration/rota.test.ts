import { describe, expect, test } from 'bun:test'
import {
  backfillVenueStatement,
  cancelOrphanedShiftsStatement,
  cancelShiftsStatement,
  replaceTemplateStatements,
  stampPerformanceStatement,
} from '#server/utils/rota'
import { shiftConstraintRefusal } from '#shared/utils/rota'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-101, E-102 and E-106 against the real migrations. The two staffing invariants are the
// database's, so they are attempted here in SQL and not only through a route (E-106 criterion 4).

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

interface Shift { id: string, performance_id: string, role: string, slot: number, user_id: string | null, status: string }

function shiftsOn(database: TestDatabase, performanceId: string): Shift[] {
  return rows<Shift>(database,
    'SELECT id, performance_id, role, slot, user_id, status FROM shifts WHERE performance_id = ? ORDER BY role, slot',
    performanceId)
}

// What a route would hand back. Proving the mapping here is what keeps a raw database error
// from ever reaching a caller (E-106 criterion 3).
function refusalFor(write: () => void): { statusCode: number, statusMessage: string } | null {
  try {
    write()
    return null
  }
  catch (error) {
    const refusal = shiftConstraintRefusal(error)
    if (!refusal) throw error
    return refusal
  }
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

// A house template: one duty manager, two on the door and one behind the bar.
function template(database: TestDatabase, venueId: string, actorId = 'actor'): void {
  person(database, actorId)
  const slots = [
    { role: 'DUTY_MANAGER' as const, count: 1 },
    { role: 'DOOR' as const, count: 2 },
    { role: 'BAR' as const, count: 1 },
  ]
  for (const statement of replaceTemplateStatements(venueId, slots, actorId)) run(database, statement)
}

describe('a template stamps a rota onto a performance (E-102 criteria 1 and 3)', () => {
  test('one open shift per slot, with nobody named', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)

      run(database, stampPerformanceStatement(tonight.performanceId))

      const stamped = shiftsOn(database, tonight.performanceId)
      expect(stamped.length).toBe(4)
      expect(stamped.every(shift => shift.status === 'OPEN')).toBe(true)
      expect(stamped.every(shift => shift.user_id === null)).toBe(true)
      expect(stamped.map(shift => `${shift.role}:${shift.slot}`).sort())
        .toEqual(['BAR:1', 'DOOR:1', 'DOOR:2', 'DUTY_MANAGER:1'])
    })
  })

  test('a venue with no template stamps nothing and does not fail (E-101 criterion 4)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      run(database, stampPerformanceStatement(tonight.performanceId))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })

  test('a cancelled performance is never stamped', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database, { status: 'CANCELLED' })
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })
})

describe('the backfill is idempotent (E-102 criterion 2)', () => {
  test('running it twice creates no duplicate shifts', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)

      const first = run(database, backfillVenueStatement(tonight.venueId, 0))
      const second = run(database, backfillVenueStatement(tonight.venueId, 0))

      expect(first.length).toBe(4)
      expect(second.length).toBe(0)
      expect(shiftsOn(database, tonight.performanceId).length).toBe(4)
    })
  })

  test('a slot added to the template later is stamped, and the rest are left alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      person(database, 'actor')
      for (const statement of replaceTemplateStatements(tonight.venueId, [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, backfillVenueStatement(tonight.venueId, 0))
      const before = shiftsOn(database, tonight.performanceId)[0]!

      template(database, tonight.venueId)
      run(database, backfillVenueStatement(tonight.venueId, 0))

      const after = shiftsOn(database, tonight.performanceId)
      expect(after.length).toBe(4)
      expect(after.find(shift => shift.role === 'DUTY_MANAGER')!.id).toBe(before.id)
    })
  })

  // Editing a template affects only performances stamped afterwards (E-101 criterion 3).
  test('narrowing a template leaves an already stamped rota alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId))

      for (const statement of replaceTemplateStatements(tonight.venueId, [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }

      expect(shiftsOn(database, tonight.performanceId).length).toBe(4)
    })
  })

  test('the backfill leaves a night that has already started alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, backfillVenueStatement(tonight.venueId, tonight.startsAt + 1))
      expect(shiftsOn(database, tonight.performanceId)).toEqual([])
    })
  })
})

// Two venues may run at once and one venue may run a matinee and an evening, so a shift belongs
// to exactly one performance and never to a day or a venue (E-127 criterion 1).
describe('a rota belongs to a performance', () => {
  test('a matinee and an evening at one venue each get their own rota', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'a', curtainHoursAfterNightStart: 10.5 })
      const evening = tonightsPerformance(database, {
        suffix: 'b', venueId: matinee.venueId, curtainHoursAfterNightStart: 15.5,
      })
      template(database, matinee.venueId)

      run(database, backfillVenueStatement(matinee.venueId, 0))

      expect(shiftsOn(database, matinee.performanceId).length).toBe(4)
      expect(shiftsOn(database, evening.performanceId).length).toBe(4)
    })
  })

  test('the same person may hold a shift on both performances of a day', async () => {
    await withDatabase(async (database) => {
      const matinee = tonightsPerformance(database, { suffix: 'a', curtainHoursAfterNightStart: 10.5 })
      const evening = tonightsPerformance(database, {
        suffix: 'b', venueId: matinee.venueId, curtainHoursAfterNightStart: 15.5,
      })
      const who = person(database, 'holder')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-matinee', matinee.performanceId, 'DUTY_MANAGER', who, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-evening', evening.performanceId, 'DUTY_MANAGER', who, 'CONFIRMED'],
      ])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts WHERE user_id = ?', who)[0]!.n).toBe(2)
    })
  })
})

describe('the staffing invariants are the database\'s (E-106 criteria 1 and 4)', () => {
  test('a second confirmed duty manager on one performance fails at the write', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-one', tonight.performanceId, 'DUTY_MANAGER', first, 'CONFIRMED']])

      const refusal = refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-two', tonight.performanceId, 'DUTY_MANAGER', second, 'CONFIRMED'],
      ]))
      expect(refusal?.statusCode).toBe(409)
      expect(refusal?.statusMessage).toContain('confirmed duty manager')
    })
  })

  test('two performances running at once take two confirmed duty managers', async () => {
    await withDatabase(async (database) => {
      const house = tonightsPerformance(database, { suffix: 'a' })
      testVenue(database, { suffix: 'b', name: 'The Studio' })
      const studio = tonightsPerformance(database, { suffix: 'b', venueId: 'venue-b' })
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-house', house.performanceId, 'DUTY_MANAGER', first, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-studio', studio.performanceId, 'DUTY_MANAGER', second, 'CONFIRMED'],
      ])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts WHERE status = \'CONFIRMED\'')[0]!.n).toBe(2)
    })
  })

  test('an unconfirmed duty manager claim does not take the slot', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const first = person(database, 'first')
      const second = person(database, 'second')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-one', tonight.performanceId, 'DUTY_MANAGER', first, 'CLAIMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, ?, ?)',
          'shift-two', tonight.performanceId, 'DUTY_MANAGER', second, 'CLAIMED'],
      ])

      expect(shiftsOn(database, tonight.performanceId).length).toBe(2)
    })
  })

  test('an open shift cannot name a person (E-106 criterion 2)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')

      const refusal = refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-open', tonight.performanceId, 'DOOR', who, 'OPEN'],
      ]))
      expect(refusal?.statusCode).toBe(409)
      expect(refusal?.statusMessage).toContain('names nobody')
    })
  })

  test('an assigned shift cannot name nobody', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)

      for (const status of ['CLAIMED', 'CONFIRMED', 'DECLINED']) {
        expect(refusalFor(() => database.batch([
          ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, NULL, ?)',
            `shift-${status}`, tonight.performanceId, 'DOOR', status],
        ]))?.statusCode).toBe(409)
      }
    })
  })

  test('a cancelled shift may name somebody or nobody', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
          'shift-held', tonight.performanceId, 'DOOR', who, 'CANCELLED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 2, NULL, ?)',
          'shift-open', tonight.performanceId, 'DOOR', 'CANCELLED'],
      ])

      expect(shiftsOn(database, tonight.performanceId).length).toBe(2)
    })
  })

  test('one slot is stamped once (E-102 criterion 2)', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)

      database.batch([['INSERT INTO shifts (id, performance_id, role, slot) VALUES (?, ?, ?, 1)',
        'shift-one', tonight.performanceId, 'DOOR']])

      expect(refusalFor(() => database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot) VALUES (?, ?, ?, 1)',
          'shift-two', tonight.performanceId, 'DOOR'],
      ]))?.statusMessage).toContain('already on the rota')
    })
  })
})

describe('cancelling a performance cancels its shifts (E-102 criterion 4)', () => {
  test('every shift on the performance is cancelled, and the holder is kept', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'DUTY_MANAGER\'',
        who, tonight.performanceId]])

      run(database, cancelShiftsStatement(tonight.performanceId))

      const after = shiftsOn(database, tonight.performanceId)
      expect(after.every(shift => shift.status === 'CANCELLED')).toBe(true)
      expect(after.find(shift => shift.role === 'DUTY_MANAGER')!.user_id).toBe(who)
    })
  })

  test('a cancelled performance is not stamped again by a backfill', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId))
      database.batch([['UPDATE performances SET status = \'CANCELLED\' WHERE id = ?', tonight.performanceId]])
      run(database, cancelShiftsStatement(tonight.performanceId))

      run(database, backfillVenueStatement(tonight.venueId, 0))

      expect(shiftsOn(database, tonight.performanceId).every(shift => shift.status === 'CANCELLED')).toBe(true)
    })
  })
})

describe('a venue move cancels only a held shift the new house does not staff at all', () => {
  test('a role the new venue still staffs is left alone', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      template(database, 'venue-b')
      run(database, stampPerformanceStatement(tonight.performanceId))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'DUTY_MANAGER\'',
        who, tonight.performanceId]])

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const dutyManager = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
      expect(dutyManager).toMatchObject({ status: 'CONFIRMED', user_id: who })
    })
  })

  test('a role the new venue does not staff at all is cancelled, and the holder is kept', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      for (const statement of replaceTemplateStatements('venue-b', [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, stampPerformanceStatement(tonight.performanceId))
      const who = person(database, 'holder')
      database.batch([['UPDATE shifts SET user_id = ?, status = \'CONFIRMED\' WHERE performance_id = ? AND role = \'BAR\'',
        who, tonight.performanceId]])

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const bar = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'BAR')
      expect(bar).toMatchObject({ status: 'CANCELLED', user_id: who })
      const dutyManager = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'DUTY_MANAGER')
      expect(dutyManager?.status).toBe('OPEN')
    })
  })

  test('an open shift is untouched: it is restamped away separately, never cancelled', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      testVenue(database, { suffix: 'b' })
      for (const statement of replaceTemplateStatements('venue-b', [{ role: 'DUTY_MANAGER', count: 1 }], 'actor')) {
        run(database, statement)
      }
      run(database, stampPerformanceStatement(tonight.performanceId))

      run(database, cancelOrphanedShiftsStatement(tonight.performanceId, 'venue-b'))

      const bar = shiftsOn(database, tonight.performanceId).find(shift => shift.role === 'BAR')
      expect(bar?.status).toBe('OPEN')
    })
  })
})

// D1 caps a statement at 100 bound parameters, and nothing may bind per row (0003, 0006).
describe('no statement binds per performance or per slot', () => {
  test('stamping a venue binds the same parameters whatever the template holds', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      for (let index = 0; index < 30; index += 1) {
        database.batch([[
          'INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          `performance-${index}`, tonight.showId, tonight.venueId, tonight.startsAt + index * 60, 'ON_SALE',
        ]])
      }

      const [, ...parameters] = boundStatement(database, backfillVenueStatement(tonight.venueId, 0))
      expect(parameters.length).toBeLessThan(MAX_BOUND_PARAMETERS)

      run(database, backfillVenueStatement(tonight.venueId, 0))
      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts')[0]!.n).toBe(31 * 4)
    })
  })

  test('replacing a template binds per slot and never per venue', async () => {
    await withDatabase(async (database) => {
      const statements = replaceTemplateStatements('venue-a', [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'DOOR', count: 20 },
        { role: 'BAR', count: 20 },
      ], 'actor')
      for (const statement of statements) {
        expect(boundStatement(database, statement).length - 1).toBeLessThan(MAX_BOUND_PARAMETERS)
      }
      expect(statements.length).toBe(4)
    })
  })
})

describe('a template is replaced whole', () => {
  test('saving over a template leaves exactly what was saved', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      template(database, 'venue-a')

      for (const statement of replaceTemplateStatements('venue-a', [
        { role: 'DUTY_MANAGER', count: 1 },
        { role: 'BAR', count: 3 },
      ], 'actor')) run(database, statement)

      const held = rows<{ role: string, count: number }>(database,
        'SELECT role, "count" FROM shift_templates WHERE venue_id = ? ORDER BY role', 'venue-a')
      expect(held.map(one => `${one.role}:${one.count}`)).toEqual(['BAR:3', 'DUTY_MANAGER:1'])
    })
  })

  test('the database refuses a second duty manager slot at a venue', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      expect(refusalFor(() => database.batch([
        ['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
          'template-one', 'venue-a', 'DUTY_MANAGER', 2],
      ]))?.statusMessage).toContain('exactly one duty manager')
    })
  })

  test('a venue names each role once', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      database.batch([['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
        'template-one', 'venue-a', 'DOOR', 2]])

      expect(refusalFor(() => database.batch([
        ['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)',
          'template-two', 'venue-a', 'DOOR', 3],
      ]))?.statusMessage).toContain('each role once')
    })
  })

  test('a shift template goes when its venue does', async () => {
    await withDatabase(async (database) => {
      testVenue(database, { suffix: 'a' })
      template(database, 'venue-a')
      database.batch([['DELETE FROM venues WHERE id = ?', 'venue-a']])
      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shift_templates')[0]!.n).toBe(0)
    })
  })
})

describe('a shift goes when its performance does', () => {
  test('deleting a performance takes its rota with it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      template(database, tonight.venueId)
      run(database, stampPerformanceStatement(tonight.performanceId))

      database.batch([['DELETE FROM performances WHERE id = ?', tonight.performanceId]])

      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM shifts')[0]!.n).toBe(0)
    })
  })

  test('a person who has held a shift cannot be deleted out from under it', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const who = person(database, 'holder')
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
        'shift-one', tonight.performanceId, 'DOOR', who, 'CONFIRMED']])

      expect(() => database.batch([['DELETE FROM users WHERE id = ?', who]])).toThrow()
    })
  })
})
