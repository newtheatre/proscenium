import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm'

/**
 * Closes any performance nobody signed off by noon the next day, so a gap is
 * visible rather than silent (docs/12 §4.1).
 */
export default defineTask({
  meta: {
    name: 'reports:auto-close',
    description: 'Auto-close performances with no duty manager sign-off',
  },
  async run() {
    const now = new Date()
    // Recent only: a nightly job, not a backfill of a decade of imported shows.
    const window = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const candidates = await db.select({
      id: schema.performances.id,
      startsAt: schema.performances.startsAt,
    })
      .from(schema.performances)
      .leftJoin(schema.performanceReports, eq(schema.performanceReports.performanceId, schema.performances.id))
      .where(and(
        lt(schema.performances.startsAt, now),
        gt(schema.performances.startsAt, window),
        ne(schema.performances.status, 'CANCELLED'),
        isNull(schema.performanceReports.id),
      ))
      .limit(20)

    // A previous show night, in Europe/London. The noon cron supplies the
    // deadline; this decides whose deadline has actually passed.
    const today = showNightDate(now)
    const pending = candidates.filter(p => showNightDate(p.startsAt) < today)

    let closed = 0
    for (const performance of pending) {
      try {
        // The unique index makes a second run a no-op rather than a duplicate.
        await closeNight({
          performanceId: performance.id,
          closedByUserId: null,
          autoClosed: true,
          closingNote: null,
          checklist: null,
        })
        closed++
      }
      catch (error) {
        console.error(`[reports:auto-close] ${performance.id}:`, error)
      }
    }

    console.log(`[reports:auto-close] closed ${closed} of ${pending.length} unclosed performances`)
    return { result: `closed ${closed}` }
  },
})
