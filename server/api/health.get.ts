import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import journal from '#server/db/migrations/sqlite/meta/_journal.json'
import { coversThrough, lastCovered, londonDate } from '#shared/utils/working-days'
import type { H3Event } from 'h3'

// Deliberately public: monitoring holds no session. 503 whenever the schema is behind the
// code, naming the pending files (K-107).
export default defineEventHandler(async (event) => {
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

  if (pending.length || sessionKey === 'missing') {
    setResponseStatus(event, 503)
    return { ok: false, pendingMigrations: pending, sessionKey, bankHolidays }
  }

  return { ok: true, sessionKey, bankHolidays }
})

// Reported, never a 503: a calendar running out refuses requests near the horizon rather than
// breaking the deploy, and the point is to say so before anybody is refused (C-121, 0038).
async function holidayCoverage(event: H3Event): Promise<{ ok: boolean, coveredTo: string | null, neededTo: string }> {
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
