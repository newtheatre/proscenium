import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { daysAfter, londonDay } from '#shared/utils/membership'
import { MESSAGE_TYPES } from '#shared/utils/notifications'
import { startOfLondonDay } from '#shared/utils/london'
import type { DailyCount, PersonHistoryRow, SendLogFilters, SendLogRow } from '#shared/utils/notification-log'
import type { SQL } from 'drizzle-orm'

// The operations view of what was sent (H-106), read-only over the log H-105 writes. Never
// touches the schema or the retry machinery in notification-retries.ts, both H-105's own.

// The catalogue is fixed at build time, so this is a bounded list from configuration, never an
// `IN` list sized by a result set (CONTRIBUTING).
function typesForTopic(topic: string): string[] {
  return Object.entries(MESSAGE_TYPES)
    .filter(([, type]) => type.topic === topic)
    .map(([name]) => name)
}

// `to` is the last day included, so the bound is midnight the day after (0014).
function dateWindow(from?: string, to?: string): { fromAt?: number, toAt?: number } {
  return {
    fromAt: from ? Math.floor(startOfLondonDay(from).getTime() / 1000) : undefined,
    toAt: to ? Math.floor(startOfLondonDay(daysAfter(to, 1)).getTime() / 1000) : undefined,
  }
}

function sendLogPredicate(filters: SendLogFilters): SQL {
  const terms: SQL[] = []
  if (filters.type) terms.push(sql`l.type = ${filters.type}`)
  if (filters.topic) {
    const types = typesForTopic(filters.topic)
    terms.push(types.length ? sql`l.type IN (${sql.join(types.map(name => sql`${name}`), sql`, `)})` : sql`1 = 0`)
  }
  if (filters.channel) terms.push(sql`l.channel = ${filters.channel}`)
  if (filters.status) terms.push(sql`l.status = ${filters.status}`)
  const { fromAt, toAt } = dateWindow(filters.from, filters.to)
  if (fromAt !== undefined) terms.push(sql`l.created_at >= ${fromAt}`)
  if (toAt !== undefined) terms.push(sql`l.created_at < ${toAt}`)
  return terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``
}

// Allow-listed columns: a subject line and a provider error, but never `retry_payload`, which
// H-105 stores only to replay a send and never to answer this or any other read (0056).
export function sendLogQuery(filters: SendLogFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT l.id AS id, l.user_id AS userId, u.name AS recipientName, l.type AS type,
           l.channel AS channel, l.status AS status, l.subject AS subject, l.error AS error,
           l.created_at AS createdAt, l.sent_at AS sentAt
    FROM notification_log l
    LEFT JOIN users u ON u.id = l.user_id${sendLogPredicate(filters)}
    ORDER BY l.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countSendLogQuery(filters: SendLogFilters): SQL {
  return sql`
    SELECT count(*) AS total
    FROM notification_log l${sendLogPredicate(filters)}
  `
}

export async function sendLog(filters: SendLogFilters, limit: number, offset: number): Promise<SendLogRow[]> {
  return db.all<SendLogRow>(sendLogQuery(filters, limit, offset))
}

export async function countSendLog(filters: SendLogFilters): Promise<number> {
  const [row] = await db.all<{ total: number }>(countSendLogQuery(filters))
  return Number(row?.total ?? 0)
}

// Types, dates and outcomes only, matching criterion 3: never the subject or the provider error,
// either of which can carry what the message was actually about.
export function personHistoryQuery(userId: string, type: string | undefined, limit: number, offset: number): SQL {
  return sql`
    SELECT l.id AS id, l.type AS type, l.channel AS channel, l.status AS status,
           l.created_at AS createdAt, l.sent_at AS sentAt
    FROM notification_log l
    WHERE l.user_id = ${userId}${type ? sql` AND l.type = ${type}` : sql``}
    ORDER BY l.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countPersonHistoryQuery(userId: string, type: string | undefined): SQL {
  return sql`SELECT count(*) AS total FROM notification_log WHERE user_id = ${userId}${type ? sql` AND type = ${type}` : sql``}`
}

export async function personHistory(userId: string, type: string | undefined, limit: number, offset: number): Promise<PersonHistoryRow[]> {
  return db.all<PersonHistoryRow>(personHistoryQuery(userId, type, limit, offset))
}

export async function countPersonHistory(userId: string, type: string | undefined): Promise<number> {
  const [row] = await db.all<{ total: number }>(countPersonHistoryQuery(userId, type))
  return Number(row?.total ?? 0)
}

// One bucket per London civil day (0014): a UTC `date()` reads a BST evening as the wrong day,
// so each boundary is computed here rather than left to SQLite's own date function.
function dayBuckets(days: number, now: Date): { day: string, fromAt: number, toAt: number }[] {
  const today = londonDay(now)
  return Array.from({ length: days }, (_, i) => {
    const day = daysAfter(today, -(days - 1) + i)
    return {
      day,
      fromAt: Math.floor(startOfLondonDay(day).getTime() / 1000),
      toAt: Math.floor(startOfLondonDay(daysAfter(day, 1)).getTime() / 1000),
    }
  })
}

// Daily counts by type and outcome (criterion 4), bucketed in one pass so an outage shows as a
// dip rather than needing a query per day.
export function dailyCountsQuery(days: number, now = new Date()): SQL {
  const buckets = dayBuckets(days, now)
  const cases = sql.join(
    buckets.map(bucket => sql`WHEN l.created_at >= ${bucket.fromAt} AND l.created_at < ${bucket.toAt} THEN ${bucket.day}`),
    sql` `,
  )
  return sql`
    SELECT day, type, status, count(*) AS count
    FROM (
      SELECT (CASE ${cases} END) AS day, l.type AS type, l.status AS status
      FROM notification_log l
      WHERE l.created_at >= ${buckets[0]!.fromAt} AND l.created_at < ${buckets[buckets.length - 1]!.toAt}
    )
    WHERE day IS NOT NULL
    GROUP BY day, type, status
    ORDER BY day
  `
}

export async function dailyCounts(days: number, now = new Date()): Promise<DailyCount[]> {
  return db.all<DailyCount>(dailyCountsQuery(days, now))
}
