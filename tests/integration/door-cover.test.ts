import { describe, expect, test } from 'bun:test'
import { doorCoverStatement, dutyManagerTonightQuery } from '#server/utils/door-cover'
import { reportDoorCoversQuery } from '#server/utils/night-report'
import { doorCoverEntry, DOOR_COVER_ACTION } from '#shared/utils/night-authority'
import { showNightBounds } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { race } from '#tests/helpers/race'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Door cover by tonight's duty manager, recorded once per duty manager, night and venue on the
// real migrations, and read back by the night report (0095, E-123, issue 1306).

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

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86_400

// Signed in, so a grant given below is held rather than pending (A-132).
function person(database: TestDatabase, id: string, name = `Someone ${id}`): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified, last_login_at) VALUES (?, ?, ?, 1, ?)', id, name, `${id}@e2e.newtheatre.org.uk`, NOW - DAY]])
  return id
}

function granted(database: TestDatabase, id: string, role = 'COMMITTEE', expiresAt: number | null = NOW + 30 * DAY): string {
  database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', `grant-${id}-${role}`, id, role, expiresAt]])
  return id
}

// Tonight's duty manager, who holds the committee role a duty manager shift needs (0115).
const onCommittee = (database: TestDatabase, id: string, name?: string): string => granted(database, person(database, id, name))

const covers = (database: TestDatabase): { target: string }[] =>
  rows(database, 'SELECT target FROM audit_log WHERE action = ? ORDER BY target', DOOR_COVER_ACTION)

describe('cover is written once per duty manager, night and venue (0095)', () => {
  test('a second act on the same night and venue adds no row; another venue is its own', async () => {
    await withDatabase((database) => {
      const rowan = person(database, 'rowan')
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1'])))
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1'])))
      run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-b', ['p-2'])))
      expect(covers(database).map(row => row.target)).toEqual(['door-cover:2026-10-17:venue-a', 'door-cover:2026-10-17:venue-b'])
    })
  })

  // The predicate rides the insert, so two first acts racing write one row between them (0003).
  test('two first acts at once write one row', async () => {
    await withDatabase(async (database) => {
      const rowan = person(database, 'rowan')
      const written = await race(2, async () => run(database, doorCoverStatement(doorCoverEntry(rowan, '2026-10-17', 'venue-a', ['p-1']))))
      expect(written.map(one => one.length).sort()).toEqual([0, 1])
      expect(covers(database)).toHaveLength(1)
    })
  })
})

describe('the night report names who covered the door (E-123 criterion 1, 0095)', () => {
  test('the duty manager who covered this performance, and nobody from another night or venue', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const rowan = person(database, 'rowan', 'Rowan Ellis')
      const other = person(database, 'aoife', 'Aoife Byrne')
      run(database, doorCoverStatement(doorCoverEntry(rowan, tonight.night, tonight.venueId, [tonight.performanceId])))
      run(database, doorCoverStatement(doorCoverEntry(other, '2026-01-01', tonight.venueId, [tonight.performanceId])))
      run(database, doorCoverStatement(doorCoverEntry(other, tonight.night, 'venue-elsewhere', [tonight.performanceId])))

      const found = run(database, reportDoorCoversQuery(tonight.performanceId, tonight.venueId, tonight.night))
      expect(found).toEqual([{ name: 'Rowan Ellis' }])
    })
  })

  // One row a night and venue, so it names every house the duty manager runs there: covering the
  // matinee's door still puts the cover on the evening's report (issue 1306 review).
  test('on a two-house day, the second house\'s report names the cover too', async () => {
    await withDatabase((database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee' })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: matinee.venueId })
      const rowan = person(database, 'rowan', 'Rowan Ellis')
      run(database, doorCoverStatement(doorCoverEntry(rowan, matinee.night, matinee.venueId, [matinee.performanceId, evening.performanceId])))
      run(database, doorCoverStatement(doorCoverEntry(rowan, matinee.night, matinee.venueId, [evening.performanceId])))

      expect(run(database, reportDoorCoversQuery(evening.performanceId, evening.venueId, evening.night))).toEqual([{ name: 'Rowan Ellis' }])
      expect(run(database, reportDoorCoversQuery(matinee.performanceId, matinee.venueId, matinee.night))).toEqual([{ name: 'Rowan Ellis' }])
    })
  })
})

// Who a door refusal points to: tonight's confirmed duty manager for the request's scope, named
// only to somebody on a confirmed shift there (0095, issue 1306 review).
describe('tonight\'s duty manager for a door refusal', () => {
  function shift(database: TestDatabase, id: string, performanceId: string, role: string, userId: string, status = 'CONFIRMED'): void {
    database.batch([['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
      id, performanceId, role, userId, status]])
  }

  function asked(database: TestDatabase, askerId: string, night: string, scope: { venueId?: string, performanceId?: string }): { name: string, onTeam: number }[] {
    const { from, to } = showNightBounds(night)
    return run(database, dutyManagerTonightQuery(askerId, Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), scope)) as { name: string, onTeam: number }[]
  }

  test('the confirmed duty manager on this performance, and whether the asker works it', async () => {
    await withDatabase((database) => {
      const house = tonightsPerformance(database)
      const rowan = onCommittee(database, 'rowan', 'Rowan Ellis')
      const barkeep = person(database, 'barkeep')
      const stranger = person(database, 'stranger')
      shift(database, 'dm', house.performanceId, 'DUTY_MANAGER', rowan)
      shift(database, 'bar', house.performanceId, 'BAR', barkeep)

      expect(asked(database, barkeep, house.night, { performanceId: house.performanceId })).toEqual([{ name: 'Rowan Ellis', onTeam: 1 }])
      expect(asked(database, stranger, house.night, { performanceId: house.performanceId })).toEqual([{ name: 'Rowan Ellis', onTeam: 0 }])
    })
  })

  test('not a claim, another performance, a cancelled one, or an account disabled or erased', async () => {
    await withDatabase((database) => {
      const house = tonightsPerformance(database, { suffix: 'house' })
      const studio = tonightsPerformance(database, { suffix: 'studio' })
      const dark = tonightsPerformance(database, { suffix: 'dark' })
      const late = tonightsPerformance(database, { suffix: 'late', venueId: house.venueId })
      const early = tonightsPerformance(database, { suffix: 'early', venueId: house.venueId })
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', dark.performanceId]])
      const asker = person(database, 'asker')
      shift(database, 'claimed', house.performanceId, 'DUTY_MANAGER', onCommittee(database, 'claimant'), 'CLAIMED')
      shift(database, 'elsewhere', studio.performanceId, 'DUTY_MANAGER', onCommittee(database, 'elsewhere'))
      shift(database, 'cancelled', dark.performanceId, 'DUTY_MANAGER', onCommittee(database, 'dark'))
      shift(database, 'disabled', late.performanceId, 'DUTY_MANAGER', onCommittee(database, 'disabled'))
      shift(database, 'erased', early.performanceId, 'DUTY_MANAGER', onCommittee(database, 'erased'))
      database.batch([
        ['UPDATE users SET disabled = 1 WHERE id = ?', 'disabled'],
        ['UPDATE users SET anonymised_at = unixepoch() WHERE id = ?', 'erased'],
      ])

      expect(asked(database, asker, house.night, { performanceId: house.performanceId })).toEqual([])
      expect(asked(database, asker, house.night, { venueId: house.venueId })).toEqual([])
      expect(asked(database, asker, dark.night, { performanceId: dark.performanceId })).toEqual([])
    })
  })

  // Only a holder the shift actually opens for is named: nobody else can open the door (0115).
  const STANDINGS = [
    ['no role at all', undefined, false],
    ['the Front of House Manager\'s role', { role: 'FOH_MANAGER' }, true],
    ['the Committee role', { role: 'COMMITTEE' }, true],
    ['a permanent Committee role', { role: 'COMMITTEE', expiresAt: null }, true],
    ['the IT Manager\'s role alone', { role: 'ADMIN' }, false],
    ['a Committee role that has lapsed', { role: 'COMMITTEE', expiresAt: NOW - DAY }, false],
  ] as const

  test.each(STANDINGS)('a confirmed duty manager holding %s', async (_, grant, named) => {
    await withDatabase((database) => {
      const house = tonightsPerformance(database)
      const rowan = person(database, 'rowan', 'Rowan Ellis')
      if (grant) granted(database, rowan, grant.role, 'expiresAt' in grant ? grant.expiresAt : undefined)
      shift(database, 'dm', house.performanceId, 'DUTY_MANAGER', rowan)

      expect(asked(database, person(database, 'asker'), house.night, { performanceId: house.performanceId }))
        .toEqual(named ? [{ name: 'Rowan Ellis', onTeam: 0 }] : [])
    })
  })

  test('a duty manager without the role does not hide one with it at the same venue', async () => {
    await withDatabase((database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee', curtainHoursAfterNightStart: 10 })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: matinee.venueId, curtainHoursAfterNightStart: 15 })
      shift(database, 'dm-matinee', matinee.performanceId, 'DUTY_MANAGER', person(database, 'former', 'Former Member'))
      shift(database, 'dm-evening', evening.performanceId, 'DUTY_MANAGER', onCommittee(database, 'rowan', 'Rowan Ellis'))

      expect(asked(database, person(database, 'asker'), matinee.night, { venueId: matinee.venueId }))
        .toEqual([{ name: 'Rowan Ellis', onTeam: 0 }])
    })
  })
})
