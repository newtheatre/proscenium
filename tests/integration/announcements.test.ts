import { describe, expect, test } from 'bun:test'
import {
  allCurrentMembersQuery,
  announceSessionsQuery,
  heldForDigest,
  roleHoldersQuery,
  sessionSignupsQuery,
  tonightsRotaQuery,
} from '#server/utils/announcements'
import { saysAudienceCount } from '#shared/utils/announcements'
import { joinsDigest, messageType } from '#shared/utils/notifications'
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

// H-104 criterion 1, 0061: the two types the composer sends take different paths, and the screen
// must say which one happened rather than claiming a send the log has no row for.
describe('a plain announcement is held for the digest, a safety notice is sent', () => {
  test('the catalogue holds the plain type and never the safety notice', () => {
    expect(joinsDigest(messageType('admin.announcement'), false, false)).toBe(true)
    expect(joinsDigest(messageType('admin.safety-notice'), false, false)).toBe(false)
  })

  test('the tally counts the held outcomes, and a safety notice leaves it at zero', () => {
    expect(heldForDigest([
      { recipientId: 'u-a', status: 'HELD_FOR_DIGEST' },
      { recipientId: 'u-b', status: 'HELD_FOR_DIGEST' },
      { recipientId: 'u-c', status: 'SUPPRESSED_PREFERENCE' },
    ])).toBe(2)
    expect(heldForDigest([
      { recipientId: 'u-a', status: 'SENT' },
      { recipientId: 'u-b', status: 'SENT' },
    ])).toBe(0)
  })

  test('a held announcement is a digest entry with no send-log row; a safety notice is a SENT row', async () => {
    await withDatabase((database) => {
      const held = person(database)
      const sent = person(database)

      database.batch([
        [`INSERT INTO notification_digest_entries (id, user_id, topic, type, subject, body, created_at)
          VALUES (?, ?, 'ANNOUNCEMENTS', 'admin.announcement', 'A notice', 'It happened.', ?)`,
        'de-1', held, 1_700_000_000],
        [`INSERT INTO notification_log (id, user_id, type, channel, status, sent_at)
          VALUES (?, ?, 'admin.safety-notice', 'EMAIL', 'SENT', ?)`, 'nl-1', sent, 1_700_000_000],
      ])

      expect(rows(database, `SELECT user_id FROM notification_log WHERE type = 'admin.announcement'`)).toEqual([])
      expect(rows(database, `SELECT user_id FROM notification_log WHERE type = 'admin.safety-notice'`))
        .toEqual([{ user_id: sent }])
      expect(rows(database, `SELECT user_id, digest_log_id FROM notification_digest_entries`))
        .toEqual([{ user_id: held, digest_log_id: null }])
    })
  })
})

// H-924: the announce composer's session picker searches what a session teaches or its date.
describe('the announce composer\'s session picker (H-924)', () => {
  test('finds a session by what it teaches, and by its date, but not by an unrelated term', async () => {
    await withDatabase(async (database) => {
      const trainer = person(database)
      database.batch([
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
        ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-1', 'TECH', 'MODULE', 'Fire safety orientation'],
        [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id)
          VALUES (?, ?, ?, ?, ?, ?)`, 'ts-2', '2026-03-14', '18:00', '20:00', 10, trainer],
        ['INSERT INTO session_modules (id, session_id, module_id) VALUES (?, ?, ?)', 'sm-1', 'ts-2', 'TECH-1'],
      ])

      const byTitle = read<{ id: string, title: string }>(database, announceSessionsQuery('fire safety'))
      expect(byTitle.map(row => row.id)).toEqual(['ts-2'])
      expect(byTitle[0]!.title).toBe('Fire safety orientation')

      const byDate = read<{ id: string }>(database, announceSessionsQuery('2026-03-14'))
      expect(byDate.map(row => row.id)).toEqual(['ts-2'])

      expect(read(database, announceSessionsQuery('rigging'))).toEqual([])
    })
  })
})

// Criterion 7: the count a composer is shown before writing anything is the same resolution a
// send uses, so it can never quote a number the send would not reach.
describe('the audience count is the audience (criterion 7)', () => {
  test('the count matches the rows the same query resolves', async () => {
    await withDatabase((database) => {
      const current = person(database)
      const gone = person(database, { anonymisedAt: 1_700_000_000 })

      database.batch([
        ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
          'm-count-1', current, '2020-01-01', '2099-01-01', 'MANUAL'],
        ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, ?, ?, ?)',
          'm-count-2', gone, '2020-01-01', '2099-01-01', 'MANUAL'],
      ])

      const ids = read<{ id: string }>(database, allCurrentMembersQuery('2026-01-01', 14)).map(row => row.id)
      expect(ids).toEqual([current])
      expect(saysAudienceCount(ids.length)).toBe('1 person will get this')
    })
  })

  test('an audience nobody is in says so rather than reading as nought people', async () => {
    await withDatabase((database) => {
      person(database)
      const ids = read<{ id: string }>(database, allCurrentMembersQuery('2026-01-01', 14))
      expect(ids).toHaveLength(0)
      expect(saysAudienceCount(ids.length)).toBe('Nobody is in this audience')
    })
  })
})
