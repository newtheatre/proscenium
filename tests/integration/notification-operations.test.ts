import { describe, expect, test } from 'bun:test'
import {
  countPersonHistoryQuery,
  countSendLogQuery,
  dailyCountsQuery,
  personHistoryQuery,
  sendLogQuery,
} from '#server/utils/notification-log'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The operations view of what was sent (H-106), against the real migrations. Every filter is
// proved against the schema `notify()` actually writes, never assumed from the shape of the SQL.

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

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

let logSeq = 0

function logged(database: TestDatabase, over: {
  userId?: string | null
  type: string
  channel?: string
  status: string
  subject?: string | null
  error?: string | null
  createdAt: number
  sentAt?: number | null
}): string {
  const id = `n-${++logSeq}`
  database.batch([[
    `INSERT INTO notification_log (id, user_id, type, channel, status, subject, error, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, over.userId ?? null, over.type, over.channel ?? 'EMAIL', over.status,
    over.subject ?? null, over.error ?? null, over.createdAt, over.sentAt ?? null,
  ]])
  return id
}

describe('the send log (criterion 1)', () => {
  test('filters by type, channel and outcome', async () => {
    await withDatabase(async (database) => {
      const alice = person(database, 'u-alice')
      logged(database, { userId: alice, type: 'shift.reminder', channel: 'EMAIL', status: 'SENT', createdAt: 1_700_000_000 })
      logged(database, { userId: alice, type: 'shift.reminder', channel: 'INBOX', status: 'SENT', createdAt: 1_700_000_001 })
      logged(database, { userId: alice, type: 'training.expiry.window', channel: 'EMAIL', status: 'FAILED', createdAt: 1_700_000_002 })

      const byType = read(database, sendLogQuery({ type: 'shift.reminder', page: 1, pageSize: 25 }, 25, 0))
      expect(byType).toHaveLength(2)

      const byChannel = read(database, sendLogQuery({ channel: 'INBOX', page: 1, pageSize: 25 }, 25, 0))
      expect(byChannel).toHaveLength(1)

      const byStatus = read(database, sendLogQuery({ status: 'FAILED', page: 1, pageSize: 25 }, 25, 0))
      expect(byStatus).toHaveLength(1)
    })
  })

  // There is no `topic` column on `notification_log`: 'shift.reminder' carries SHIFTS and
  // 'room.booking.confirmed' carries ROOMS, resolved against the catalogue instead.
  test('filters by topic, resolved from the catalogue rather than a stored column', async () => {
    await withDatabase(async (database) => {
      logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: 1_700_000_000 })
      logged(database, { type: 'room.booking.confirmed', status: 'SENT', createdAt: 1_700_000_001 })

      const shifts = read(database, sendLogQuery({ topic: 'SHIFTS', page: 1, pageSize: 25 }, 25, 0))
      expect(shifts).toHaveLength(1)

      const rooms = read(database, sendLogQuery({ topic: 'ROOMS', page: 1, pageSize: 25 }, 25, 0))
      expect(rooms).toHaveLength(1)
    })
  })

  // Both bounds are computed London days (0014): a row just after midnight London in winter
  // sits on the next UTC day, and a naive `date()` comparison would misplace it.
  test('a date range is a London day window, not a UTC one', async () => {
    await withDatabase(async (database) => {
      // 2026-01-14 23:30 London is 2026-01-14 23:30 UTC (GMT, no offset).
      logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: Math.floor(Date.UTC(2026, 0, 14, 23, 30) / 1000) })
      // The next London day.
      logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: Math.floor(Date.UTC(2026, 0, 15, 1, 0) / 1000) })

      const onlyThe14th = read(database, sendLogQuery({ from: '2026-01-14', to: '2026-01-14', page: 1, pageSize: 25 }, 25, 0))
      expect(onlyThe14th).toHaveLength(1)

      const both = read(database, sendLogQuery({ from: '2026-01-14', to: '2026-01-15', page: 1, pageSize: 25 }, 25, 0))
      expect(both).toHaveLength(2)
    })
  })

  test('the count matches what a page would return unpaged', async () => {
    await withDatabase(async (database) => {
      for (let i = 0; i < 5; i++) logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: 1_700_000_000 + i })

      const [{ total }] = read<{ total: number }>(database, countSendLogQuery({ type: 'shift.reminder', page: 1, pageSize: 25 }))
      expect(total).toBe(5)

      const page = read(database, sendLogQuery({ type: 'shift.reminder', page: 1, pageSize: 2 }, 2, 0))
      expect(page).toHaveLength(2)
    })
  })
})

describe('one person\'s history (criterion 3)', () => {
  test('answers with types, dates and outcomes, and nothing about anybody else', async () => {
    await withDatabase(async (database) => {
      const alice = person(database, 'u-alice')
      const bob = person(database, 'u-bob')
      logged(database, { userId: alice, type: 'shift.reminder', status: 'SENT', subject: 'Alice-only subject', createdAt: 1_700_000_000 })
      logged(database, { userId: bob, type: 'shift.reminder', status: 'SENT', subject: 'Bob-only subject', createdAt: 1_700_000_001 })

      const history = read<{ id: string, type: string, channel: string, status: string }>(database, personHistoryQuery(alice, 25, 0))
      expect(history).toHaveLength(1)
      // The row carries no `subject` and no `error` column at all: never a message body that
      // could name somebody else, matching what the query itself selects.
      expect(Object.keys(history[0]!).sort()).toEqual(['channel', 'createdAt', 'id', 'sentAt', 'status', 'type'].sort())

      const [{ total }] = read<{ total: number }>(database, countPersonHistoryQuery(alice))
      expect(total).toBe(1)
    })
  })
})

describe('daily counts (criterion 4)', () => {
  test('buckets by London day, type and outcome', async () => {
    await withDatabase(async (database) => {
      const day = Math.floor(Date.UTC(2026, 2, 10, 12, 0) / 1000)
      logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: day })
      logged(database, { type: 'shift.reminder', status: 'SENT', createdAt: day + 60 })
      logged(database, { type: 'shift.reminder', status: 'FAILED', createdAt: day + 120 })

      const now = new Date(Date.UTC(2026, 2, 10, 12, 0))
      const counts = read<{ day: string, type: string, status: string, count: number }>(database, dailyCountsQuery(1, now))

      expect(counts).toContainEqual({ day: '2026-03-10', type: 'shift.reminder', status: 'SENT', count: 2 })
      expect(counts).toContainEqual({ day: '2026-03-10', type: 'shift.reminder', status: 'FAILED', count: 1 })
    })
  })

  // A silent outage reads as an empty day, never an error: the window is walked whether or not
  // anything was sent in it.
  test('a day with nothing sent is simply absent, not an error', async () => {
    await withDatabase(async (database) => {
      const now = new Date(Date.UTC(2026, 2, 10, 12, 0))
      const counts = read(database, dailyCountsQuery(3, now))
      expect(counts).toEqual([])
    })
  })
})
