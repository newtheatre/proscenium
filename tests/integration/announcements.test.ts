import { describe, expect, test } from 'bun:test'
import {
  allCurrentMembersQuery,
  roleHoldersQuery,
  sessionSignupsQuery,
  tonightsRotaQuery,
} from '#server/utils/announcements'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Admin fan-out audience resolution (H-108), against the real migrations. Each query is proved
// to exclude an anonymised row, the H-107 guarantee a fan-out cannot enumerate one by mistake.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

let personSeq = 0

function person(database: TestDatabase, over: { anonymisedAt?: number } = {}): string {
  const id = `u-${++personSeq}`
  database.batch([['INSERT INTO users (id, name, email, verified, anonymised_at) VALUES (?, ?, ?, 1, ?)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`, over.anonymisedAt ?? null]])
  return id
}

describe('all current members (criterion 1)', () => {
  test('a term inside the grace window is current; an anonymised one is never enumerated', async () => {
    await withDatabase(async (database) => {
      const current = person(database)
      const gone = person(database, { anonymisedAt: 1_700_000_000 })
      const never = person(database)

      database.batch([
        ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
          'm-1', current, '2020-01-01', '2099-01-01', 'MANUAL'],
        ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
          'm-2', gone, '2020-01-01', '2099-01-01', 'MANUAL'],
      ])

      const ids = read<{ id: string }>(database, allCurrentMembersQuery('2026-01-01', 14)).map(row => row.id)
      expect(ids).toContain(current)
      expect(ids).not.toContain(gone)
      expect(ids).not.toContain(never)
    })
  })
})

describe('role holders (criterion 1)', () => {
  test('a live grant qualifies; an expired one and an anonymised holder do not', async () => {
    await withDatabase(async (database) => {
      const live = person(database)
      const expired = person(database)
      const anonymised = person(database, { anonymisedAt: 1_700_000_000 })

      database.batch([
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-1', live, 'BAR_MANAGER', null],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-2', expired, 'BAR_MANAGER', 1_000],
        ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'g-3', anonymised, 'BAR_MANAGER', null],
      ])

      const ids = read<{ id: string }>(database, roleHoldersQuery('BAR_MANAGER', 1_700_000_000)).map(row => row.id)
      expect(ids).toEqual([live])
    })
  })
})

describe('tonight\'s rota (criterion 1)', () => {
  test('a confirmed or claimed slot qualifies; a declined one does not', async () => {
    await withDatabase(async (database) => {
      const tonight = tonightsPerformance(database)
      const confirmed = person(database)
      const declined = person(database)

      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
          'sh-1', tonight.performanceId, 'BAR', 1, confirmed, 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
          'sh-2', tonight.performanceId, 'BAR', 2, declined, 'DECLINED'],
      ])

      const ids = read<{ id: string }>(database, tonightsRotaQuery(tonight.night)).map(row => row.id)
      expect(ids).toEqual([confirmed])
    })
  })
})

describe('a session\'s sign-ups (criterion 1)', () => {
  test('signed up qualifies; cancelled does not', async () => {
    await withDatabase(async (database) => {
      const trainer = person(database)
      const signedUp = person(database)
      const cancelled = person(database)

      database.batch([
        [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id)
          VALUES (?, ?, ?, ?, ?, ?)`, 'ts-1', '2026-01-01', '18:00', '20:00', 10, trainer],
        ['INSERT INTO session_attendees (id, session_id, user_id, status) VALUES (?, ?, ?, ?)',
          'sa-1', 'ts-1', signedUp, 'SIGNED_UP'],
        ['INSERT INTO session_attendees (id, session_id, user_id, status) VALUES (?, ?, ?, ?)',
          'sa-2', 'ts-1', cancelled, 'CANCELLED'],
      ])

      const ids = read<{ id: string }>(database, sessionSignupsQuery('ts-1')).map(row => row.id)
      expect(ids).toEqual([signedUp])
    })
  })
})
