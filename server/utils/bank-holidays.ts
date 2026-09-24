import { db } from '@nuxthub/db'
import { CONFIG_KEYS } from '#shared/utils/config'
import { configChangeDetail } from '#shared/utils/config-audit'
import { fetchGovUkHolidays, mergeHolidays, syncAlertDue, syncStanding } from '#shared/utils/bank-holidays'
import { formatLondon } from '#shared/utils/london'
import { londonDate } from '#shared/utils/working-days'
import { listChangeStatements, syncedStatement, syncFailedStatement, syncHistoryQuery } from './bank-holiday-statements'
import type { SyncFailed, SyncStanding } from '#shared/utils/bank-holidays'
import type { SyncHistoryRow } from './bank-holiday-statements'
import type { H3Event } from 'h3'

// Kept apart from the pure statements because it needs the live `db`, the notification centre and
// the health module, none of which a Bun test may reach (0057).

type Batch = Parameters<typeof db.batch>[0]

export interface SyncStandingWithStreak extends SyncStanding {
  streakStartedAt: number | null
}

export async function bankHolidaySync(now = new Date()): Promise<SyncStandingWithStreak> {
  const [row] = await db.all<SyncHistoryRow>(syncHistoryQuery())
  const history = { syncedAt: row?.synced_at ?? null, failedAt: row?.failed_at ?? null, failure: row?.failure ?? null }
  return { ...syncStanding(history, Math.floor(now.getTime() / 1000)), streakStartedAt: row?.streak_started_at ?? null }
}

export type SyncOutcome
  = | { ok: true, dates: number, coveredTo: string | null, changed: boolean }
    | (SyncFailed & { alerted: number })

// Replaces the list only on a valid response; any failure leaves it exactly as it was and is
// recorded instead (C-121 criterion 7, 0091). `actorId` is who asked, null for the cron.
export async function syncBankHolidays(
  event: H3Event | undefined,
  actorId: string | null,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<SyncOutcome> {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const feed = await fetchGovUkHolidays(fetcher, londonDate(now))
  if (!feed.ok) return failed(event, actorId, feed, now)

  const stored = await configValue(event, 'BANK_HOLIDAYS')
  const merged = mergeHolidays(stored, feed.dates)
  if (!CONFIG_KEYS.BANK_HOLIDAYS.schema.safeParse(merged).success) {
    return failed(event, actorId, { ok: false, failure: 'invalid' }, now)
  }

  const changed = JSON.stringify(merged) !== JSON.stringify(stored)
  const statements = changed
    ? listChangeStatements(merged, await configChangeDetail('BANK_HOLIDAYS', stored, merged), nowSeconds)
    : []
  statements.push(syncedStatement(actorId, merged, nowSeconds))

  try {
    await db.batch(statements.map(statement => db.run(statement)) as unknown as Batch)
  }
  catch (error) {
    console.error('[bank-holidays] could not write the synced list:', error)
    return failed(event, actorId, { ok: false, failure: 'write' }, now)
  }

  return { ok: true, dates: merged.length, coveredTo: merged.at(-1) ?? null, changed }
}

async function failed(event: H3Event | undefined, actorId: string | null, failure: SyncFailed, now: Date): Promise<SyncOutcome> {
  console.warn(`[bank-holidays] sync failed: ${failure.failure}${failure.status ? ` ${failure.status}` : ''}`)
  await db.run(syncFailedStatement(actorId, failure, Math.floor(now.getTime() / 1000)))
  return { ...failure, alerted: await alertIfSustained(event, now) }
}

// Once per person per failure streak, claimed like any other send (0048); a success ends the
// streak, so the next failure alerts again from cold (C-121 criterion 9).
async function alertIfSustained(event: H3Event | undefined, now: Date): Promise<number> {
  const standing = await bankHolidaySync(now)
  if (!syncAlertDue(standing.streakStartedAt, Math.floor(now.getTime() / 1000))) return 0

  const since = formatLondon(new Date(standing.streakStartedAt! * 1000), { dateStyle: 'long', timeStyle: 'short' })
  let alerted = 0
  for (const admin of await liveAdmins()) {
    const key = `bank-holidays.sync-failed:${standing.streakStartedAt}:${admin.id}`
    if (!await claimNotification({ userId: admin.id, type: 'bank-holidays.sync-failed', key })) continue
    await notify(event, { type: 'bank-holidays.sync-failed', userId: admin.id, claim: key, context: { name: '', since } })
    alerted++
  }
  return alerted
}
