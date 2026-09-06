import { db } from '@nuxthub/db'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import journal from '#server/db/migrations/sqlite/meta/_journal.json'
import { formatLondon } from '#shared/utils/london'
import { isSustainedlyUnhealthy } from '#shared/utils/health'
import { pendingMigrations } from '#shared/utils/migrations'
import { coversThrough, lastCovered, londonDate } from '#shared/utils/working-days'
import type { H3Event } from 'h3'

export interface HealthStatus {
  ok: boolean
  pendingMigrations: string[]
  sessionKey: 'ok' | 'missing'
  bankHolidays: { ok: boolean, coveredTo: string | null, neededTo: string }
}

// The same check /api/health answers with, reused by the sustained-unhealthiness task so
// neither can drift from what the public endpoint reports (J-106).
export async function healthStatus(event?: H3Event): Promise<HealthStatus> {
  // A failed Secrets Store read would otherwise be invisible: every session reads as signed
  // out and nothing else notices (0007).
  const sessionKey = useRuntimeConfig(event).session.password ? 'ok' : 'missing'

  const expected = journal.entries.map((entry: { tag: string }) => entry.tag)
  let pending: string[]

  try {
    // Raw SQL on purpose: NuxtHub owns this table, so declaring it in the Drizzle schema
    // would make `nuxt db generate` try to create it.
    const rows = await db.all<{ name: string }>(sql`select name from _hub_migrations`)
    pending = pendingMigrations(expected, rows.map(row => row.name))
  }
  catch (error) {
    // No ledger table means nothing has ever been applied here.
    console.error('[health] could not read _hub_migrations:', error)
    pending = expected
  }

  const bankHolidays = await holidayCoverage(event)

  return { ok: pending.length === 0 && sessionKey === 'ok', pendingMigrations: pending, sessionKey, bankHolidays }
}

// Reported, never what fails the check: a calendar running out is said before anybody is
// refused (C-121, 0038), so it is not part of `ok` above.
async function holidayCoverage(event?: H3Event): Promise<{ ok: boolean, coveredTo: string | null, neededTo: string }> {
  try {
    const holidays = await configValue(event, 'BANK_HOLIDAYS')
    const weeks = await configValue(event, 'ROOM_BOOKING_HORIZON_WEEKS')
    const horizon = new Date(Date.now() + weeks * 7 * 86_400_000)

    return { ok: coversThrough(holidays, horizon), coveredTo: lastCovered(holidays), neededTo: londonDate(horizon) }
  }
  catch (error) {
    console.error('[health] could not read the bank holiday list:', error)
    return { ok: false, coveredTo: null, neededTo: '' }
  }
}

async function liveAdmins(): Promise<{ id: string }[]> {
  const live = or(isNull(schema.roleGrants.expiresAt), sql`${schema.roleGrants.expiresAt} > unixepoch()`)
  return db.select({ id: schema.roleGrants.userId })
    .from(schema.roleGrants)
    .where(and(eq(schema.roleGrants.role, 'ADMIN'), live))
}

export type WatchOutcome = 'healthy' | 'opened' | 'ongoing' | 'notified' | 'closed'

// Opens an incident on the first unhealthy check, notifies once the window has passed, and
// closes it the moment a check recovers, so the next failure alerts again from cold (J-106).
export async function watchHealth(event: H3Event | undefined, now = new Date()): Promise<WatchOutcome> {
  const status = await healthStatus(event)
  const nowSeconds = Math.floor(now.getTime() / 1000)

  const [open] = await db.select({ id: schema.healthIncidents.id, openedAt: schema.healthIncidents.openedAt })
    .from(schema.healthIncidents)
    .where(eq(schema.healthIncidents.status, 'OPEN'))
    .limit(1)

  if (status.ok) {
    if (!open) return 'healthy'
    await db.update(schema.healthIncidents)
      .set({ status: 'CLOSED', closedAt: nowSeconds })
      .where(eq(schema.healthIncidents.id, open.id))
    return 'closed'
  }

  if (!open) {
    // The predicate rather than a caught unique-violation: a race here writes nothing, never
    // throws (0003, 0006), though cron triggers do not fire this task concurrently in practice.
    await db.run(sql`
      INSERT INTO health_incidents (id, opened_at)
      SELECT ${newId()}, ${nowSeconds}
      WHERE NOT EXISTS (SELECT 1 FROM health_incidents WHERE status = 'OPEN')
    `)
    return 'opened'
  }

  const windowMinutes = await configValue(event, 'HEALTH_ALERT_WINDOW_MINUTES')
  if (!isSustainedlyUnhealthy(open.openedAt, windowMinutes, nowSeconds)) return 'ongoing'

  const since = formatLondon(new Date(open.openedAt * 1000), { dateStyle: 'long', timeStyle: 'short' })
  for (const admin of await liveAdmins()) {
    const key = `health.alert:${open.id}:${admin.id}`
    if (!await claimNotification({ userId: admin.id, type: 'health.alert', key })) continue
    await notify(event, { type: 'health.alert', userId: admin.id, claim: key, context: { name: '', since } })
  }
  return 'notified'
}
