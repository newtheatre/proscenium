import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { configValue } from './configuration'
import { notify } from './notify'
import { DIGEST_TOPIC_NOUN, DIGEST_TYPE_FOR_TOPIC, NOTIFICATION_TOPICS } from '#shared/utils/notifications'
import type { NotificationTopic } from '#shared/utils/senders'
import type { H3Event } from 'h3'

// H-104. The sweep flushes every topic+person pair whose window has passed into one email,
// claiming entries the way the retry sweep claims a row: a conditional UPDATE, not a read (0003).

// Bounded per topic per run, the same reasoning as every other sweep's cap: a backlog drains over
// several runs rather than one huge batch.
const BATCH_CAP = 100

interface DueRow { userId: string }

// Grouped by person because a digest is per person per topic; the window is per topic, read once
// per topic rather than once per row (H-104 criterion 2).
async function dueUsers(topic: NotificationTopic, windowMinutes: number, nowEpoch: number): Promise<string[]> {
  const rows = await db.all<DueRow>(sql`
    SELECT user_id AS userId FROM notification_digest_entries
    WHERE topic = ${topic} AND digest_log_id IS NULL
    GROUP BY user_id
    HAVING MIN(created_at) + ${windowMinutes * 60} <= ${nowEpoch}
    LIMIT ${BATCH_CAP}
  `)
  return rows.map(row => row.userId)
}

interface ClaimedEntry { subject: string, body: string }

// The claim: every unclaimed entry for this topic and person moves under one digest id at once,
// so a second overlapping run finds nothing left to claim (0003, 0048).
async function claimEntries(topic: NotificationTopic, userId: string, digestLogId: string): Promise<ClaimedEntry[]> {
  return db.all<ClaimedEntry>(sql`
    UPDATE notification_digest_entries SET digest_log_id = ${digestLogId}
    WHERE topic = ${topic} AND user_id = ${userId} AND digest_log_id IS NULL
    RETURNING subject, body
  `)
}

// Five scalar keys, one call each, rather than one record key: a setting is a rule, and a keyed
// record is a table in a blob (0025). The literal calls are what the enforced-keys test reads.
async function windowMinutes(event: H3Event | undefined): Promise<Record<NotificationTopic, number>> {
  const [BOOKINGS, SHIFTS, TRAINING, ROOMS, ANNOUNCEMENTS] = await Promise.all([
    configValue(event, 'NOTIFICATION_DIGEST_WINDOW_BOOKINGS_MINUTES'),
    configValue(event, 'NOTIFICATION_DIGEST_WINDOW_SHIFTS_MINUTES'),
    configValue(event, 'NOTIFICATION_DIGEST_WINDOW_TRAINING_MINUTES'),
    configValue(event, 'NOTIFICATION_DIGEST_WINDOW_ROOMS_MINUTES'),
    configValue(event, 'NOTIFICATION_DIGEST_WINDOW_ANNOUNCEMENTS_MINUTES'),
  ])
  return { BOOKINGS, SHIFTS, TRAINING, ROOMS, ANNOUNCEMENTS }
}

export async function sendDueDigests(event: H3Event | undefined, now = new Date()): Promise<number> {
  const nowEpoch = Math.floor(now.getTime() / 1000)
  const windows = await windowMinutes(event)
  let sent = 0

  for (const topic of NOTIFICATION_TOPICS) {
    for (const userId of await dueUsers(topic, windows[topic], nowEpoch)) {
      const digestLogId = crypto.randomUUID().replaceAll('-', '')
      const entries = await claimEntries(topic, userId, digestLogId)
      if (entries.length === 0) continue

      await notify(event, {
        id: digestLogId,
        type: DIGEST_TYPE_FOR_TOPIC[topic],
        userId,
        context: { name: '', noun: DIGEST_TOPIC_NOUN[topic], entries },
      })
      sent += 1
    }
  }
  return sent
}

// No foreign key ties `digest_log_id` to `notification_log` (0061), so a claimed entry outlives
// its send until this notices; scoped by subquery and capped, never an id list (0003, 0006).
export async function pruneOrphanedDigestEntries(): Promise<number> {
  const pruned = await db.all<{ id: string }>(sql`
    DELETE FROM notification_digest_entries
    WHERE id IN (
      SELECT id FROM notification_digest_entries
      WHERE digest_log_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM notification_log WHERE notification_log.id = notification_digest_entries.digest_log_id)
      LIMIT ${BATCH_CAP}
    )
    RETURNING id
  `)
  return pruned.length
}
