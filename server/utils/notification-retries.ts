import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { configValue } from './configuration'
import { resend } from './notify'
import { logRetentionCutoff } from '#shared/utils/notifications'
import type { H3Event } from 'h3'

// A failed send is retried with backoff until it runs out of attempts (H-105, 0058). Nothing
// here inserts: an attempt updates the row the first attempt wrote (0048).

// A run is bounded so a backlog after an outage drains over several, as the hold release and the
// retention sweep are. The cron cadence is what sets the drain rate.
const BATCH_CAP = 100

// The same reasoning for the nightly prune, which walks far older rows.
const PRUNE_CAP = 500

export interface RetryOutcome {
  claimed: number
  sent: number
  failed: number
  gaveUp: number
}

// FAILED only, never a terminal status: a muted topic (SUPPRESSED_PREFERENCE) has nothing to
// retry. Due when `(1 << attempts) - 1` minutes, the same doubling window `retryDueAt()` uses, have passed.
export async function dueForRetry(nowEpoch: number, backoffMinutes: number, maxAttempts: number, limit = BATCH_CAP): Promise<string[]> {
  const rows = await db.all<{ id: string }>(sql`
    SELECT id FROM notification_log
    WHERE status = 'FAILED'
      AND attempts < ${maxAttempts}
      AND retry_payload IS NOT NULL
      AND created_at + ${backoffMinutes * 60} * ((1 << attempts) - 1) <= ${nowEpoch}
    ORDER BY created_at
    LIMIT ${limit}
  `)
  return rows.map(row => row.id)
}

// The claim is the update, so two runs cannot both take the same row: the second changes nothing
// because the status has already moved (0003, 0049).
async function claimForRetry(id: string): Promise<boolean> {
  const taken = await db.all<{ changes: number }>(sql`
    UPDATE notification_log SET status = 'RETRYING' WHERE id = ${id} AND status = 'FAILED'
      RETURNING id
  `)
  return taken.length === 1
}

export async function retryDueNotifications(event: H3Event | undefined, now = new Date()): Promise<RetryOutcome> {
  const maxAttempts = await configValue(event, 'NOTIFICATION_MAX_ATTEMPTS')
  const backoffMinutes = await configValue(event, 'NOTIFICATION_RETRY_BACKOFF_MINUTES')
  const nowEpoch = Math.floor(now.getTime() / 1000)

  const outcome: RetryOutcome = { claimed: 0, sent: 0, failed: 0, gaveUp: 0 }

  for (const id of await dueForRetry(nowEpoch, backoffMinutes, maxAttempts)) {
    if (!await claimForRetry(id)) continue
    outcome.claimed += 1

    const status = await resend(event, id, maxAttempts)
    if (status === 'SENT') outcome.sent += 1
    else if (status === 'FAILED_FINAL') outcome.gaveUp += 1
    else outcome.failed += 1
  }

  return outcome
}

// Rows past the configured retention period. The log feeds a subject access request, so this is
// a retention period rather than a tidy-up, and the period is in the data model (H-105).
export async function pruneNotificationLog(event: H3Event | undefined, now = new Date()): Promise<number> {
  const months = await configValue(event, 'NOTIFICATION_LOG_RETENTION_MONTHS')
  const cutoff = logRetentionCutoff(Math.floor(now.getTime() / 1000), months)

  // Scoped by subquery rather than by an id list from a result set, and capped so the first run
  // after a long gap drains over several nights (0003, 0006).
  const pruned = await db.all<{ id: string }>(sql`
    DELETE FROM notification_log
    WHERE id IN (SELECT id FROM notification_log WHERE created_at < ${cutoff} LIMIT ${PRUNE_CAP})
    RETURNING id
  `)
  return pruned.length
}
